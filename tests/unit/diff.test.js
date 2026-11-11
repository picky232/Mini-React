import { describe, expect, test } from 'vitest';
import { diff } from '../../src/core/diff.js';
import { createTextVNode, h } from '../../src/core/vnode.js';

const text = createTextVNode;
const element = (tag, children = [], attrs = {}, events = {}) => h(tag, { attrs, events }, children);
const li = (value) => element('li', [value]);
const changes = (overrides = {}) => ({ setAttrs: {}, removeAttrs: [], setEvents: {}, removeEvents: [], ...overrides });

// 중첩 객체·배열까지 동결해 재귀 비교 도중의 입력 변경도 실패하게 한다.
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('diff: 무변경과 루트 처리', () => {
  test('빈 트리끼리는 변경이 없다', () => {
    expect(diff(null, null)).toEqual([]);
  });

  test('같은 참조의 트리는 변경이 없다', () => {
    const tree = deepFreeze(element('div', [element('p', ['same'])]));
    expect(diff(tree, tree)).toEqual([]);
  });

  test('참조가 달라도 구조와 값이 같으면 변경이 없다', () => {
    const click = () => {};
    const makeTree = () => element('div', [' ', element('button', ['go'], { disabled: '' }, { click })]);
    expect(diff(makeTree(), makeTree())).toEqual([]);
    expect(diff(text('same'), text('same'))).toEqual([]);
  });

  test.each([text('root'), element('div', ['root'])])('빈 루트에 노드를 추가한다: %j', (node) => {
    expect(diff(null, node)).toEqual([{ type: 'INSERT', path: [], node }]);
  });

  test.each([text('root'), element('div', ['root'])])('루트 노드를 삭제한다: %j', (node) => {
    expect(diff(node, null)).toEqual([{ type: 'REMOVE', path: [] }]);
  });

  test.each([
    { previous: text('before'), next: element('p', ['after']) },
    { previous: element('p', ['before']), next: text('after') },
    { previous: element('div', [element('b', ['before'])]), next: element('section', ['after']) },
  ])('종류 또는 태그가 바뀌면 하위 변경 없이 루트만 교체한다', ({ previous, next }) => {
    expect(diff(previous, next)).toEqual([{ type: 'REPLACE', path: [], node: next }]);
  });

  test('텍스트 값이 바뀌면 TEXT를 반환한다', () => {
    expect(diff(text('before'), text('after'))).toEqual([{ type: 'TEXT', path: [], value: 'after' }]);
  });

  test('공백과 빈 텍스트도 서로 다른 값이다', () => {
    expect(diff(text(' '), text(''))).toEqual([{ type: 'TEXT', path: [], value: '' }]);
  });

  test('실제 DOM 전역 없이 순수 데이터만 비교한다', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(diff(element('p', ['a']), element('p', ['b']))).toEqual([
      { type: 'TEXT', path: [0], value: 'b' },
    ]);
  });
});

describe('diff: 속성과 이벤트', () => {
  test.each([
    { previous: {}, next: { title: 'new' }, expected: { setAttrs: { title: 'new' } } },
    { previous: { title: 'old' }, next: { title: 'new' }, expected: { setAttrs: { title: 'new' } } },
    { previous: { title: 'old' }, next: {}, expected: { removeAttrs: ['title'] } },
    { previous: {}, next: { disabled: '' }, expected: { setAttrs: { disabled: '' } } },
    { previous: { disabled: '' }, next: {}, expected: { removeAttrs: ['disabled'] } },
    { previous: { disabled: '' }, next: { disabled: 'false' }, expected: { setAttrs: { disabled: 'false' } } },
  ])('속성 추가·수정·삭제를 구분한다: $previous → $next', ({ previous, next, expected }) => {
    expect(diff(element('button', [], previous), element('button', [], next))).toEqual([
      { type: 'PROPS', path: [], changes: changes(expected) },
    ]);
  });

  test('속성 추가·수정·삭제를 하나의 PROPS에 모은다', () => {
    const before = element('div', [], { class: 'old', title: 'gone', 'data-keep': 'same' });
    const after = element('div', [], { class: 'new', id: 'added', 'data-keep': 'same' });
    expect(diff(before, after)).toEqual([
      { type: 'PROPS', path: [], changes: changes({ setAttrs: { class: 'new', id: 'added' }, removeAttrs: ['title'] }) },
    ]);
  });

  test('상속된 프로퍼티를 실제 속성으로 오인하지 않는다', () => {
    const attrs = Object.fromEntries([['__proto__', 'kept'], ['constructor', 'own']]);
    expect(diff(element('div'), element('div', [], attrs))).toEqual([
      { type: 'PROPS', path: [], changes: changes({ setAttrs: attrs }) },
    ]);
    expect(diff(element('div', [], attrs), element('div'))).toEqual([
      { type: 'PROPS', path: [], changes: changes({ removeAttrs: ['__proto__', 'constructor'] }) },
    ]);
  });

  test('이벤트를 추가·교체·제거하고 같은 함수 참조는 유지한다', () => {
    const oldClick = () => {};
    const newClick = () => {};
    const focus = () => {};
    const blur = () => {};
    const previous = element('button', [], {}, { click: oldClick, focus, blur });
    const next = element('button', [], {}, { click: newClick, focus, input: newClick });
    expect(diff(previous, next)).toEqual([
      { type: 'PROPS', path: [], changes: changes({ setEvents: { click: newClick, input: newClick }, removeEvents: ['blur'] }) },
    ]);
    expect(diff(element('button', [], {}, { click: oldClick }), element('button', [], {}, { click: oldClick }))).toEqual([]);
  });

  test('내용이 같아 보이는 함수도 참조가 다르면 교체한다', () => {
    const oldClick = () => 'same';
    const newClick = () => 'same';
    expect(diff(element('button', [], {}, { click: oldClick }), element('button', [], {}, { click: newClick }))).toEqual([
      { type: 'PROPS', path: [], changes: changes({ setEvents: { click: newClick } }) },
    ]);
  });
});

describe('diff: 재귀 경로와 자식 변경 순서', () => {
  test('깊게 중첩된 노드의 속성과 텍스트 경로를 전달한다', () => {
    const previous = element('main', [element('section', [element('p', ['old'], { title: 'old' })])]);
    const next = element('main', [element('section', [element('p', ['new'], { title: 'new' })])]);
    expect(diff(previous, next)).toEqual([
      { type: 'PROPS', path: [0, 0], changes: changes({ setAttrs: { title: 'new' } }) },
      { type: 'TEXT', path: [0, 0, 0], value: 'new' },
    ]);
  });

  test('공백 Text도 인덱스에 포함한다', () => {
    expect(diff(element('div', [' ', element('p', ['old'])]), element('div', [' ', element('p', ['new'])]))).toEqual([
      { type: 'TEXT', path: [1, 0], value: 'new' },
    ]);
  });

  test('빈 부모에 자식을 앞에서부터 추가한다', () => {
    const next = element('ul', [li('A'), li('B'), li('C')]);
    expect(diff(element('ul'), next)).toEqual([
      { type: 'INSERT', path: [0], node: next.children[0] },
      { type: 'INSERT', path: [1], node: next.children[1] },
      { type: 'INSERT', path: [2], node: next.children[2] },
    ]);
  });

  test('기존 자식을 유지하면서 여러 자식을 끝에 추가한다', () => {
    const next = element('ul', [li('A'), li('B'), li('C')]);
    expect(diff(element('ul', [li('A')]), next)).toEqual([
      { type: 'INSERT', path: [1], node: next.children[1] },
      { type: 'INSERT', path: [2], node: next.children[2] },
    ]);
  });

  test('여러 자식 삭제는 뒤에서부터 수행해 인덱스 이동을 피한다', () => {
    expect(diff(element('ul', [li('A'), li('B'), li('C'), li('D')]), element('ul', [li('A')]))).toEqual([
      { type: 'REMOVE', path: [3] },
      { type: 'REMOVE', path: [2] },
      { type: 'REMOVE', path: [1] },
    ]);
  });

  test('모든 자식을 삭제해도 부모는 유지한다', () => {
    expect(diff(element('div', ['A', 'B', 'C']), element('div'))).toEqual([
      { type: 'REMOVE', path: [2] },
      { type: 'REMOVE', path: [1] },
      { type: 'REMOVE', path: [0] },
    ]);
  });

  test('중첩된 여러 형제의 삭제 경로를 서로 섞지 않는다', () => {
    const previous = element('main', [element('div', ['A', 'B', 'C']), element('p', ['X', 'Y', 'Z'])]);
    const next = element('main', [element('div', ['A!']), element('p', ['X'])]);
    expect(diff(previous, next)).toEqual([
      { type: 'TEXT', path: [0, 0], value: 'A!' },
      { type: 'REMOVE', path: [0, 2] },
      { type: 'REMOVE', path: [0, 1] },
      { type: 'REMOVE', path: [1, 2] },
      { type: 'REMOVE', path: [1, 1] },
    ]);
  });

  test('다섯 종류의 변경이 동시에 있어도 적용 가능한 순서로 반환한다', () => {
    const previous = element('section', [
      element('div', ['A', element('em', ['obsolete']), 'tail']),
      element('p', ['replace']),
      element('ul', [li('first')]),
    ], { class: 'old', title: 'gone' });
    const next = element('section', [
      element('div', ['B']),
      element('article', ['replacement']),
      element('ul', [li('first'), li('second'), li('third')]),
    ], { class: 'new', id: 'added' });
    expect(diff(previous, next)).toEqual([
      { type: 'PROPS', path: [], changes: changes({ setAttrs: { class: 'new', id: 'added' }, removeAttrs: ['title'] }) },
      { type: 'TEXT', path: [0, 0], value: 'B' },
      { type: 'REMOVE', path: [0, 2] },
      { type: 'REMOVE', path: [0, 1] },
      { type: 'REPLACE', path: [1], node: next.children[1] },
      { type: 'INSERT', path: [2, 1], node: next.children[2].children[1] },
      { type: 'INSERT', path: [2, 2], node: next.children[2].children[2] },
    ]);
  });

  test('맨 앞 삽입도 노드 이동을 찾지 않고 같은 인덱스끼리 비교한다', () => {
    const next = element('ul', [li('X'), li('A'), li('B')]);
    expect(diff(element('ul', [li('A'), li('B')]), next)).toEqual([
      { type: 'TEXT', path: [0, 0], value: 'X' },
      { type: 'TEXT', path: [1, 0], value: 'A' },
      { type: 'INSERT', path: [2], node: next.children[2] },
    ]);
  });

  test('중간 삭제는 같은 인덱스의 값을 변경한 뒤 남는 끝 노드를 삭제한다', () => {
    expect(diff(element('ul', [li('A'), li('B'), li('C')]), element('ul', [li('A'), li('C')]))).toEqual([
      { type: 'TEXT', path: [1, 0], value: 'C' },
      { type: 'REMOVE', path: [2] },
    ]);
  });

  test('리스트 순서 변경에 MOVE를 만들지 않고 위치별 텍스트를 갱신한다', () => {
    const a = li('A');
    const b = li('B');
    expect(diff(element('ul', [a, b]), element('ul', [b, a]))).toEqual([
      { type: 'TEXT', path: [0, 0], value: 'B' },
      { type: 'TEXT', path: [1, 0], value: 'A' },
    ]);
  });
});

describe('diff: 입력 불변성과 호출 독립성', () => {
  test('중첩된 입력과 props·이벤트·배열을 수정하지 않는다', () => {
    const click = () => {};
    const previous = deepFreeze(element('div', [element('p', ['old', 'gone'])], { title: 'old' }, { click }));
    const next = deepFreeze(element('div', [element('p', ['new'])], { id: 'new' }));
    expect(diff(previous, next)).toEqual([
      { type: 'PROPS', path: [], changes: changes({ setAttrs: { id: 'new' }, removeAttrs: ['title'], removeEvents: ['click'] }) },
      { type: 'TEXT', path: [0, 0], value: 'new' },
      { type: 'REMOVE', path: [0, 1] },
    ]);
    expect(previous.children[0].children).toEqual([text('old'), text('gone')]);
    expect(previous.props).toEqual({ attrs: { title: 'old' }, events: { click } });
    expect(next.children[0].children).toEqual([text('new')]);
    expect(next.props).toEqual({ attrs: { id: 'new' }, events: {} });
  });

  test('추가할 VNode는 불변 값으로 참조하고 입력에 경로 등을 추가하지 않는다', () => {
    const next = deepFreeze(element('div', ['new']));
    const patches = diff(null, next);
    expect(patches[0].node).toBe(next);
    expect(Object.keys(next)).toEqual(['kind', 'tag', 'props', 'children']);
  });

  test('호출마다 결과와 경로를 분리한다', () => {
    const previous = element('div', [element('p', ['old']), 'tail']);
    const next = element('div', [element('p', ['new']), 'changed']);
    const first = diff(previous, next);
    const second = diff(previous, next);
    expect(first).toEqual([
      { type: 'TEXT', path: [0, 0], value: 'new' },
      { type: 'TEXT', path: [1], value: 'changed' },
    ]);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0].path).not.toBe(first[0].path);
    expect(first[0].path).not.toBe(first[1].path);
  });
});
