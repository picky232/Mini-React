// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import { createTextVNode, h } from '../../src/core/vnode.js';
import { createDOM } from '../../src/dom/render.js';

describe('createDOM', () => {
  test.each(['hello', '', ' \n\t ', '<strong>literal</strong>'])('텍스트 %j를 HTML로 해석하지 않는다', (value) => {
    const node = createDOM(createTextVNode(value), document);
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.data).toBe(value);
    expect(node.parentNode).toBeNull();
  });

  test('중첩 구조·속성·공백·빈 텍스트를 새 DOM으로 렌더링한다', () => {
    const tree = h('section', { attrs: { id: 'sample', style: 'color: red;' }, events: {} }, [
      '', '\n ', h('button', { attrs: { disabled: '', 'aria-label': 'go' }, events: {} }, ['GO']),
    ]);
    const node = createDOM(tree, document);
    expect(node.localName).toBe('section');
    expect(node.getAttribute('id')).toBe('sample');
    expect(node.getAttribute('style')).toBe('color: red;');
    expect(node.childNodes).toHaveLength(3);
    expect(node.childNodes[0].data).toBe('');
    expect(node.childNodes[1].data).toBe('\n ');
    expect(node.lastChild.outerHTML).toBe('<button disabled="" aria-label="go">GO</button>');
    expect(node.parentNode).toBeNull();
  });

  test('생성 시 전달된 이벤트 함수를 등록하며 여러 렌더 결과는 독립적이다', () => {
    const click = vi.fn();
    const tree = h('button', { attrs: {}, events: { click } }, ['go']);
    const first = createDOM(tree, document);
    const second = createDOM(tree, document);
    expect(first).not.toBe(second);
    expect(first.firstChild).not.toBe(second.firstChild);
    first.click();
    second.click();
    expect(click).toHaveBeenCalledTimes(2);
    expect(click.mock.calls[0][0].target).toBe(first);
    expect(tree.props.events.click).toBe(click);
  });

  test('모든 노드를 전달받은 Document에서 생성한다', () => {
    const otherDocument = document.implementation.createHTMLDocument('other');
    const node = createDOM(h('div', null, [' ', h('span', null, ['text'])]), otherDocument);
    expect(node.ownerDocument).toBe(otherDocument);
    expect(node.firstChild.ownerDocument).toBe(otherDocument);
    expect(node.lastChild.ownerDocument).toBe(otherDocument);
    expect(node.lastChild.firstChild.ownerDocument).toBe(otherDocument);
    expect(otherDocument.body.childNodes).toHaveLength(0);
  });

  test('동결된 VNode를 수정하지 않고 렌더링한다', () => {
    const text = Object.freeze(createTextVNode('frozen'));
    const props = Object.freeze({ attrs: Object.freeze({ title: 'kept' }), events: Object.freeze({}) });
    const tree = Object.freeze({ kind: 'element', tag: 'p', props, children: Object.freeze([text]) });
    expect(createDOM(tree, document).outerHTML).toBe('<p title="kept">frozen</p>');
    expect(tree.children[0]).toBe(text);
  });

  test.each([
    null,
    { kind: 'comment', value: 'note' },
    { kind: 'text', value: 1 },
    { kind: 'element', tag: 'template', props: { attrs: {}, events: {} }, children: [] },
    { kind: 'element', tag: 'div', props: { attrs: { onclick: 'run()' }, events: {} }, children: [] },
    { kind: 'element', tag: 'div', props: { attrs: {}, events: {} }, children: ['raw'] },
  ])('잘못되거나 지원하지 않는 VNode %j를 거절한다', (tree) => {
    expect(() => createDOM(tree, document)).toThrow(TypeError);
  });
});
