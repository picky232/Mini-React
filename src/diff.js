/** @typedef {import('./types.js').VNode} VNode */
/** @typedef {import('./types.js').Patch} Patch */
import { PATCH, TEXT } from './types.js';

/**
 * 두 #root VNode를 비교해 Patch 배열을 만든다. DOM을 쓰지 않는 순수 함수.
 * 순서 규칙은 src/types.js 참고.
 * @param {VNode} oldV
 * @param {VNode} newV
 * @returns {Patch[]}
 */
export function diff(oldV, newV) {
  const patches = [];
  diffChildren(oldV.children, newV.children, [], patches);
  return patches;
}

// 같은 위치의 두 노드 비교. 순서: 타입 → 텍스트 → 속성 → 자식 재귀
function diffNode(a, b, path, patches) {
  if (a.type !== b.type) {
    patches.push({ type: PATCH.REPLACE, path, node: b });
    return; // 통째로 바뀌므로 하위는 비교하지 않는다
  }
  if (a.type === TEXT) {
    if (a.text !== b.text) patches.push({ type: PATCH.TEXT, path, text: b.text });
    return;
  }
  // set[k] = 대입은 k가 '__proto__'일 때 setter로 사라지므로 fromEntries로 만든다
  const set = Object.fromEntries(Object.entries(b.props).filter(([k, v]) => !Object.hasOwn(a.props, k) || a.props[k] !== v));
  const remove = Object.keys(a.props).filter((k) => !Object.hasOwn(b.props, k));
  if (Object.keys(set).length || remove.length) patches.push({ type: PATCH.PROPS, path, set, remove });
  diffChildren(a.children, b.children, path, patches);
}

function diffChildren(oldC, newC, path, patches) {
  const common = Math.min(oldC.length, newC.length);
  for (let i = 0; i < common; i++) diffNode(oldC[i], newC[i], [...path, i], patches);
  // 뒤에서부터 지워야 patch가 순서대로 적용해도 앞 인덱스가 밀리지 않는다
  for (let i = oldC.length - 1; i >= common; i--) patches.push({ type: PATCH.REMOVE, path: [...path, i] });
  for (let i = common; i < newC.length; i++) patches.push({ type: PATCH.CREATE, path, index: i, node: newC[i] });
}
