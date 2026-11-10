// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import { diff } from '../../src/core/diff.js';
import { createTextVNode, h } from '../../src/core/vnode.js';
import { domToVNode } from '../../src/dom/from-dom.js';
import { applyPatches } from '../../src/dom/patch.js';
import { createDOM } from '../../src/dom/render.js';

test('실제 DOM을 변환해 다섯 종류의 변경을 적용하고 목표 VNode와 일치시킨다', () => {
  const container = document.createElement('main');
  container.innerHTML = '<section class="before" title="gone"> \n<p>before</p><ol><li>A</li><li>B</li><li>C</li></ol><aside>old</aside><footer>same</footer></section>';
  document.body.append(container);
  const root = container.firstChild;
  const [space, paragraph, list, aside, footer] = root.childNodes;
  const [first, removedB, removedC] = list.childNodes;
  const originalText = paragraph.firstChild;
  const previous = domToVNode(root);
  const next = h('section', { attrs: { class: 'after', id: 'new' }, events: {} }, [
    ' \n',
    h('p', null, ['after']),
    h('ol', null, [h('li', null, ['A'])]),
    h('article', null, ['new']),
    h('footer', null, ['same']),
    h('button', { attrs: { disabled: '' }, events: {} }, ['Done']),
  ]);

  const updated = applyPatches(container, diff(previous, next));
  expect(domToVNode(updated)).toEqual(next);
  expect(updated).toBe(root);
  expect(updated.childNodes[0]).toBe(space);
  expect(updated.childNodes[1]).toBe(paragraph);
  expect(paragraph.firstChild).toBe(originalText);
  expect(updated.childNodes[2]).toBe(list);
  expect(list.firstChild).toBe(first);
  expect(removedB.parentNode).toBeNull();
  expect(removedC.parentNode).toBeNull();
  expect(aside.parentNode).toBeNull();
  expect(updated.childNodes[4]).toBe(footer);
});

test('빈 트리에서 Text 루트를 만들고 Element로 교체한 뒤 루트를 삭제한다', () => {
  const container = document.createElement('div');
  const text = createTextVNode(' ');
  const paragraph = h('p', null, ['hello']);

  const first = applyPatches(container, diff(null, text));
  expect(domToVNode(first)).toEqual(text);
  const second = applyPatches(container, diff(text, paragraph));
  expect(domToVNode(second)).toEqual(paragraph);
  expect(first.parentNode).toBeNull();
  expect(applyPatches(container, diff(paragraph, null))).toBeNull();
  expect(container.childNodes).toHaveLength(0);
});

test('리스트 중간에 새 항목이 생기면 인덱스 비교 결과를 적용해 목표 구조를 만든다', () => {
  const li = (value) => h('li', null, [value]);
  const previous = h('ul', null, [li('A'), li('B')]);
  const next = h('ul', null, [li('A'), li('X'), li('B')]);
  const container = document.createElement('div');
  const root = createDOM(previous, document);
  const [first, second] = root.childNodes;
  container.append(root);

  const updated = applyPatches(container, diff(domToVNode(root), next));
  expect(domToVNode(updated)).toEqual(next);
  expect(updated.childNodes[0]).toBe(first);
  expect(updated.childNodes[1]).toBe(second);
  expect(second.textContent).toBe('X');
});

test('속성 이름의 대소문자가 바뀌어도 새 값이 최종 DOM에 남는다', () => {
  const container = document.createElement('main');
  container.innerHTML = '<div class="old"></div>';
  const previous = domToVNode(container.firstChild);
  const next = h('div', { attrs: { CLASS: 'new' }, events: {} });

  const updated = applyPatches(container, diff(previous, next));
  expect(updated.getAttribute('class')).toBe('new');
  expect(updated.isEqualNode(createDOM(next, document))).toBe(true);
});

test('Diff가 만든 이벤트 변경으로 삽입된 DOM의 핸들러를 교체하고 제거한다', () => {
  const container = document.createElement('div');
  const oldClick = vi.fn();
  const newClick = vi.fn();
  const button = (events) => h('button', { attrs: {}, events }, ['go']);
  const previous = button({ click: oldClick });
  const next = button({ click: newClick });
  const noEvents = button({});

  const root = applyPatches(container, diff(null, previous));
  root.click();
  expect(applyPatches(container, diff(previous, next))).toBe(root);
  root.click();
  expect(applyPatches(container, diff(next, noEvents))).toBe(root);
  root.click();
  expect(oldClick).toHaveBeenCalledOnce();
  expect(newClick).toHaveBeenCalledOnce();
});
