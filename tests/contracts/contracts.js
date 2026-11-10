/**
 * npm run typecheck 전용 fixture. Vitest 테스트 수에는 포함되지 않는다.
 * @ts-expect-error는 잘못된 계약이 허용되면 오히려 검사를 실패시킨다.
 */

/** @typedef {import('../../src/core/contracts.js').VNode} VNode */
/** @typedef {import('../../src/core/contracts.js').Patch} Patch */
/** @typedef {import('../../src/core/contracts.js').History} History */

/** @type {VNode} */
const text = { kind: 'text', value: 'hello' };

/** @type {VNode} */
const element = {
  kind: 'element',
  tag: 'button',
  props: { attrs: { disabled: '', class: 'primary' }, events: { click: () => {} } },
  children: [text],
};

/** @type {ReadonlyArray<Patch>} */
const patches = [
  { type: 'INSERT', path: [], node: element },
  { type: 'TEXT', path: [0], value: 'next' },
  {
    type: 'PROPS',
    path: [],
    changes: { setAttrs: { title: 'next' }, removeAttrs: ['disabled'], setEvents: {}, removeEvents: ['click'] },
  },
  { type: 'REPLACE', path: [0], node: text },
  { type: 'REMOVE', path: [] },
];

/** @type {History} */
const history = { entries: [null, element], index: 1 };

/** @type {VNode} */
// @ts-expect-error 텍스트의 value는 문자열이어야 한다.
const invalidText = { kind: 'text', value: 1 };

/** @type {Patch} */
// @ts-expect-error INSERT는 node가 필수다.
const missingNode = { type: 'INSERT', path: [] };

/** @type {Patch} */
// @ts-expect-error 정의되지 않은 Patch 종류는 허용하지 않는다.
const unknownPatch = { type: 'MOVE', path: [] };

/** @type {Patch} */
// @ts-expect-error 경로에는 문자열 인덱스를 넣을 수 없다.
const invalidPath = { type: 'REMOVE', path: ['0'] };

/** @type {import('../../src/core/contracts.js').Attributes} */
// @ts-expect-error DOM 속성은 boolean 대신 문자열로 정규화한다.
const invalidAttribute = { disabled: true };

/** @type {import('../../src/core/contracts.js').Events} */
// @ts-expect-error 이벤트는 문자열 대신 함수 참조로 저장한다.
const invalidEvent = { click: 'handleClick()' };

// 실행되지 않는 함수 안에서도 readonly 계약의 위반을 검사한다.
function rejectMutation() {
  // @ts-expect-error VNode 값은 직접 변경하지 않는다.
  text.value = 'mutated';
  // @ts-expect-error children 배열은 직접 변경하지 않는다.
  element.children.push(text);
  // @ts-expect-error 속성 객체도 직접 변경하지 않는다.
  element.props.attrs.class = 'changed';
  const firstPatch = patches[0];
  if (firstPatch) {
    // @ts-expect-error Patch 경로는 직접 변경하지 않는다.
    firstPatch.path.push(1);
  }
  // @ts-expect-error 이력 배열은 직접 변경하지 않는다.
  history.entries.push(null);
}

export {};
