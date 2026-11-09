// Stage 3 엣지 케이스 사냥꾼. docs/PHASE1_PLAN.md 4장 목록과 fixtures CASES 에 없는 입력만 다룬다.
// 모든 테스트는 diff → patch 왕복 결과가 "새 HTML"과 같은지로 검증한다.
import { describe, it, expect, beforeEach } from 'vitest';
import { containerToVNode, htmlToVNode, vnodeToHTML } from '../src/vdom.js';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';

let container;
beforeEach(() => {
  container = document.createElement('div');
});

const parse = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.innerHTML;
};

// A로 채운 컨테이너에 diff→patch 로 B를 반영하고 결과를 검증한다.
// raw: 결과 DOM 의 innerHTML 이 브라우저가 B 를 파싱한 결과와 같은지까지 본다(주석·공백 노드가 없는 입력만).
function roundtrip(A, B, { raw = true } = {}) {
  container.innerHTML = A;
  const oldV = containerToVNode(container);
  const newV = htmlToVNode(B);
  const patches = diff(oldV, newV);
  patch(container, patches);
  expect(containerToVNode(container)).toEqual(newV);
  if (raw) expect(container.innerHTML).toBe(parse(B));
  return patches;
}

describe('edge: diff→patch 왕복', () => {
  it('같은 부모에서 속성과 자식이 동시에 바뀐다', () => {
    const ps = roundtrip(
      '<ul class="a" id="x"><li>1</li><li>2</li></ul>',
      '<ul class="b" data-n="2"><li>1</li><li>two</li><li>3</li></ul>',
    );
    expect(ps.length).toBeGreaterThan(2);
  });

  it('한 서브트리는 줄어들고 형제 서브트리는 늘어난다 (중첩 삭제 + 추가 혼합)', () => {
    roundtrip(
      '<section><p>a</p><p>b</p><p>c</p></section><aside><i>x</i></aside>',
      '<section><p>a</p></section><aside><i>x</i><i>y</i><i>z</i></aside>',
    );
  });

  it('여러 레벨에서 동시에 REMOVE 된다', () => {
    const ps = roundtrip(
      '<ul><li><b>1</b><i>2</i><u>3</u></li><li>x</li><li>y</li></ul><p>z</p><p>w</p>',
      '<ul><li><b>1</b></li></ul><p>z</p>',
    );
    expect(ps.every((p) => p.type !== 'CREATE')).toBe(true);
  });

  it('빈 속성값(disabled="")을 추가·삭제한다', () => {
    roundtrip('<button>ok</button>', '<button disabled="" title="">ok</button>');
    roundtrip('<button disabled="" title="">ok</button>', '<button>ok</button>');
    // 값이 있다가 빈 문자열로: undefined 와 '' 를 혼동하면 patch 가 비어 버린다
    expect(roundtrip('<a href="/x">l</a>', '<a href="">l</a>')).toHaveLength(1);
  });

  it('대문자 태그·속성 입력은 소문자로 정규화되어 같은 노드로 취급된다', () => {
    const ps = roundtrip('<div class="a"><p>hi</p></div>', '<DIV CLASS="a"><P>hi</P></DIV>');
    expect(ps).toEqual([]);
    roundtrip('<div><p>hi</p></div>', '<DIV ID="Q"><SPAN>hi</SPAN></DIV>');
  });

  it('텍스트 앞뒤 공백은 보존되고, 공백 개수만 달라도 TEXT patch 가 나온다', () => {
    const ps = roundtrip('<p> a </p>', '<p>  a  </p>');
    expect(ps).toEqual([{ type: 'TEXT', path: [0, 0], text: '  a  ' }]);
    expect(container.firstChild.firstChild.nodeValue).toBe('  a  ');
  });

  it('공백만 있던 자식이 내용을 얻고, 내용이 공백만 남는다', () => {
    // 공백 전용 노드는 계약상 VNode 에서 버려지므로 DOM 문자열이 아니라 VNode 로 비교한다
    roundtrip('<p>   </p>', '<p>x</p>', { raw: false });
    roundtrip('<p>x</p>', '<p>   </p>', { raw: false });
  });

  it('들여쓰기된 HTML 에서 DOM 공백 노드가 있어도 인덱스가 맞는다', () => {
    roundtrip(
      '<ul>\n  <li>a</li>\n  <li>b</li>\n  <li>c</li>\n</ul>',
      '<ul><li>a</li></ul>',
      { raw: false },
    );
    roundtrip(
      '<ul>\n  <li>a</li>\n</ul>',
      '<ul><li>a</li><li>b</li><li>c</li></ul>',
      { raw: false },
    );
  });

  it('속성 순서만 바뀌면 patch 가 없다', () => {
    const ps = roundtrip('<a href="1" class="2">x</a>', '<a class="2" href="1">x</a>', { raw: false });
    expect(ps).toEqual([]);
  });

  it('엘리먼트 교체 뒤에 오는 형제도 올바르게 바뀐다', () => {
    roundtrip('<div><p>a</p><p>b</p></div>', '<div><span>a</span><p>c</p></div>');
  });

  it('void 엘리먼트(br, img) 개수 변화', () => {
    roundtrip('<p>a<br>b</p>', '<p>a<br><br>b<img src="x.png"></p>');
    roundtrip('<p>a<br><br>b<img src="x.png"></p>', '<p>a<br>b</p>');
  });

  it('텍스트에 든 엔티티 문자열은 엘리먼트가 아니라 텍스트로 남는다', () => {
    roundtrip('<p>b</p>', '<p>&lt;b&gt;bold&lt;/b&gt; &amp;amp;</p>');
  });

  it('A→B 후 B→A 로 돌아오면 원래 HTML 이 된다 (뒤로 가기)', () => {
    const A = '<div id="a"><p>x</p><p>y</p><span>z</span></div><em>e</em>';
    const B = '<div class="b"><p>x2</p></div><h1>t</h1><h2>u</h2>';
    container.innerHTML = A;
    const vA = containerToVNode(container);
    const vB = htmlToVNode(B);
    patch(container, diff(vA, vB));
    patch(container, diff(vB, vA));
    expect(container.innerHTML).toBe(parse(A));
  });
});

describe('edge: 정규화 한계 (실패하면 구현 버그 후보)', () => {
  it('&nbsp; 만 있는 텍스트는 의미 있는 내용이므로 버려지면 안 된다', () => {
    roundtrip('<p>x</p>', '<p>&nbsp;</p>');
    expect(container.textContent).toBe(' ');
  });

  it('__proto__ 라는 이름의 속성이 VNode props 에서 사라지면 안 된다', () => {
    roundtrip('<div></div>', '<div __proto__="x"></div>');
    expect(container.firstChild.getAttribute('__proto__')).toBe('x');
  });

  it('주석으로 갈라진 텍스트: vnodeToHTML 로 직렬화한 뒤 다시 파싱해도 같은 VNode 여야 한다', () => {
    // Patch 버튼 흐름: textarea 값 = vnodeToHTML(현재) → 사용자가 수정 안 함 → htmlToVNode → diff 는 [] 이어야 한다
    container.innerHTML = '<p>a<b>x</b>c</p>';
    const newV = htmlToVNode('<p>a<!-- c -->c</p>');
    patch(container, diff(containerToVNode(container), newV));
    const reparsed = htmlToVNode(vnodeToHTML(containerToVNode(container)));
    expect(diff(containerToVNode(container), reparsed)).toEqual([]);
  });
});
