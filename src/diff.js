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
  // #root 자신은 비교하지 않고 자식 리스트부터 시작 (컨테이너는 바뀌지 않는 틀)
  diffChildren(oldV.children, newV.children, [], patches);
  return patches;
}

// 같은 위치의 두 노드 비교. 순서: 타입 → 텍스트 → 속성 → 자식 재귀
function diffNode(a, b, path, patches) {
  // 태그 종류가 다르면 DOM에서 고쳐 쓸 수 없으니 새 노드로 통째로 교체
  if (a.type !== b.type) {
    patches.push({ type: PATCH.REPLACE, path, node: b });
    return; // 통째로 바뀌므로 하위는 비교하지 않는다
  }
  // 텍스트 노드는 자식이 없어서 글자만 비교하고 끝
  if (a.type === TEXT) {
    if (a.text !== b.text) patches.push({ type: PATCH.TEXT, path, text: b.text });
    return;
  }
  // set[k] = 대입은 k가 '__proto__'일 때 setter로 사라지므로 fromEntries로 만든다
  // 새 속성 중 이전에 없었거나 값이 바뀐 것만 {이름: 값} 객체로 묶음
  const set = Object.fromEntries(Object.entries(b.props).filter(([k, v]) => !Object.hasOwn(a.props, k) || a.props[k] !== v));
  // 사라진 속성의 이름만 remove 배열에 남김
  const remove = Object.keys(a.props).filter((k) => !Object.hasOwn(b.props, k));
  // set·remove 중 하나라도 있으면 PROPS patch 하나로 기록
  if (Object.keys(set).length || remove.length) patches.push({ type: PATCH.PROPS, path, set, remove });
  // 자식 리스트 비교로 내려감
  diffChildren(a.children, b.children, path, patches);
}

function diffChildren(oldC, newC, path, patches) {
  const common = Math.min(oldC.length, newC.length);
  // 겹치는 자식끼리 같은 인덱스로 짝지어 diffNode로 재귀. path에 내 인덱스를 붙여 주소를 만듦
  for (let i = 0; i < common; i++) diffNode(oldC[i], newC[i], [...path, i], patches);
  // 뒤에서부터 지워야 patch가 순서대로 적용해도 앞 인덱스가 밀리지 않는다
  // 이전 자식 리스트가 더 길면 남는 자식을 뒤에서부터 REMOVE로 등록 (path = 지울 노드)
  for (let i = oldC.length - 1; i >= common; i--) patches.push({ type: PATCH.REMOVE, path: [...path, i] });
  // 새 자식 리스트가 더 길면 남는 자식을 앞에서부터 CREATE로 등록 (path = 부모, index = 넣을 자리)
  for (let i = common; i < newC.length; i++) patches.push({ type: PATCH.CREATE, path, index: i, node: newC[i] });
}
