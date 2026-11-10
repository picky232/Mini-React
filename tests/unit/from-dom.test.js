// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import { domToVNode, normalizeDOM } from '../../src/dom/from-dom.js';

describe('domToVNode', () => {
  test.each(['hello', '', ' \n\t '])('Text 노드 %j를 정확히 읽는다', (value) => {
    expect(domToVNode(document.createTextNode(value))).toEqual({ kind: 'text', value });
  });

  test('속성과 중첩 요소를 읽고, 줄바꿈 공백은 버리고 띄어쓰기는 남긴다', () => {
    const element = document.createElement('section');
    element.innerHTML = '\n <button class="primary" disabled data-id="7" style="color: red;">안녕 <em>React</em></button> ';
    expect(domToVNode(element)).toEqual({
      kind: 'element', tag: 'section', props: { attrs: {}, events: {} },
      children: [
        {
          kind: 'element', tag: 'button',
          props: { attrs: { class: 'primary', disabled: '', 'data-id': '7', style: 'color: red;' }, events: {} },
          children: [
            { kind: 'text', value: '안녕 ' },
            { kind: 'element', tag: 'em', props: { attrs: {}, events: {} }, children: [{ kind: 'text', value: 'React' }] },
          ],
        },
        { kind: 'text', value: ' ' },
      ],
    });
  });

  test('빈 텍스트는 버리고 띄어쓰기만 있는 텍스트는 남긴다', () => {
    const div = document.createElement('div');
    div.append(document.createTextNode(''), document.createTextNode(' '), document.createElement('br'));
    expect(domToVNode(div).children).toEqual([
      { kind: 'text', value: ' ' },
      { kind: 'element', tag: 'br', props: { attrs: {}, events: {} }, children: [] },
    ]);
  });

  test('DOM을 수정하거나 기존 이벤트 리스너를 읽으려 하지 않는다', () => {
    const button = document.createElement('button');
    const text = document.createTextNode('ready');
    const click = vi.fn();
    button.append(text);
    button.addEventListener('click', click);
    document.body.append(button);

    const vnode = domToVNode(button);
    expect(vnode.props.events).toEqual({});
    expect(button.parentNode).toBe(document.body);
    expect(button.firstChild).toBe(text);
    expect(text.data).toBe('ready');
    button.click();
    expect(click).toHaveBeenCalledOnce();
  });

  test('DOM 속성의 특수한 이름도 자체 데이터 필드로 보존한다', () => {
    const div = document.createElement('div');
    div.setAttribute('__proto__', 'kept');
    expect(Object.hasOwn(domToVNode(div).props.attrs, '__proto__')).toBe(true);
    expect(domToVNode(div).props.attrs.__proto__).toBe('kept');
  });

  test('다른 Document의 노드도 전역 instanceof에 의존하지 않고 변환한다', () => {
    const otherDocument = document.implementation.createHTMLDocument('other');
    const p = otherDocument.createElement('p');
    p.textContent = 'other';
    expect(domToVNode(p).children).toEqual([{ kind: 'text', value: 'other' }]);
  });

  test('루트 주석을 TypeError로 거절한다', () => {
    expect(() => domToVNode(document.createComment('note'))).toThrow(TypeError);
  });

  test('중첩된 주석은 버리고 양옆 텍스트를 합치며 원본 DOM은 바꾸지 않는다', () => {
    const div = document.createElement('div');
    div.innerHTML = '<span>before<!--note-->after</span>';
    const before = div.innerHTML;
    expect(domToVNode(div).children[0].children).toEqual([{ kind: 'text', value: 'beforeafter' }]);
    expect(div.innerHTML).toBe(before);
  });

  test('pre·textarea 안의 줄바꿈 공백은 그대로 남긴다', () => {
    const div = document.createElement('div');
    div.innerHTML = '<pre>\n<b>a</b>\n</pre>\n<textarea>\n\n</textarea>';
    const [pre, textarea] = domToVNode(div).children;
    expect(pre.children.map((child) => child.kind)).toEqual(['element', 'text']);
    expect(pre.children[1].value).toBe('\n');
    expect(textarea.children).toEqual([{ kind: 'text', value: '\n' }]);
  });

  test('normalizeDOM은 버린 노드를 실제 DOM에서도 지워 childNodes와 VNode 순서를 맞춘다', () => {
    const div = document.createElement('div');
    div.innerHTML = '\n  <p>a<!--x-->b</p>\n  <span> </span>\n';
    const vnode = domToVNode(div);
    normalizeDOM(div);
    expect(div.innerHTML).toBe('<p>ab</p><span> </span>');
    expect(div.childNodes).toHaveLength(vnode.children.length);
    expect(domToVNode(div)).toEqual(vnode);
  });

  test.each([
    () => document,
    () => document.createDocumentFragment(),
    () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    () => document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math'),
    () => document.createElement('template'),
    () => { const div = document.createElement('div'); div.setAttribute('onclick', 'run()'); return div; },
  ])('지원하지 않는 DOM 입력을 거절한다', (makeNode) => {
    expect(() => domToVNode(makeNode())).toThrow(TypeError);
  });
});
