import { FunctionComponent, child } from '../component/function-component.js';
import { h } from '../core/vnode.js';
import { describePatch } from './patch-report.js';

/** @typedef {import('../core/contracts.js').PatchList} PatchList */
/** @typedef {{ patches: PatchList, hooks: readonly { kind: string }[], renders: number, memoHits: number }} CommitInfo */

const HOOK_NAME = /** @type {Record<string, string>} */ ({ state: 'useState', memo: 'useMemo', effect: 'useEffect' });
/** @param {string} text */
const short = (text, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// 함수는 JSON에 나오지 않으므로 ƒ로 표시한다.
/** @param {unknown} value */
const show = (value) => {
  if (value === undefined) return '—';
  try {
    return JSON.stringify(value, (_, x) => (typeof x === 'function' ? 'ƒ' : x)) ?? 'ƒ';
  } catch {
    return String(value); // BigInt·순환 참조처럼 JSON으로 못 바꾸는 값
  }
};
const P = { attrs: {}, events: {} };

/** @param {{ hook: Record<string, unknown>, index: number }} props */
export function HookRow({ hook, index }) {
  const value = hook.kind === 'effect' ? (hook.cleanup ? 'cleanup 있음' : '—') : show(hook.value);
  const deps = hook.kind === 'state' ? '' : show(hook.dependencies);
  return h('tr', P, [
    h('td', P, [index]),
    h('td', P, [h('span', { attrs: { class: `tag tag-${String(hook.kind)}` }, events: {} }, [HOOK_NAME[String(hook.kind)] ?? String(hook.kind)])]),
    h('td', { attrs: { title: value }, events: {} }, [short(value)]),
    h('td', { attrs: { title: deps }, events: {} }, [short(deps, 30)]),
  ]);
}

/** @param {{ info: CommitInfo | null }} props */
function Inspector({ info }) {
  if (info === null) return h('p', { attrs: { class: 'inspector-empty' }, events: {} }, ['아직 렌더하지 않았어요.']);
  const log = info.patches.length > 0
    ? info.patches.map((patch) => {
      const { type, target, detail } = describePatch(patch);
      return h('li', P, [h('span', { attrs: { class: `tag tag-${type}` }, events: {} }, [type]), ' ', h('code', P, [target]), ' ', detail]);
    })
    : [h('li', P, ['바뀐 부분이 없어 DOM을 건드리지 않았어요.'])];
  return h('div', { attrs: { class: 'inspector-body' }, events: {} }, [
    h('p', { attrs: { class: 'inspector-sub' }, events: {} }, [
      `렌더 #${info.renders} · Patch ${info.patches.length}건 · memo로 건너뛴 자식 ${info.memoHits}개. 루트 함수는 렌더마다 처음부터 다시 실행되지만, 상태는 함수 바깥의 hooks 배열에 남아 호출 순서(#)로 자기 칸을 찾아요.`,
    ]),
    h('table', { attrs: { class: 'hooks' }, events: {} }, [
      h('thead', P, [h('tr', P, [h('th', P, ['#']), h('th', P, ['hook']), h('th', P, ['값']), h('th', P, ['deps'])])]),
      h('tbody', P, info.hooks.map((hook, index) => child(HookRow, { hook: /** @type {Record<string, unknown>} */ (hook), index }))),
    ]),
    h('ol', { attrs: { class: 'patch-log', 'aria-label': '이번 렌더의 Patch' }, events: {} }, log),
  ]);
}

/**
 * 대상 컴포넌트가 화면에 반영될 때마다 인스펙터도 미니 리액트로 다시 그린다.
 * @param {FunctionComponent<any>} target
 * @param {HTMLElement} container
 */
export function attachInspector(target, container) {
  /** @type {CommitInfo | null} */
  let latest = null;
  const inspector = new FunctionComponent(() => Inspector({ info: latest }), {});
  inspector.mount(container);
  target.onCommit = (info) => {
    // hooks 배열은 계속 바뀌므로 지금 모습을 복사해 둔다.
    latest = { patches: info.patches, hooks: info.hooks.map((hook) => ({ ...hook })), renders: info.renders, memoHits: info.memoHits };
    inspector.update();
  };
  return () => {
    target.onCommit = null;
    inspector.unmount();
  };
}
