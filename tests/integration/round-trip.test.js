// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import { domToVNode, normalizeDOM } from '../../src/dom/from-dom.js';
import { createDOM } from '../../src/dom/render.js';

describe('DOM → VNode → DOM 왕복', () => {
  test('속성과 구조를 보존하고, 들여쓰기 공백만 뺀 새 DOM을 만든다', () => {
    const original = document.createElement('article');
    original.setAttribute('data-id', '7');
    original.innerHTML = '\n <h2 class="title">Mini <em>React</em></h2>\n <input disabled value="initial"><br> ';
    document.body.append(original);
    const originalHeading = original.querySelector('h2');
    const originalHTML = original.outerHTML;
    const vnode = domToVNode(original);
    const rendered = createDOM(vnode, document);
    const expected = /** @type {Element} */ (original.cloneNode(true));
    normalizeDOM(expected);

    expect(domToVNode(rendered)).toEqual(vnode);
    expect(rendered.isEqualNode(expected)).toBe(true);
    expect(rendered.outerHTML).toBe('<article data-id="7"><h2 class="title">Mini <em>React</em></h2><input disabled="" value="initial"><br> </article>');
    expect(rendered).not.toBe(original);
    expect(rendered.querySelector('h2')).not.toBe(originalHeading);
    expect(rendered.parentNode).toBeNull();
    expect(original.parentNode).toBe(document.body);
    expect(original.querySelector('h2')).toBe(originalHeading);
    expect(original.outerHTML).toBe(originalHTML);

    rendered.querySelector('h2').textContent = 'changed';
    expect(original.outerHTML).toBe(originalHTML);
    expect(vnode.children[0].children[0].value).toBe('Mini ');
  });

  test('빈 텍스트와 줄바꿈 공백은 버리고 띄어쓰기 텍스트만 남긴다', () => {
    const original = document.createElement('div');
    original.append(document.createTextNode(''), document.createTextNode(' '), document.createTextNode('\n'), document.createTextNode(''));
    const vnode = domToVNode(original);
    const rendered = createDOM(vnode, document);
    expect(Array.from(rendered.childNodes, (node) => node.nodeValue)).toEqual([' ']);
    expect(domToVNode(rendered)).toEqual(vnode);
  });

  test.each(['', ' \n\t ', 'Text & <tags>'])('Text 루트 %j도 왕복한다', (value) => {
    const original = document.createTextNode(value);
    const vnode = domToVNode(original);
    const rendered = createDOM(vnode, document);
    expect(rendered.isEqualNode(original)).toBe(true);
    expect(rendered).not.toBe(original);
    expect(domToVNode(rendered)).toEqual(vnode);
  });

  test('속성을 보존하지만 live property와 기존 이벤트 리스너는 복제하지 않는다', () => {
    const input = document.createElement('input');
    input.setAttribute('value', 'attribute');
    input.value = 'live';
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    const vnode = domToVNode(input);
    const rendered = createDOM(vnode, document);

    expect(rendered.getAttribute('value')).toBe('attribute');
    expect(rendered.value).toBe('attribute');
    expect(input.value).toBe('live');
    rendered.dispatchEvent(new Event('input'));
    expect(onInput).not.toHaveBeenCalled();
    expect(vnode.props.events).toEqual({});
  });

  test('주석은 버리고 왕복하며 원본 자식 순서는 바꾸지 않는다', () => {
    const div = document.createElement('div');
    div.innerHTML = 'before<!--note--><span>after</span>';
    const before = Array.from(div.childNodes);
    expect(createDOM(domToVNode(div), document).outerHTML).toBe('<div>before<span>after</span></div>');
    expect(Array.from(div.childNodes)).toEqual(before);
  });
});
