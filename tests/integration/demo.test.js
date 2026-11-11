// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import page from '../../lab.html?raw';
import { startDemo } from '../../src/app/main.js';

function mountDemo() {
  document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
  const actual = document.getElementById('actual');
  const draft = document.getElementById('test');
  const patch = document.getElementById('patch');
  const undo = document.getElementById('undo');
  const redo = document.getElementById('redo');
  const status = document.getElementById('status');
  const viewToggle = document.getElementById('view-toggle');
  const actualCode = document.getElementById('actual-code');
  const draftCode = document.getElementById('test-code');
  const stop = startDemo({
    actual, test: draft, patchButton: patch, undoButton: undo, redoButton: redo, status,
    sourceView: { toggle: viewToggle, actualCode, draftCode },
  });

  function editTitle(title) {
    draft.querySelector('h3').textContent = title;
    draft.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return { actual, draft, patch, undo, redo, status, stop, editTitle, viewToggle, actualCode, draftCode };
}

test('두 영역을 HTML 보기로 전환하고 테스트 코드로 태그와 속성을 편집한다', () => {
  const { actual, draft, patch, status, viewToggle, actualCode, draftCode } = mountDemo();
  const root = actual.firstChild;
  const list = actual.querySelector('ul');
  expect(viewToggle.getAttribute('aria-checked')).toBe('false');
  viewToggle.click();
  expect(actual.hidden).toBe(true);
  expect(draft.hidden).toBe(true);
  expect(viewToggle.getAttribute('aria-checked')).toBe('true');
  expect(actualCode.hidden).toBe(false);
  expect(actualCode.readOnly).toBe(true);
  expect(draftCode.readOnly).toBe(false);
  expect(draftCode.value).toBe(actualCode.value);

  draftCode.value = `\n${draftCode.value.replace('<h3>오늘의 작업</h3>', '<h4 class="changed">새 제목</h4>')}\n`;
  viewToggle.click();
  expect(viewToggle.getAttribute('aria-checked')).toBe('false');
  expect(draftCode.hidden).toBe(true);
  expect(draft.hidden).toBe(false);
  expect(draft.querySelector('h4.changed').textContent).toBe('새 제목');
  expect(actual.querySelector('h3').textContent).toBe('오늘의 작업');
  expect(status.textContent).toContain('상태 1 / 1');

  viewToggle.click();
  expect(draftCode.value).toContain('<h4 class="changed">새 제목</h4>');
  draftCode.value = draftCode.value.replace('새 제목', '코드에서 바로 반영');
  patch.click();
  expect(actual.firstChild).toBe(root);
  expect(actual.querySelector('ul')).toBe(list);
  expect(actual.querySelector('h4.changed').textContent).toBe('코드에서 바로 반영');
  expect(actualCode.value).toBe(draftCode.value);
  expect(status.textContent).toContain('상태 2 / 2');
});

test('뒤로가기와 앞으로가기가 두 HTML 코드를 복원하고 미반영 코드 편집을 버린다', () => {
  const { patch, undo, redo, viewToggle, actualCode, draftCode } = mountDemo();
  viewToggle.click();
  const original = actualCode.value;
  draftCode.value = original.replace('오늘의 작업', '저장한 제목');
  patch.click();
  const saved = actualCode.value;

  draftCode.value = '<p>미반영 초안</p>';
  undo.click();
  expect(actualCode.value).toBe(original);
  expect(draftCode.value).toBe(original);
  redo.click();
  expect(actualCode.value).toBe(saved);
  expect(draftCode.value).toBe(saved);
});

test.each(['<p>첫 번째</p><p>두 번째</p>', '<article><script>throw new Error()</script></article>', '<a href="javascript:void(0)">링크</a>'])(
  '지원하지 않는 HTML에서는 수정한 코드를 유지한다 (%s)', (invalidSource) => {
    const { actual, draft, patch, status, viewToggle, actualCode, draftCode } = mountDemo();
    viewToggle.click();
    const original = actualCode.value;
    draftCode.value = invalidSource;
    patch.click();
    viewToggle.click();

    expect(draftCode.hidden).toBe(false);
    expect(viewToggle.getAttribute('aria-checked')).toBe('true');
    expect(draftCode.value).toBe(invalidSource);
    expect(actual.innerHTML).toBe(original);
    expect(draft.innerHTML).toBe(original);
    expect(status.classList.contains('is-error')).toBe(true);
    expect(status.textContent).toContain('상태 1 / 1');
  },
);

test('첫 화면을 편집 영역에 복제하고 Patch를 누를 때 실제 영역과 이력을 갱신한다', () => {
  const { actual, draft, patch, undo, redo, status, editTitle } = mountDemo();
  const originalRoot = actual.firstChild;
  const originalText = actual.querySelector('h3').firstChild;
  const originalItem = actual.querySelector('li');
  expect(actual.childNodes).toHaveLength(1);
  expect(draft.firstChild.isEqualNode(originalRoot)).toBe(true);
  expect(draft.firstChild).not.toBe(originalRoot);
  expect(draft.getAttribute('contenteditable')).toBe('true');
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(true);

  editTitle('새 제목');
  const newItem = document.createElement('li');
  newItem.textContent = '새 항목';
  draft.querySelector('ul').append(newItem);
  expect(actual.querySelector('h3').textContent).toBe('오늘의 작업');
  expect(status.textContent).toContain('상태 1 / 1');
  expect(status.textContent).toContain('편집 중');

  patch.click();
  expect(actual.firstChild).toBe(originalRoot);
  expect(actual.firstChild.isEqualNode(draft.firstChild)).toBe(true);
  expect(actual.querySelector('h3').firstChild).toBe(originalText);
  expect(originalText.data).toBe('새 제목');
  expect(actual.querySelector('li')).toBe(originalItem);
  expect(actual.querySelector('li:last-child').textContent).toBe('새 항목');
  expect(status.textContent).toContain('상태 2 / 2');
  expect(undo.disabled).toBe(false);
  expect(redo.disabled).toBe(true);
});

test('무변경 Patch는 새 이력을 만들거나 미래 이력을 지우지 않는다', () => {
  const { actual, patch, undo, redo, status, editTitle } = mountDemo();
  const root = actual.firstChild;
  patch.click();
  expect(status.textContent).toContain('상태 1 / 1');
  expect(undo.disabled).toBe(true);
  expect(actual.firstChild).toBe(root);

  editTitle('B');
  patch.click();
  undo.click();
  patch.click();
  expect(status.textContent).toContain('상태 1 / 2');
  expect(status.textContent).toContain('반영할 변경이 없어요');
  expect(redo.disabled).toBe(false);
  redo.click();
  expect(actual.querySelector('h3').textContent).toBe('B');
});

test('Undo와 Redo가 미반영 편집을 버리고 두 영역을 같은 상태로 맞춘다', () => {
  const { actual, draft, patch, undo, redo, status, editTitle } = mountDemo();
  const original = actual.innerHTML;
  editTitle('B');
  patch.click();
  const saved = actual.innerHTML;

  editTitle('저장하지 않은 제목');
  undo.click();
  expect(actual.innerHTML).toBe(original);
  expect(draft.innerHTML).toBe(original);
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(false);

  editTitle('또 다른 초안');
  redo.click();
  expect(actual.innerHTML).toBe(saved);
  expect(draft.innerHTML).toBe(saved);
  expect(status.textContent).toContain('상태 2 / 2');
  expect(redo.disabled).toBe(true);
});

test('여러 루트가 있는 초안에서도 뒤로가기 한 번으로 이전 상태를 복원한다', () => {
  const { actual, draft, patch, undo, redo, actualCode, draftCode, editTitle } = mountDemo();
  const root = actual.firstChild;
  const original = actual.innerHTML;
  editTitle('B');
  patch.click();
  const saved = actual.innerHTML;

  const extraRoot = document.createElement('p');
  extraRoot.textContent = '미반영 초안';
  draft.append(extraRoot);
  expect(draft.childNodes).toHaveLength(2);

  undo.click();
  expect(actual.firstChild).toBe(root);
  expect(actual.innerHTML).toBe(original);
  expect(draft.innerHTML).toBe(original);
  expect(actualCode.value).toBe(original);
  expect(draftCode.value).toBe(original);
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(false);

  redo.click();
  expect(actual.innerHTML).toBe(saved);
  expect(draft.innerHTML).toBe(saved);
});

test('Undo 이후 새 변경을 반영하면 Redo는 새 분기만 따라간다', () => {
  const { actual, draft, patch, undo, redo, status, editTitle } = mountDemo();
  editTitle('B');
  patch.click();
  editTitle('C');
  patch.click();
  expect(actual.querySelector('h3').textContent).toBe('C');
  undo.click();
  expect(actual.querySelector('h3').textContent).toBe('B');

  editTitle('D');
  patch.click();
  expect(status.textContent).toContain('상태 3 / 3');
  expect(redo.disabled).toBe(true);
  redo.click();
  expect(actual.querySelector('h3').textContent).toBe('D');

  undo.click();
  expect(draft.querySelector('h3').textContent).toBe('B');
  redo.click();
  expect(draft.querySelector('h3').textContent).toBe('D');
  expect(actual.innerHTML).toBe(draft.innerHTML);
});

test.each([
  { name: '여러 루트', edit: (draft) => draft.append(document.createElement('p')) },
  { name: '인라인 핸들러 속성', edit: (draft) => draft.firstChild.setAttribute('onclick', 'alert(1)') },
])('$name를 포함한 초안은 저장하지 않고 마지막 스냅샷으로 복구한다', ({ edit }) => {
  const { actual, draft, patch, undo, redo, status, editTitle } = mountDemo();
  editTitle('B');
  patch.click();
  undo.click();
  const saved = actual.firstChild;
  edit(draft);

  patch.click();
  expect(actual.firstChild).toBe(saved);
  expect(draft.childNodes).toHaveLength(1);
  expect(draft.firstChild.isEqualNode(saved)).toBe(true);
  expect(status.classList.contains('is-error')).toBe(true);
  expect(status.textContent).toContain('상태 1 / 2');
  expect(redo.disabled).toBe(false);
  redo.click();
  expect(actual.querySelector('h3').textContent).toBe('B');
});

test('Patch 중간에 실패하면 이미 적용한 변경을 되돌리고 이력을 유지한다', () => {
  const { actual, draft, patch, undo, status, editTitle } = mountDemo();
  const saved = actual.innerHTML;
  const root = actual.firstChild;
  const title = actual.querySelector('h3').firstChild;
  let titleAtFailure;
  // 들여쓰기 공백은 로드할 때 지워지므로 마지막 li를 지우면 REMOVE가 발생한다.
  const replace = vi.spyOn(actual.querySelector('li:last-child'), 'remove').mockImplementationOnce(() => {
    titleAtFailure = title.data;
    throw new Error('실제 영역 적용 실패');
  });
  editTitle('이미 적용된 제목');
  draft.querySelector('li:last-child').remove();

  patch.click();
  expect(replace).toHaveBeenCalledOnce();
  expect(titleAtFailure).toBe('이미 적용된 제목');
  expect(actual.firstChild).toBe(root);
  expect(actual.querySelector('h3').firstChild).toBe(title);
  expect(actual.innerHTML).toBe(saved);
  expect(draft.innerHTML).toBe(saved);
  expect(status.textContent).toContain('상태 1 / 1');
  expect(status.classList.contains('is-error')).toBe(true);
  expect(undo.disabled).toBe(true);
});

test('Undo에서 편집 영역 적용이 실패하면 두 영역과 이력 위치를 복구한다', () => {
  const { actual, draft, patch, undo, redo, status, editTitle } = mountDemo();
  editTitle('B');
  const li = document.createElement('li');
  li.textContent = 'B 항목';
  draft.querySelector('ul').append(li);
  patch.click();
  const saved = actual.innerHTML;
  let titleAtFailure;
  const remove = vi.spyOn(li, 'remove').mockImplementationOnce(() => {
    titleAtFailure = actual.querySelector('h3').textContent;
    throw new Error('편집 영역 적용 실패');
  });

  undo.click();
  expect(remove).toHaveBeenCalledOnce();
  expect(titleAtFailure).toBe('오늘의 작업');
  expect(actual.innerHTML).toBe(saved);
  expect(draft.innerHTML).toBe(saved);
  expect(status.textContent).toContain('상태 2 / 2');
  expect(status.classList.contains('is-error')).toBe(true);
  expect(undo.disabled).toBe(false);
  expect(redo.disabled).toBe(true);
  undo.click();
  expect(actual.querySelector('h3').textContent).toBe('오늘의 작업');
});

test('해제 함수가 클릭과 편집 이벤트 연결을 모두 제거한다', () => {
  const { actual, draft, patch, undo, redo, status, stop, editTitle } = mountDemo();
  editTitle('B');
  patch.click();
  editTitle('C');
  patch.click();
  undo.click();
  expect(undo.disabled).toBe(false);
  expect(redo.disabled).toBe(false);

  stop();
  const lastStatus = status.textContent;
  editTitle('해제 이후');
  patch.click();
  undo.click();
  redo.click();
  expect(actual.querySelector('h3').textContent).toBe('B');
  expect(draft.querySelector('h3').textContent).toBe('해제 이후');
  expect(status.textContent).toBe(lastStatus);
});
