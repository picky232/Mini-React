/** @typedef {import('./contracts.js').VNode} VNode */

/**
 * 트리를 재귀 복사해 호출자가 원본을 나중에 바꿔도 저장된 화면이 유지되게 한다.
 * 이벤트는 등록과 해제에 같은 함수가 필요하므로 함수 참조를 그대로 저장한다.
 * @param {VNode} node
 * @returns {VNode}
 */
function copyVNode(node) {
  if (node?.kind === 'text' && typeof node.value === 'string') {
    return { kind: 'text', value: node.value };
  }
  if (node?.kind !== 'element' || typeof node.tag !== 'string' || !Array.isArray(node.children)
    || !node.props?.attrs || !node.props?.events) {
    throw new TypeError('Expected an ElementVNode or TextVNode.');
  }

  /** @type {import('./contracts.js').ElementVNode} */
  const copy = {
    kind: 'element',
    tag: node.tag,
    props: { attrs: { ...node.props.attrs }, events: { ...node.props.events } },
    children: node.children.map(copyVNode),
  };
  // key가 빠지면 이력끼리 비교할 때 위치 비교로 돌아가므로 함께 복사한다.
  return node.key === undefined ? copy : { ...copy, key: node.key };
}

/**
 * 첫 화면을 0번에 저장한다. null도 빈 화면을 뜻하는 유효한 스냅샷이다.
 * @type {import('./contracts.js').CreateHistory}
 */
export function createHistory(initial) {
  return { entries: [initial === null ? null : copyVNode(initial)], index: 0 };
}

/**
 * 현재 index까지 남긴 배열에 새 스냅샷을 추가한다.
 * 예를 들어 [A, B, C]에서 index가 1이면 B가 현재다.
 * D를 저장하면 [A, B, D]의 index 2가 되고 기존 배열에는 C가 남는다.
 * @type {import('./contracts.js').PushHistory}
 */
export function pushHistory(history, next) {
  getCurrent(history);
  const entries = history.entries.slice(0, history.index + 1);
  entries.push(next === null ? null : copyVNode(next));
  return { entries, index: entries.length - 1 };
}

/**
 * 현재 위치를 한 칸 뒤로 옮긴다. 스냅샷 배열은 불변 값으로 공유한다.
 * 이미 첫 화면이면 받은 History를 그대로 반환한다.
 * @type {import('./contracts.js').Undo}
 */
export function undo(history) {
  getCurrent(history);
  if (history.index === 0) return history;
  return { entries: history.entries, index: history.index - 1 };
}

/**
 * 현재 위치를 한 칸 앞으로 옮긴다. 마지막 화면이면 현재 이력을 유지한다.
 * @type {import('./contracts.js').Redo}
 */
export function redo(history) {
  getCurrent(history);
  if (history.index === history.entries.length - 1) return history;
  return { entries: history.entries, index: history.index + 1 };
}

/**
 * 현재 위치의 스냅샷을 반환한다. index의 유효성도 여기서 확인한다.
 * @type {import('./contracts.js').GetCurrent}
 */
export function getCurrent(history) {
  if (!Array.isArray(history?.entries) || typeof history.index !== 'number') {
    throw new TypeError('History requires entries and a numeric index.');
  }
  const { entries, index } = history;
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    throw new RangeError('History index is outside the entries.');
  }

  const snapshot = entries[index];
  // null은 저장한 빈 화면이다. undefined는 해당 자리에 스냅샷이 없음을 뜻한다.
  if (snapshot === undefined) throw new TypeError('History entry is missing.');
  return snapshot;
}
