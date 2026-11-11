// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import { submitTextField, syncDocumentTitle } from '../../src/dom/todo-controls.js';

test('제출 시 현재 입력값의 양끝을 다듬고 유효한 입력만 처리한다', () => {
  const form = document.createElement('form');
  form.innerHTML = '<input name="title">';
  const input = form.elements.namedItem('title');
  const submit = vi.fn();
  form.addEventListener('submit', submitTextField('title', submit));

  input.value = '   ';
  expect(form.dispatchEvent(new Event('submit', { cancelable: true }))).toBe(false);
  expect(submit).not.toHaveBeenCalled();

  input.value = '  오늘의 할 일  ';
  expect(form.dispatchEvent(new Event('submit', { cancelable: true }))).toBe(false);
  expect(submit).toHaveBeenCalledExactlyOnceWith('오늘의 할 일');
  expect(input.value).toBe('');
});

test('컨테이너가 속한 문서의 제목을 동기화하고 cleanup에서 복원한다', () => {
  const owner = document.implementation.createHTMLDocument('기존 제목');
  const cleanup = syncDocumentTitle(owner.body, '할 일 1/2 완료');
  expect(owner.title).toBe('할 일 1/2 완료');
  cleanup();
  expect(owner.title).toBe('기존 제목');
});
