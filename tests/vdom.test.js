import { describe, it, expect } from 'vitest';
import { createElement, domToVNode, containerToVNode, htmlToVNode, vnodeToHTML } from '../src/vdom.js';
import { el, text, root, CASES } from './fixtures.js';

// Stage 0: createElement. Stage 1-A가 나머지 함수 테스트를 이 파일에 추가한다.
describe('createElement', () => {
  it('텍스트 VNode → Text 노드', () => {
    const node = createElement(text('hi'));
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.nodeValue).toBe('hi');
  });

  it('엘리먼트의 속성과 중첩 자식을 만든다', () => {
    const node = createElement(el('ul', { class: 'list', 'data-id': '7' }, el('li', {}, text('a')), el('li', {}, text('b'))));
    expect(node.outerHTML).toBe('<ul class="list" data-id="7"><li>a</li><li>b</li></ul>');
  });

  it('#root는 자식만 담은 DocumentFragment가 된다', () => {
    const node = createElement(root(el('p', {}, text('1')), text('2')));
    expect(node.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE);
    const box = document.createElement('div');
    box.appendChild(node);
    expect(box.innerHTML).toBe('<p>1</p>2');
  });

  it('특수문자는 DOM이 그대로 값으로 담는다', () => {
    const node = createElement(el('p', { title: '"q" & <x>' }, text('1 < 2 & 3')));
    expect(node.getAttribute('title')).toBe('"q" & <x>');
    expect(node.textContent).toBe('1 < 2 & 3');
  });
});

// Stage 1-A
const box = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

describe('domToVNode', () => {
  it('공백만 있는 텍스트 노드는 null, 앞뒤 공백 있는 텍스트는 그대로', () => {
    expect(domToVNode(document.createTextNode(' \n\t '))).toBeNull();
    expect(domToVNode(document.createTextNode('  a b  '))).toEqual(text('  a b  '));
  });

  it('주석은 null', () => {
    expect(domToVNode(document.createComment('x'))).toBeNull();
  });

  it('태그 이름은 소문자, 속성은 문자열로 보존', () => {
    const node = box('<DIV ID="x" data-n="1" hidden>hi</DIV>').firstChild;
    expect(domToVNode(node)).toEqual(el('div', { id: 'x', 'data-n': '1', hidden: '' }, text('hi')));
  });

  it('중첩 자식에서 공백·주석을 빼고 변환한다', () => {
    const node = box('<ul>\n  <!-- c --><li>a<b>b</b></li>\n  <li>c</li>\n</ul>').firstChild;
    expect(domToVNode(node)).toEqual(el('ul', {}, el('li', {}, text('a'), el('b', {}, text('b'))), el('li', {}, text('c'))));
  });
});

describe('containerToVNode / htmlToVNode', () => {
  it('빈 컨테이너·빈 문자열 → 자식 없는 #root', () => {
    expect(containerToVNode(box(''))).toEqual(root());
    expect(htmlToVNode('')).toEqual(root());
  });

  it('최상위 텍스트와 엘리먼트를 모두 자식으로 담는다', () => {
    expect(htmlToVNode('a<p>b</p><!-- x -->c')).toEqual(root(text('a'), el('p', {}, text('b')), text('c')));
  });

  for (const c of CASES) {
    it(`픽스처 ${c.name}: containerToVNode(before) = oldV, htmlToVNode(after) = newV`, () => {
      expect(containerToVNode(box(c.before))).toEqual(c.oldV);
      expect(htmlToVNode(c.after)).toEqual(c.newV);
    });
  }
});

describe('vnodeToHTML', () => {
  it('#root는 자식만 이어 붙인다', () => {
    expect(vnodeToHTML(root(el('p', { class: 'a' }, text('1')), text('2')))).toBe('<p class="a">1</p>2');
    expect(vnodeToHTML(root())).toBe('');
  });

  it('텍스트의 < & 와 속성값의 " & 를 이스케이프한다', () => {
    const html = vnodeToHTML(el('p', { title: '"q" & <x>' }, text('1 < 2 & 3')));
    expect(html).toBe('<p title="&quot;q&quot; &amp; <x>">1 &lt; 2 &amp; 3</p>');
    expect(htmlToVNode(html)).toEqual(root(el('p', { title: '"q" & <x>' }, text('1 < 2 & 3'))));
  });

  it('void 엘리먼트는 닫는 태그 없이 쓴다 (다시 파싱해도 같음)', () => {
    const v = root(el('p', {}, text('a'), el('br'), text('b')), el('img', { src: 'x.png' }));
    expect(vnodeToHTML(v)).toBe('<p>a<br>b</p><img src="x.png">');
    expect(htmlToVNode(vnodeToHTML(v))).toEqual(v);
  });
});

describe('왕복', () => {
  for (const c of CASES) {
    it(`${c.name}: DOM → VNode → DOM, VNode → HTML → VNode`, () => {
      for (const html of [c.before, c.after]) {
        const v = htmlToVNode(html);
        const rebuilt = document.createElement('div');
        rebuilt.appendChild(createElement(v));
        expect(containerToVNode(rebuilt)).toEqual(v);
        expect(rebuilt.isEqualNode(box(vnodeToHTML(v)))).toBe(true);
        expect(htmlToVNode(vnodeToHTML(v))).toEqual(v);
      }
    });
  }
});
