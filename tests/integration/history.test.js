// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import { diff } from '../../src/core/diff.js';
import { createHistory, getCurrent, pushHistory, redo, undo } from '../../src/core/history.js';
import { h } from '../../src/core/vnode.js';
import { domToVNode } from '../../src/dom/from-dom.js';
import { applyPatches } from '../../src/dom/patch.js';

// 이동 전후의 스냅샷을 비교하고 결과를 실제 컨테이너에 적용한다.
function showHistory(container, before, after) {
  return applyPatches(container, diff(getCurrent(before), getCurrent(after)));
}

test('A → B → Undo(A) → Redo(B)에서 DOM과 이벤트가 복원되고 기존 노드를 유지한다', () => {
  const container = document.createElement('main');
  const clickA = vi.fn();
  const clickB = vi.fn();
  const view = (label, click) => h('section', null, [
    h('button', { attrs: { title: label }, events: { click } }, [label]),
    h('footer', null, ['same']),
  ]);
  const initial = createHistory(view('A', clickA));
  const root = applyPatches(container, diff(null, getCurrent(initial)));
  const [button, footer] = root.childNodes;
  const label = button.firstChild;

  const changed = pushHistory(initial, view('B', clickB));
  expect(showHistory(container, initial, changed)).toBe(root);
  expect(button.textContent).toBe('B');
  expect(button.title).toBe('B');
  button.click();
  expect(clickA).not.toHaveBeenCalled();
  expect(clickB).toHaveBeenCalledOnce();

  const undone = undo(changed);
  expect(showHistory(container, changed, undone)).toBe(root);
  expect(button.textContent).toBe('A');
  expect(button.title).toBe('A');
  button.click();
  expect(clickA).toHaveBeenCalledOnce();
  expect(clickB).toHaveBeenCalledOnce();

  const redone = redo(undone);
  expect(showHistory(container, undone, redone)).toBe(root);
  expect(button.textContent).toBe('B');
  expect(button.title).toBe('B');
  button.click();
  expect(clickA).toHaveBeenCalledOnce();
  expect(clickB).toHaveBeenCalledTimes(2);
  expect(root.firstChild).toBe(button);
  expect(button.firstChild).toBe(label);
  expect(root.lastChild).toBe(footer);
});

test('Undo 후 새 상태를 저장하면 Redo를 시도해도 DOM이 새 분기의 끝에 머문다', () => {
  const container = document.createElement('div');
  const view = (value) => h('p', null, [value]);
  const a = createHistory(view('A'));
  const root = applyPatches(container, diff(null, getCurrent(a)));
  const b = pushHistory(a, view('B'));
  showHistory(container, a, b);
  const c = pushHistory(b, view('C'));
  showHistory(container, b, c);
  expect(root.textContent).toBe('C');

  const backToB = undo(c);
  showHistory(container, c, backToB);
  expect(root.textContent).toBe('B');
  const d = pushHistory(backToB, view('D'));
  showHistory(container, backToB, d);
  expect(root.textContent).toBe('D');

  const afterRedo = redo(d);
  expect(afterRedo).toBe(d);
  expect(showHistory(container, d, afterRedo)).toBe(root);
  expect(domToVNode(root)).toEqual(view('D'));
});

test('Undo와 Redo로 빈 화면과 루트가 있는 화면 사이를 이동한다', () => {
  const container = document.createElement('div');
  const empty = createHistory(null);
  const filled = pushHistory(empty, h('p', null, ['visible']));
  const root = showHistory(container, empty, filled);
  expect(domToVNode(root)).toEqual(getCurrent(filled));

  const undone = undo(filled);
  expect(showHistory(container, filled, undone)).toBeNull();
  expect(root.parentNode).toBeNull();
  expect(container.childNodes).toHaveLength(0);

  const redone = redo(undone);
  const restored = showHistory(container, undone, redone);
  expect(restored).toBe(container.firstChild);
  expect(domToVNode(restored)).toEqual(getCurrent(filled));
});
