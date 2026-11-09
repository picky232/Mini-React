import { describe, it, expect } from 'vitest';
import { createElement, domToVNode, containerToVNode, htmlToVNode, vnodeToHTML, vnodeToPrettyHTML } from '../src/vdom.js';
import { diff } from '../src/diff.js';
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

  it('style·script 안 텍스트는 이스케이프하지 않는다 (&gt;로 바뀌면 CSS가 깨짐)', () => {
    for (const html of ['<style>a > b { content: "&" }</style>', '<script>if (a < b && c) {}</script>']) {
      expect(vnodeToHTML(htmlToVNode(html))).toBe(html);
    }
  });

  it('pre·textarea 첫 줄바꿈을 지킨다 (파서가 태그 바로 뒤 줄바꿈 하나를 버림)', () => {
    for (const html of ['<pre>\n\nfoo</pre>', '<textarea>\n\nx</textarea>', '<pre>\nfoo</pre>']) {
      const v = htmlToVNode(html);
      expect(htmlToVNode(vnodeToHTML(v))).toEqual(v);
    }
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

describe('vnodeToPrettyHTML', () => {
  const SAMPLE = '<h3 class="title">오늘 할 일</h3><ul class="todo"><li class="done">장보기</li><li>운동 &amp; 스트레칭</li></ul><p>링크: <a href="https://example.com">예시</a></p>';

  it('자식이 전부 엘리먼트면 줄을 바꿔 들여쓰고, 텍스트가 섞이면 한 줄로 둔다', () => {
    expect(vnodeToPrettyHTML(htmlToVNode(SAMPLE))).toBe([
      '<h3 class="title">오늘 할 일</h3>',
      '<ul class="todo">',
      '  <li class="done">장보기</li>',
      '  <li>운동 &amp; 스트레칭</li>',
      '</ul>',
      '<p>링크: <a href="https://example.com">예시</a></p>',
    ].join('\n'));
  });

  it('여러 단계 중첩은 단계마다 두 칸씩 들여쓴다', () => {
    expect(vnodeToPrettyHTML(htmlToVNode('<div><ul><li>a</li></ul></div>'))).toBe('<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>');
  });

  it('루트에 텍스트가 섞이면 루트도 한 줄로 둔다', () => {
    expect(vnodeToPrettyHTML(htmlToVNode('hi<b>x</b>'))).toBe('hi<b>x</b>');
  });

  // 들여쓰기로 생긴 공백이 VNode에 남으면 아무것도 안 고치고 Patch를 눌러도 가짜 patch가 생긴다
  const inputs = [
    SAMPLE,
    '<pre><b>a</b><i>b</i></pre>',
    '<style>a > b {}</style><script>if (a < b) {}</script>',
    '<table><tbody><tr><td>1</td></tr></tbody></table>',
    '<p><br><img src="x.png"></p>',
    ...CASES.flatMap((c) => [c.before, c.after]),
  ];
  for (const html of inputs) {
    it(`다시 읽으면 같은 VNode, diff 없음: ${html.slice(0, 40)}`, () => {
      const v = htmlToVNode(html);
      const again = htmlToVNode(vnodeToPrettyHTML(v));
      expect(again).toEqual(v);
      expect(diff(v, again)).toEqual([]);
    });
  }
});
