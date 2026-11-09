// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import { createTextVNode, h } from '../../src/core/vnode.js';
import { applyPatches } from '../../src/dom/patch.js';
import { createDOM } from '../../src/dom/render.js';

const changes = (delta) => ({ setAttrs: {}, removeAttrs: [], setEvents: {}, removeEvents: [], ...delta });

function containerWith(...nodes) {
  const container = document.createElement('div');
  container.append(...nodes);
  return container;
}

describe('applyPatches의 DOM 변경', () => {
  test('빈 목록은 루트와 자식을 유지하고 DOM 변경을 만들지 않는다', () => {
    const root = document.createElement('p');
    const child = document.createTextNode('same');
    root.append(child);
    const container = containerWith(root);
    const observer = new MutationObserver(() => {});
    observer.observe(container, { subtree: true, attributes: true, characterData: true, childList: true });

    expect(applyPatches(container, [])).toBe(root);
    expect(root.firstChild).toBe(child);
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
    expect(applyPatches(containerWith(), [])).toBeNull();
  });

  test('빈 컨테이너에 루트를 넣고 제거 후 null을 반환한다', () => {
    const container = containerWith();
    const root = applyPatches(container, [{ type: 'INSERT', path: [], node: h('p', null, ['new']) }]);
    expect(root).toBe(container.firstChild);
    expect(root.outerHTML).toBe('<p>new</p>');

    expect(applyPatches(container, [{ type: 'REMOVE', path: [] }])).toBeNull();
    expect(root.parentNode).toBeNull();
    expect(container.childNodes).toHaveLength(0);
  });

  test('중간 삽입 이후의 경로는 삽입된 DOM을 기준으로 해석한다', () => {
    const space = document.createTextNode(' ');
    const root = document.createElement('section');
    const last = document.createElement('p');
    last.textContent = 'before';
    const text = last.firstChild;
    root.append(space, last);
    const container = containerWith(root);

    const patches = Object.freeze([
      Object.freeze({ type: 'INSERT', path: Object.freeze([1]), node: h('b', null, ['new']) }),
      Object.freeze({ type: 'TEXT', path: Object.freeze([2, 0]), value: 'after' }),
    ]);
    expect(applyPatches(container, patches)).toBe(root);
    expect(root.innerHTML).toBe(' <b>new</b><p>after</p>');
    expect(root.childNodes[0]).toBe(space);
    expect(root.childNodes[2]).toBe(last);
    expect(last.firstChild).toBe(text);
  });

  test('자식 수와 같은 인덱스에 새 자식을 추가한다', () => {
    const root = document.createElement('p');
    const first = document.createTextNode('first');
    root.append(first);
    const container = containerWith(root);

    applyPatches(container, [{ type: 'INSERT', path: [1], node: createTextVNode('second') }]);
    expect(root.firstChild).toBe(first);
    expect(root.childNodes).toHaveLength(2);
    expect(root.lastChild.data).toBe('second');
  });

  test('자식 삭제 후 현재 인덱스로 다른 자식을 교체한다', () => {
    const root = document.createElement('ul');
    root.innerHTML = '<li>A</li><li>B</li><li>C</li>';
    const [a, b, c] = root.childNodes;
    const container = containerWith(root);

    expect(applyPatches(container, [
      { type: 'REMOVE', path: [0] },
      { type: 'REPLACE', path: [0], node: h('li', null, ['D']) },
    ])).toBe(root);
    expect(root.innerHTML).toBe('<li>D</li><li>C</li>');
    expect(root.lastChild).toBe(c);
    expect(a.parentNode).toBeNull();
    expect(b.parentNode).toBeNull();
  });

  test('REPLACE는 현재 루트를 교체하며 컨테이너의 Document에서 생성한다', () => {
    const other = document.implementation.createHTMLDocument('other');
    const container = other.createElement('div');
    const before = other.createTextNode('before');
    container.append(before);

    const after = applyPatches(container, [{ type: 'REPLACE', path: [], node: h('p', null, ['after']) }]);
    expect(before.parentNode).toBeNull();
    expect(after).toBe(container.firstChild);
    expect(after.ownerDocument).toBe(other);
    expect(after.firstChild.ownerDocument).toBe(other);
  });

  test('TEXT는 마크업을 해석하지 않고 같은 Text 노드의 데이터를 변경한다', () => {
    const text = document.createTextNode('before');
    const container = containerWith(text);
    expect(applyPatches(container, [{ type: 'TEXT', path: [], value: '<b>text</b>' }])).toBe(text);
    expect(text.data).toBe('<b>text</b>');
    expect(container.children).toHaveLength(0);
  });

  test('PROPS로 속성을 추가·수정·삭제하고 boolean 속성의 존재 여부를 보존한다', () => {
    const button = document.createElement('button');
    button.className = 'before';
    button.title = 'gone';
    const container = containerWith(button);

    expect(applyPatches(container, [{
      type: 'PROPS', path: [], changes: changes({ setAttrs: { class: 'after', disabled: '' }, removeAttrs: ['title'] }),
    }])).toBe(button);
    expect(button.className).toBe('after');
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.getAttribute('disabled')).toBe('');
    expect(button.disabled).toBe(true);

    applyPatches(container, [{ type: 'PROPS', path: [], changes: changes({ setAttrs: { disabled: 'false' } }) }]);
    expect(button.getAttribute('disabled')).toBe('false');
    expect(button.disabled).toBe(true);
    applyPatches(container, [{ type: 'PROPS', path: [], changes: changes({ removeAttrs: ['disabled'] }) }]);
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.disabled).toBe(false);
  });

  test('PROPS는 렌더에서 등록한 리스너만 교체·해제하고 외부 리스너는 유지한다', () => {
    const oldClick = vi.fn();
    const newClick = vi.fn();
    const external = vi.fn();
    const button = createDOM(h('button', { attrs: {}, events: { click: oldClick } }), document);
    const container = containerWith(button);
    button.addEventListener('click', external);
    button.click();

    const changeClick = { type: 'PROPS', path: [], changes: changes({ setEvents: { click: newClick } }) };
    applyPatches(container, [changeClick, changeClick]);
    button.click();
    expect(oldClick).toHaveBeenCalledOnce();
    expect(newClick).toHaveBeenCalledOnce();

    applyPatches(container, [{ type: 'PROPS', path: [], changes: changes({ removeEvents: ['click'] }) }]);
    button.click();
    expect(oldClick).toHaveBeenCalledOnce();
    expect(newClick).toHaveBeenCalledOnce();
    expect(external).toHaveBeenCalledTimes(3);
  });
});

describe('applyPatches의 잘못된 입력 처리', () => {
  test.each([-1, 0.5, NaN, Infinity, '0', 2])('잘못된 경로 인덱스 %j는 RangeError다', (index) => {
    const root = document.createElement('p');
    root.append('one');
    expect(() => applyPatches(containerWith(root), [{ type: 'REMOVE', path: [index] }])).toThrow(RangeError);
    expect(root.textContent).toBe('one');
  });

  test('루트가 없거나 이미 있을 때 잘못된 루트 명령을 거절한다', () => {
    expect(() => applyPatches(containerWith(), [{ type: 'REMOVE', path: [] }])).toThrow(RangeError);
    const container = containerWith(document.createElement('p'));
    expect(() => applyPatches(container, [{ type: 'INSERT', path: [], node: h('b', null) }])).toThrow(RangeError);
    expect(() => applyPatches(container, [{ type: 'INSERT', path: [1], node: h('b', null) }])).toThrow(RangeError);
    expect(container.innerHTML).toBe('<p></p>');
  });

  test('컨테이너에 공백을 포함해 루트가 두 개 있으면 거절한다', () => {
    const container = containerWith(document.createTextNode(' '), document.createElement('p'));
    expect(() => applyPatches(container, [])).toThrow(RangeError);
    expect(container.childNodes).toHaveLength(2);
  });

  test('Element가 아닌 컨테이너와 지원하지 않는 노드를 거절한다', () => {
    expect(() => applyPatches(document.createDocumentFragment(), [])).toThrow(TypeError);
    expect(() => applyPatches(containerWith(document.createComment('note')), [])).toThrow(TypeError);
    const root = document.createElement('div');
    root.append(document.createComment('child'));
    expect(() => applyPatches(containerWith(root), [{ type: 'REMOVE', path: [0] }])).toThrow(TypeError);
  });

  test('TEXT, PROPS, INSERT의 대상이 올바른 종류인지 검증한다', () => {
    const element = containerWith(document.createElement('p'));
    const text = containerWith(document.createTextNode('text'));
    expect(() => applyPatches(element, [{ type: 'TEXT', path: [], value: 'wrong target' }])).toThrow(TypeError);
    expect(() => applyPatches(text, [{ type: 'PROPS', path: [], changes: changes({ setAttrs: { id: 'wrong' } }) }])).toThrow(TypeError);
    expect(() => applyPatches(text, [{ type: 'INSERT', path: [0], node: h('b', null) }])).toThrow(TypeError);
    expect(() => applyPatches(text, [{ type: 'REMOVE', path: [0] }])).toThrow(TypeError);
  });

  test.each([
    null,
    { type: 'MOVE', path: [] },
    { type: 'REMOVE', path: '0' },
    { type: 'REPLACE', path: [], node: null },
    { type: 'PROPS', path: [], changes: {} },
    { type: 'PROPS', path: [], changes: changes({ setAttrs: { id: 'new' }, removeAttrs: ['id'] }) },
    { type: 'PROPS', path: [], changes: changes({ setAttrs: { onclick: 'run()' } }) },
    { type: 'PROPS', path: [], changes: changes({ setAttrs: { 'invalid name': 'x' } }) },
    { type: 'PROPS', path: [], changes: changes({ setEvents: { click: 'run()' } }) },
    { type: 'PROPS', path: [], changes: changes({ setEvents: { click: () => {} }, removeEvents: ['click'] }) },
  ])('잘못된 Patch %j는 TypeError다', (patch) => {
    const root = document.createElement('p');
    expect(() => applyPatches(containerWith(root), [patch])).toThrow(TypeError);
    expect(root.attributes).toHaveLength(0);
  });

  test('목록 중간에 실패하면 적용된 변경은 남고 이후 명령은 실행하지 않는다', () => {
    const root = document.createElement('p');
    root.append('before');
    const container = containerWith(root);
    expect(() => applyPatches(container, [
      { type: 'TEXT', path: [0], value: 'applied' },
      { type: 'REMOVE', path: [9] },
      { type: 'TEXT', path: [0], value: 'not run' },
    ])).toThrow(RangeError);
    expect(root.textContent).toBe('applied');
  });
});
