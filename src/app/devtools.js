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
const MAX_FLASHES = 20;
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
    return el('li', 'dt-patch', [el('em', `tag tag-${type}`, [type]), el('code', '', [target]), ` ${detail}`]);
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

/**
 * patch가 건드린 메뉴 줄 위에 잠깐 빛나는 상자를 띄운다. 숫자·이름 같은 작은 조각 대신 줄 블록 전체를 강조한다.
 * 상자는 앱 밖 레이어에 두어 앱 DOM과 다음 측정을 건드리지 않는다.
 * @param {readonly MutationRecord[]} records
 * @param {HTMLElement} layer
 */
function flash(records, layer) {
  /** @type {Set<Element>} */
  const targets = new Set();
  const rowOf = (/** @type {Node} */ node) => (node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement)?.closest('.menu-row');
  for (const record of records) {
    // 삭제는 줄이 이미 사라졌으므로 강조할 곳이 없다. 추가·이동은 들어온 줄, 텍스트·속성 변경은 그 줄을 강조한다.
    const nodes = record.type === 'childList' ? [...record.addedNodes] : [record.target];
    for (const node of nodes) {
      const row = rowOf(node);
      if (row) targets.add(row);
    }
  }
  const base = layer.getBoundingClientRect();
  for (const target of [...targets].slice(0, MAX_FLASHES)) {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const box = layer.ownerDocument.createElement('div');
    box.className = 'flash';
    box.style.cssText = `left:${rect.left - base.left}px;top:${rect.top - base.top}px;width:${rect.width}px;height:${rect.height}px`;
    box.addEventListener('animationend', () => box.remove());
    layer.append(box);
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

  const layer = document.createElement('div');
  layer.className = 'flash-layer';
  layer.setAttribute('aria-hidden', 'true');
  appContainer.after(layer);

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
    // 첫 렌더는 전부 새로 만든 것이라 화면 전체가 빛나 의미가 없다.
    if (info.renders > 1) flash(records, layer);
  };

  return {
    /** 버튼 핸들러가 setState를 부르기 직전에 알린다. 이후 몇 번 렌더됐는지 센다. */
    action(/** @type {string} */ label, /** @type {number} */ setStates) {
      pending = { label, setStates, from: renders };
    },
    detach() {
      target.onCommit = null;
      observer.disconnect();
      layer.remove();
      panel.unmount();
    },
  };
}
