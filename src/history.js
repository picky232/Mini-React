/** @typedef {import('./types.js').VNode} VNode */

/**
 * VDOM 기록. 뒤로 간 상태에서 push하면 앞쪽 기록을 잘라낸다. 경계에서 back/forward는 이동하지 않는다.
 * back/forward는 이동한 뒤의 current를 반환한다.
 * @param {VNode} initial
 * @returns {{
 *   current: () => VNode,
 *   push: (v: VNode) => void,
 *   back: () => VNode,
 *   forward: () => VNode,
 *   canBack: () => boolean,
 *   canForward: () => boolean,
 * }}
 */
export function createHistory(initial) {
  const stack = [initial];
  let index = 0;

  const canBack = () => index > 0;
  const canForward = () => index < stack.length - 1;
  const current = () => stack[index];

  return {
    current,
    canBack,
    canForward,
    push(v) {
      stack.splice(index + 1); // 뒤로 간 상태였다면 앞쪽 기록을 버린다
      stack.push(v);
      index++;
    },
    back() {
      if (canBack()) index--;
      return current();
    },
    forward() {
      if (canForward()) index++;
      return current();
    },
  };
}
