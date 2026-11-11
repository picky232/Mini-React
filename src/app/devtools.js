import { FunctionComponent, child } from '../component/function-component.js';
import { h } from '../core/vnode.js';
import { HOOK_NAME } from './inspector.js';
import { countNodes, describePatch } from './patch-report.js';

/** @typedef {import('../core/contracts.js').PatchList} PatchList */
/**
 * @typedef {object} PanelInfo
 * @property {number} render
 * @property {number} engineMs diff + patch
 * @property {number} changed MutationObserver가 본 바뀐 노드 수
 * @property {number} total 앱 안의 전체 노드 수. innerHTML로 통째로 바꿨다면 이만큼 다시 만든다
 * @property {PatchList} patches
 * @property {number} memoHits
 * @property {readonly Record<string, unknown>[]} hooks
 * @property {{ label: string, setStates: number, renders: number } | null} action
 */

const P = { attrs: {}, events: {} };
const MAX_PATCH_LINES = 12;
// 브라우저는 보안 때문에 performance.now()를 0.1ms 단위로 자른다. 그보다 짧으면 0으로 찍힌다.
const ms = (/** @type {number} */ value) => (value < 0.1 ? '< 0.1ms' : `${value.toFixed(1)}ms`);
const el = (/** @type {string} */ tag, /** @type {string} */ className, /** @type {any[]} */ children) => h(tag, { attrs: { class: className }, events: {} }, children);

const isRecord = (/** @type {unknown} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * 값을 한 줄 글자로 바꾼다. 함수는 ƒ로 쓰고, 순환 참조에 갇히지 않게 깊이를 제한한다.
 * @param {unknown} value
 * @returns {string}
 */
function inline(value, depth = 0) {
  if (depth > 4) return '…';
  if (Array.isArray(value)) return `[${value.map((item) => inline(item, depth + 1)).join(', ')}]`;
  if (isRecord(value)) {
    const entries = Object.entries(/** @type {object} */ (value)).map(([key, item]) => `${key}: ${inline(item, depth + 1)}`);
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }
  if (typeof value === 'function') return 'ƒ';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/**
 * Hook 값을 줄 목록으로 바꾼다. 자르지 않고, 배열은 항목마다·객체는 속성마다 한 줄씩 쓴다.
 * 배열 안의 배열(useMemo deps의 목록 등)은 들여써서 그 항목들을 다시 한 줄씩 쓴다.
 * @param {unknown} value
 * @returns {string[]}
 */
export function toLines(value, indent = '') {
  if (indent.length > 8) return [`${indent}${inline(value, 5)}`]; // 너무 깊거나 자기 자신을 담은 배열에서 멈춘다
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[]`];
    return value.flatMap((item) => (Array.isArray(item) ? toLines(item, `${indent}  `) : [`${indent}${inline(item)}`]));
  }
  const entries = isRecord(value) ? Object.entries(/** @type {object} */ (value)) : [];
  if (entries.length > 0) return entries.map(([key, item]) => `${indent}${key}: ${inline(item)}`);
  return [`${indent}${inline(value)}`];
}

/** @param {{ hook: Record<string, unknown>, index: number }} props */
function HookItem({ hook, index }) {
  const kind = String(hook.kind);
  const value = kind === 'effect' ? [hook.cleanup ? 'cleanup 있음' : '—'] : toLines(hook.value);
  const lines = (/** @type {string[]} */ rows) => el('div', 'dt-lines', rows.map((row) => h('div', P, [row])));
  return el('li', 'dt-hook', [
    el('div', 'dt-hook-head', [el('span', 'dt-hook-index', [`#${index}`]), el('em', 'tag', [HOOK_NAME[kind] ?? kind])]),
    lines(value),
    kind === 'state' ? null : el('div', 'dt-deps', [el('small', '', ['deps']), lines(toLines(hook.dependencies))]),
  ]);
}

/** @param {{ label: string, value: string, good?: boolean }} props */
function Metric({ label, value, good }) {
  return el('div', 'dt-metric', [h('small', P, [label]), el('b', good ? 'good' : '', [value])]);
}

/** @param {{ info: PanelInfo | null }} props */
function Panel({ info }) {
  if (info === null) return el('p', 'dt-empty', ['아직 렌더하지 않았어요.']);
  const { action, patches } = info;
  const lines = patches.slice(0, MAX_PATCH_LINES).map((patch) => {
    const { type, target, detail } = describePatch(patch);
    return el('li', `dt-patch patch-${type}`, [el('em', 'tag', [type]), el('code', '', [target]), ` ${detail}`]);
  });
  if (patches.length > MAX_PATCH_LINES) lines.push(el('li', 'dt-more', [`외 ${patches.length - MAX_PATCH_LINES}건`]));
  if (patches.length === 0) lines.push(el('li', 'dt-more', ['바뀐 부분이 없어 DOM을 건드리지 않았어요.']));

  return el('div', 'dt-body', [
    el('section', 'dt-sec', [
      el('h3', '', [`RENDER #${info.render}`]),
      el('div', 'dt-metrics', [
        child(Metric, { label: 'diff → patch로 바꾼 노드', value: String(info.changed), good: true }),
        child(Metric, { label: 'innerHTML이었다면 다시 만들 노드', value: String(info.total) }),
      ]),
      // 노드가 수십 개면 시간 차이는 0.1ms 단위 시계로 잡히지 않는다. 그래서 노드 수를 앞에 두고 시간은 참고로만 보여 준다.
      el('p', 'dt-time', [`diff + patch ${ms(info.engineMs)}`]),
    ]),
    el('section', 'dt-sec', [
      el('h3', '', ['이번 동작']),
      el('p', 'dt-action', [action === null
        ? '첫 렌더: 비교할 이전 VNode가 없어 전부 새로 만들었어요.'
        : `${action.label} · setState ${action.setStates}번 → 렌더 ${action.renders}번`]),
      el('p', 'dt-action dim', [`memo로 건너뛴 줄 ${info.memoHits}개`]),
    ]),
    el('section', 'dt-sec', [el('h3', '', [`PATCHES · ${patches.length}건`]), el('ol', 'dt-patches', lines)]),
    el('section', 'dt-sec', [
      el('h3', '', ['HOOKS · VoteApp']),
      el('ol', 'dt-hooks', info.hooks.map((hook, index) => child(HookItem, { hook, index }))),
    ]),
  ]);
}

/**
 * 바뀐 노드 수. 속성·텍스트 변경은 1개, 추가·삭제는 하위 노드까지 센다.
 * MOVE는 같은 노드가 빠졌다 다시 들어가 기록이 둘 생기지만, 새로 만든 게 아니므로 1개로 센다.
 * @param {readonly MutationRecord[]} records
 */
export function changedNodes(records) {
  const added = new Set(records.flatMap((record) => [...record.addedNodes]));
  const removed = new Set(records.flatMap((record) => [...record.removedNodes]));
  let count = 0;
  for (const record of records) {
    if (record.type !== 'childList') {
      count += 1;
      continue;
    }
    for (const node of record.addedNodes) count += removed.has(node) ? 1 : countNodes(node);
    for (const node of record.removedNodes) if (!added.has(node)) count += countNodes(node);
  }
  return count;
}

const SLIDE = { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
const GLOW = { duration: 1100, easing: 'ease-out' };

/**
 * 줄마다 목록 안에서의 위치와 순서를 기억한다. offsetTop은 페이지 스크롤과 진행 중인 transform에 영향받지 않고,
 * 목록의 offsetTop을 빼서 글꼴 로딩이나 알림 문구처럼 목록 바깥에서 생긴 밀림은 무시한다.
 * @param {Element} root
 * @returns {Map<Element, { top: number, index: number }>}
 */
const rowTops = (root) => new Map(Array.from(root.querySelectorAll('.menu-row'), (row, index) => {
  const item = /** @type {HTMLElement} */ (row);
  return [row, { top: item.offsetTop - (/** @type {HTMLElement | null} */ (item.parentElement)?.offsetTop ?? 0), index }];
}));

/**
 * patch 뒤의 줄을 움직여 보여 준다. 둘 다 Web Animations API(element.animate)로 해서 style 속성을 바꾸지 않는다.
 * 그래서 MutationObserver에 기록이 남지 않고, 다음 커밋의 '바뀐 노드' 수에 섞이지 않는다.
 * 1. 미끄러지기(FLIP): 지난 커밋 때 위치(First)와 지금 위치(Last)의 차이만큼 되돌려 놓고(Invert) 제자리로 움직인다(Play).
 *    MOVE로 옮긴 줄, 삭제로 당겨진 줄이 순간이동하지 않고 미끄러진다.
 * 2. 강조: patch가 건드린 줄 블록 전체를 잠깐 대표 색으로 빛낸다.
 * @param {readonly MutationRecord[]} records
 * @param {Element} root
 * @param {Map<Element, { top: number, index: number }>} previousTops
 */
function animateRows(records, root, previousTops) {
  const rowOf = (/** @type {Node} */ node) => (node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement)?.closest('.menu-row');
  /** @type {Set<Element>} */
  const touched = new Set();
  for (const record of records) {
    // 삭제는 줄이 이미 사라졌으므로 강조할 곳이 없다. 추가·이동은 들어온 줄, 텍스트·속성 변경은 그 줄을 강조한다.
    const nodes = record.type === 'childList' ? [...record.addedNodes] : [record.target];
    for (const node of nodes) {
      const row = rowOf(node);
      if (row) touched.add(row);
    }
  }
  const view = root.ownerDocument.defaultView;
  const reduceMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // 빛나는 색은 CSS의 대표 색 변수에서 읽어 디자인과 어긋나지 않게 한다.
  const token = (/** @type {string} */ name) => (view ? view.getComputedStyle(root).getPropertyValue(name).trim() : '');
  const glow = [
    { backgroundColor: token('--brand-soft'), boxShadow: `0 0 0 2px ${token('--brand')}` },
    { backgroundColor: token('--card'), boxShadow: `0 0 0 2px transparent` },
  ];
  for (const [row, { top, index }] of rowTops(root)) {
    // shortcut: animate가 없는 환경(jsdom 등)에서는 움직이지 않는다.
    if (typeof row.animate !== 'function') return;
    const before = previousTops.get(row);
    // 순서가 바뀐 줄만 미끄러진다(MOVE로 옮겨졌거나, 위 줄이 삭제돼 당겨진 줄).
    if (!reduceMotion && before !== undefined && before.index !== index && before.top !== top) {
      // 위로 올라가는 줄이 내려가는 줄 위에 보이도록 겹침 순서를 올린다.
      const z = before.top > top ? '1' : '0';
      row.animate([{ transform: `translateY(${before.top - top}px)`, zIndex: z }, { transform: 'translateY(0)', zIndex: z }], SLIDE);
    }
    if (touched.has(row)) {
      row.animate(glow, reduceMotion ? { ...GLOW, duration: 200 } : GLOW);
    }
  }
}

/**
 * 커밋마다 시간·바뀐 노드·Patch·Hooks를 모아 패널을 다시 그린다. 패널도 미니 리액트 컴포넌트다.
 * @param {FunctionComponent<any>} target
 * @param {HTMLElement} appContainer
 * @param {HTMLElement} panelContainer
 */
export function attachDevtools(target, appContainer, panelContainer) {
  const document = appContainer.ownerDocument;
  /** @type {PanelInfo | null} */
  let latest = null;
  /** @type {{ label: string, setStates: number, from: number } | null} */
  let pending = null;
  let renders = 0;

  /** @type {Map<Element, { top: number, index: number }>} */
  let tops = new Map();
  // 창 크기가 바뀌면 줄 위치도 바뀐다. 다음 커밋에서 그 차이를 이동으로 착각하지 않게 다시 잰다.
  const remeasure = () => { tops = rowTops(appContainer); };
  document.defaultView?.addEventListener('resize', remeasure);

  const observer = new MutationObserver(() => {});
  observer.observe(appContainer, { childList: true, attributes: true, characterData: true, subtree: true });

  const panel = new FunctionComponent(() => Panel({ info: latest }), {});
  panel.mount(panelContainer);

  target.onCommit = (info) => {
    const records = observer.takeRecords();
    renders = info.renders;
    latest = {
      render: info.renders,
      engineMs: info.timings.diff + info.timings.patch,
      changed: changedNodes(records),
      total: countNodes(appContainer) - 1,
      patches: info.patches,
      memoHits: info.memoHits,
      // hooks 배열은 계속 바뀌므로 지금 모습을 복사해 둔다.
      hooks: info.hooks.map((hook) => ({ ...hook })),
      action: pending && { label: pending.label, setStates: pending.setStates, renders: info.renders - pending.from },
    };
    panel.update();
    // 첫 렌더는 전부 새로 만든 것이라 움직이거나 빛낼 대상이 없다.
    if (info.renders > 1) animateRows(records, appContainer, tops);
    remeasure();
  };

  return {
    /** 버튼 핸들러가 setState를 부르기 직전에 알린다. 이후 몇 번 렌더됐는지 센다. */
    action(/** @type {string} */ label, /** @type {number} */ setStates) {
      pending = { label, setStates, from: renders };
    },
    detach() {
      target.onCommit = null;
      observer.disconnect();
      document.defaultView?.removeEventListener('resize', remeasure);
      panel.unmount();
    },
  };
}
