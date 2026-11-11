// @vitest-environment jsdom

import { afterEach, expect, test } from 'vitest';
import page from '../../todo.html?raw';
import { startTodo } from '../../src/app/todo.js';

let stop;
afterEach(() => {
  stop?.();
  stop = undefined;
});

function mountTodo() {
  const template = new DOMParser().parseFromString(page, 'text/html');
  document.title = template.title;
  document.body.innerHTML = template.body.innerHTML;
  const container = document.getElementById('todo-app');
  stop = startTodo(container);
  const input = container.querySelector('input');
  const submit = container.querySelector('button[type="submit"]');
  const filters = Array.from(container.querySelectorAll('.todo-filters button'));
  const summary = container.querySelector('[role="status"]');

  return {
    container, input, summary,
    add(title) {
      input.value = title;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      submit.click();
    },
    select(label) {
      const button = filters.find((button) => button.textContent === label);
      button.click();
      expect(button.getAttribute('aria-pressed')).toBe('true');
    },
    titles: () => Array.from(container.querySelectorAll('.todo-text'), (text) => text.textContent),
    toggle: (index) => container.querySelectorAll('.todo-toggle')[index],
    remove: (index) => container.querySelectorAll('.todo-remove')[index].click(),
  };
}

test('추가부터 마지막 삭제까지 실제 DOM 이벤트로 갱신하고 완료 수와 제목을 동기화한다', () => {
  const { container, input, summary, add, select, titles, toggle, remove } = mountTodo();
  const list = container.querySelector('ul');
  expect(list.textContent).toBe('표시할 할 일이 없어요.');
  expect(summary.textContent).toBe('전체 0개 중 0개 완료');

  add('  자료 정리  ');
  add('회의 준비');
  expect(titles()).toEqual(['자료 정리', '회의 준비']);
  expect(input.value).toBe('');
  const secondButton = toggle(1);

  toggle(0).click();
  expect(toggle(0).getAttribute('aria-pressed')).toBe('true');
  expect(toggle(1)).toBe(secondButton);
  expect(summary.textContent).toBe('전체 2개 중 1개 완료');
  expect(document.title).toBe('할 일 1/2 완료 · Mini React');

  input.value = '작성 중';
  select('완료');
  expect(titles()).toEqual(['자료 정리']);
  expect(summary.textContent).toBe('전체 2개 중 1개 완료');
  select('미완료');
  expect(titles()).toEqual(['회의 준비']);
  expect(container.querySelector('input')).toBe(input);
  expect(input.value).toBe('작성 중');

  select('전체');
  toggle(0).click();
  expect(toggle(0).getAttribute('aria-pressed')).toBe('false');
  remove(1);
  remove(0);
  expect(container.querySelector('ul')).toBe(list);
  expect(container.querySelector('[role="status"]')).toBe(summary);
  expect(list.textContent).toBe('표시할 할 일이 없어요.');
  expect(summary.textContent).toBe('전체 0개 중 0개 완료');

  stop();
  expect(container.firstChild).toBeNull();
  expect(document.title).toBe('Mini React · 할 일');
});

test('공백은 건너뛰고 같은 제목과 HTML처럼 보이는 제목은 각각의 텍스트 항목으로 추가한다', () => {
  const { container, summary, add, titles, toggle, remove } = mountTodo();
  add('');
  add('  ');
  expect(titles()).toEqual([]);

  const literal = '<img src=x>';
  add(literal);
  add(literal);
  expect(titles()).toEqual([literal, literal]);
  expect(container.querySelector('img')).toBeNull();

  toggle(0).click();
  remove(0);
  expect(titles()).toEqual([literal]);
  expect(toggle(0).getAttribute('aria-pressed')).toBe('false');
  toggle(0).click();
  expect(summary.textContent).toBe('전체 1개 중 1개 완료');
});
