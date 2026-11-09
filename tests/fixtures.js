// 공용 픽스처. 계약(src/types.js)의 예시이자 diff·통합 테스트의 정답이다. Stage 1~3 에이전트는 수정하지 않는다.

/** @typedef {import('../src/types.js').VNode} VNode */
/** @typedef {import('../src/types.js').Patch} Patch */

export const text = (s) => ({ type: '#text', text: s });
export const el = (type, props = {}, ...children) => ({ type, props, children });
export const root = (...children) => ({ type: '#root', props: {}, children });
const li = (s) => el('li', {}, text(s));

/**
 * before → after 쌍. HTML과 VNode 정답을 함께 둔다(diff 테스트가 vdom 구현 없이 돌도록).
 * oldV: containerToVNode(before)의 정답 / newV: htmlToVNode(after)의 정답 (tests/fixtures.test.js가 검증)
 * patches: diff(oldV, newV)의 정답 (순서까지 일치해야 함)
 * maxMutations: patch 적용 시 MutationObserver 기록 수 상한 (childList·attributes·characterData, subtree)
 * @type {{ name: string, before: string, after: string, oldV: VNode, newV: VNode, patches: Patch[], maxMutations: number, note?: string }[]}
 */
export const CASES = [
  {
    name: '텍스트 변경',
    oldV: root(el('p', {}, text('hello'))),
    newV: root(el('p', {}, text('world'))),
    before: '<p>hello</p>',
    after: '<p>world</p>',
    patches: [{ type: 'TEXT', path: [0, 0], text: 'world' }],
    maxMutations: 1,
  },
  {
    name: '속성 변경·추가·삭제',
    oldV: root(el('div', { class: 'a', id: 'x' }, text('hi'))),
    newV: root(el('div', { class: 'b', title: 't' }, text('hi'))),
    before: '<div class="a" id="x">hi</div>',
    after: '<div class="b" title="t">hi</div>',
    patches: [{ type: 'PROPS', path: [0], set: { class: 'b', title: 't' }, remove: ['id'] }],
    maxMutations: 3,
  },
  {
    name: '자식 추가',
    oldV: root(el('ul', {}, li('1'))),
    newV: root(el('ul', {}, li('1'), li('2'))),
    before: '<ul><li>1</li></ul>',
    after: '<ul><li>1</li><li>2</li></ul>',
    patches: [{ type: 'CREATE', path: [0], index: 1, node: el('li', {}, text('2')) }],
    maxMutations: 1,
  },
  {
    name: '자식 여러 개 삭제 (내림차순)',
    oldV: root(el('ul', {}, li('1'), li('2'), li('3'), li('4'))),
    newV: root(el('ul', {}, li('1'))),
    before: '<ul><li>1</li><li>2</li><li>3</li><li>4</li></ul>',
    after: '<ul><li>1</li></ul>',
    patches: [
      { type: 'REMOVE', path: [0, 3] },
      { type: 'REMOVE', path: [0, 2] },
      { type: 'REMOVE', path: [0, 1] },
    ],
    maxMutations: 3,
  },
  {
    name: '타입 교체 (하위는 비교하지 않음)',
    oldV: root(el('ul', {}, li('1'))),
    newV: root(el('ol', {}, li('1'))),
    before: '<ul><li>1</li></ul>',
    after: '<ol><li>1</li></ol>',
    patches: [{ type: 'REPLACE', path: [0], node: el('ol', {}, el('li', {}, text('1'))) }],
    maxMutations: 1,
  },
  {
    name: '텍스트 → 엘리먼트',
    oldV: root(el('div', {}, text('hi'))),
    newV: root(el('div', {}, el('b', {}, text('hi')))),
    before: '<div>hi</div>',
    after: '<div><b>hi</b></div>',
    patches: [{ type: 'REPLACE', path: [0, 0], node: el('b', {}, text('hi')) }],
    maxMutations: 1,
  },
  {
    name: '엘리먼트 → 텍스트',
    oldV: root(el('div', {}, el('b', {}, text('hi')))),
    newV: root(el('div', {}, text('hi'))),
    before: '<div><b>hi</b></div>',
    after: '<div>hi</div>',
    patches: [{ type: 'REPLACE', path: [0, 0], node: text('hi') }],
    maxMutations: 1,
  },
  {
    name: '빈 영역 → 내용',
    oldV: root(),
    newV: root(el('p', {}, text('a'))),
    before: '',
    after: '<p>a</p>',
    patches: [{ type: 'CREATE', path: [], index: 0, node: el('p', {}, text('a')) }],
    maxMutations: 1,
  },
  {
    name: '내용 → 빈 영역',
    oldV: root(el('p', {}, text('a')), el('p', {}, text('b'))),
    newV: root(),
    before: '<p>a</p><p>b</p>',
    after: '',
    patches: [
      { type: 'REMOVE', path: [1] },
      { type: 'REMOVE', path: [0] },
    ],
    maxMutations: 2,
  },
  {
    name: '맨 앞에 삽입 (key 없는 인덱스 비교의 한계)',
    oldV: root(el('ul', {}, li('a'), li('b'))),
    newV: root(el('ul', {}, li('new'), li('a'), li('b'))),
    before: '<ul><li>a</li><li>b</li></ul>',
    after: '<ul><li>new</li><li>a</li><li>b</li></ul>',
    patches: [
      { type: 'TEXT', path: [0, 0, 0], text: 'new' },
      { type: 'TEXT', path: [0, 1, 0], text: 'a' },
      { type: 'CREATE', path: [0], index: 2, node: el('li', {}, text('b')) },
    ],
    maxMutations: 3,
    note: '이상적으로는 맨 앞 CREATE 1번이면 되지만, 위치로 짝지으므로 3번이 된다. key가 이 문제를 푼다.',
  },
  {
    name: '깊은 중첩 텍스트',
    oldV: root(el('div', {}, el('section', {}, el('p', {}, el('span', {}, text('a')))))),
    newV: root(el('div', {}, el('section', {}, el('p', {}, el('span', {}, text('b')))))),
    before: '<div><section><p><span>a</span></p></section></div>',
    after: '<div><section><p><span>b</span></p></section></div>',
    patches: [{ type: 'TEXT', path: [0, 0, 0, 0, 0], text: 'b' }],
    maxMutations: 1,
  },
  {
    name: '특수문자 텍스트·속성 (자기 patch → 자식 순서)',
    oldV: root(el('p', { title: 'a' }, text('x'))),
    newV: root(el('p', { title: '"q" & <x>' }, text('1 < 2 & 3'))),
    before: '<p title="a">x</p>',
    after: '<p title="&quot;q&quot; &amp; &lt;x&gt;">1 &lt; 2 &amp; 3</p>',
    patches: [
      { type: 'PROPS', path: [0], set: { title: '"q" & <x>' }, remove: [] },
      { type: 'TEXT', path: [0, 0], text: '1 < 2 & 3' },
    ],
    maxMutations: 2,
  },
  {
    name: '여러 변경이 섞인 경우',
    oldV: root(el('div', { id: 'app' }, el('h1', {}, text('Title')), el('p', { class: 'a' }, text('x')))),
    newV: root(el('div', { id: 'app' }, el('h1', {}, text('New')), el('p', { class: 'b' }, text('x')), el('span', {}, text('added')))),
    before: '<div id="app"><h1>Title</h1><p class="a">x</p></div>',
    after: '<div id="app"><h1>New</h1><p class="b">x</p><span>added</span></div>',
    patches: [
      { type: 'TEXT', path: [0, 0, 0], text: 'New' },
      { type: 'PROPS', path: [0, 1], set: { class: 'b' }, remove: [] },
      { type: 'CREATE', path: [0], index: 2, node: el('span', {}, text('added')) },
    ],
    maxMutations: 3,
  },
  {
    name: '형제 사이 공백만 다름 → 변경 없음',
    oldV: root(el('ul', {}, li('a'))),
    newV: root(el('ul', {}, li('a'))),
    before: '<ul>\n  <li>a</li>\n</ul>',
    after: '<ul><li>a</li></ul>',
    patches: [],
    maxMutations: 0,
  },
  {
    name: '완전히 같음 → 변경 없음',
    oldV: root(el('p', { class: 'x' }, text('same'))),
    newV: root(el('p', { class: 'x' }, text('same'))),
    before: '<p class="x">same</p>',
    after: '<p class="x">same</p>',
    patches: [],
    maxMutations: 0,
  },
];
