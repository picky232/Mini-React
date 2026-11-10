/*
 * Phase 2: 함수형 컴포넌트 + hooks.
 *
 * 핵심 질문: "컴포넌트 함수는 렌더할 때마다 처음부터 다시 실행되는데, 상태는 어떻게 유지할까?"
 * 답: 상태를 함수 안(지역 변수)이 아니라 함수 "바깥"인 상자(인스턴스)의 hooks 배열에 둔다.
 *     상자는 컴포넌트를 화면에 쓸 때마다 하나씩 생긴다. 루트의 FunctionComponent가 맨 위 상자다.
 *     함수가 다시 실행될 때 hook을 부르는 "순서"(hookIndex)로 자기 칸을 다시 찾아간다.
 *
 *   렌더 1: useState(0) → hooks[0]   useMemo(...) → hooks[1]   useEffect(...) → hooks[2]
 *   렌더 2: useState(0) → hooks[0]   ← 초기값 0은 무시하고 저장된 값을 꺼낸다
 *
 * 화면 갱신은 Phase 1 엔진을 그대로 쓴다: 새 VNode 만들기 → diff(이전, 새) → patch(바뀐 곳만).
 * 자식이 setState하면 그 자식만 다시 실행하고, 루트까지 가는 길의 VNode만 복사해 루트부터 diff한다.
 * 바뀌지 않은 부분은 이전과 같은 객체라서 diff가 첫 줄(a === b)에서 건너뛴다.
 */
import { ROOT, TEXT } from './types.js';
import { createElement } from './vdom.js';
import { diff } from './diff.js';
import { patch, kids } from './patch.js';

/** @typedef {import('./types.js').VNode} VNode */

// 지금 렌더 중인 컴포넌트의 상자. hook 함수들은 인자 없이 불리므로 "누구의 hooks 배열인지"를 이 변수로 안다
let current = null;

/* ─────────────────────────── h: VNode 만들기 ─────────────────────────── */

/**
 * JSX 대신 쓰는 VNode 생성 함수. h('li', { class: 'done' }, '장보기')
 * - type이 함수면 자식 컴포넌트: 그 컴포넌트의 상자를 찾아(없으면 만들어) 실행하고 결과(VNode)를 쓴다
 * - props의 onClick 같은 함수는 events로, key는 key로 빼고, 나머지는 Phase 1 계약대로 문자열로 바꾼다
 * @param {string | Function} type
 * @param {Record<string, any> | null} [props]
 * @param {...any} children 문자열·숫자·VNode·배열(map 결과)·null·boolean
 * @returns {VNode | null}
 */
export function h(type, props, ...children) {
  const { key, ...rest } = props ?? {};
  const k = key == null ? undefined : String(key);
  // 자식이 있을 때만 children을 넘긴다. 빈 배열도 매번 새 객체라서 넘기면 memo의 props 비교가 늘 실패한다
  if (typeof type === 'function') return renderChild(type, children.length ? { ...rest, children } : rest, k);

  const attrs = {};
  const events = {};
  for (const [name, value] of Object.entries(rest)) {
    // onClick → click. 핸들러는 DOM 속성이 아니므로 props에 넣지 않는다 (setAttribute하면 함수가 글자로 바뀜)
    if (/^on[A-Z]/.test(name) && typeof value === 'function') events[name.slice(2).toLowerCase()] = value;
    // false·null·undefined = 속성 없음, true = 값 없는 속성(checked=""), 나머지는 문자열 (Phase 1 계약: props는 문자열)
    else if (value != null && value !== false) attrs[name] = value === true ? '' : String(value);
  }
  const vnode = { type, props: attrs, children: normalizeChildren(children), events };
  if (k !== undefined) vnode.key = k;
  return vnode;
}

/**
 * 자식 배열 정리. Phase 1 정규화 규칙과 맞춰야 patch.js의 path가 어긋나지 않는다.
 * 1. 배열은 펼치고(map 결과), null·undefined·true·false는 버린다 (조건부 렌더링 {cond && h(...)})
 * 2. 문자열·숫자는 텍스트 VNode, 이웃한 텍스트는 하나로 합친다 (h('p', null, count, '개') → "3개")
 * 3. 합친 뒤에도 공백만 있는 텍스트는 버린다. patch.js의 kids()가 공백 텍스트 노드를 세지 않기 때문
 * @param {any[]} children
 * @returns {VNode[]}
 */
export function normalizeChildren(children) {
  const out = [];
  for (const c of children.flat(Infinity)) {
    if (c == null || typeof c === 'boolean') continue;
    const v = typeof c === 'object' ? c : { type: TEXT, text: String(c) };
    const last = out[out.length - 1];
    if (v.type === TEXT && last?.type === TEXT) out[out.length - 1] = { type: TEXT, text: last.text + v.text };
    else out.push(v);
  }
  return out.filter((v) => v.type !== TEXT || !/^[ \t\n\f\r]*$/.test(v.text));
}

/* ─────────────────────────── 상자(인스턴스) ─────────────────────────── */

/*
 * 상자 = 화면에 놓인 컴포넌트 하나의 기억. 함수는 실행이 끝나면 다 잊으므로 다음 실행에 필요한 것을 여기 적어 둔다.
 *   hooks          기억하는 값 (useState·useEffect·useMemo 칸들)
 *   props, output  지난번에 받은 것(memo 비교용), 지난번에 그린 것(트리에서 내 자리 찾기용)
 *   dirty          내 상태가 바뀌어 다시 실행해야 하는지
 *   children       내가 부른 자식들의 상자 (다음 렌더에서 다시 찾고, 안 부르면 지운다)
 */
function newInstance(fn, key, parent) {
  return {
    fn, key, parent, root: parent.root, depth: parent.depth + 1,
    props: undefined, output: undefined, hooks: [], hookIndex: 0, hookCount: undefined,
    dirty: false, unmounted: false, children: new Map(), used: null, calls: null, effects: [],
  };
}

// 자식 컴포넌트 실행: 부모 상자 안에서 이 자식의 상자를 찾아 그 상자로 함수를 실행한다
function renderChild(fn, props, key) {
  const parent = current;
  if (!parent) return withKey(fn(props), key); // 렌더 밖에서 부른 h(Comp): 상자 없이 한 번 실행 (hook을 쓰면 에러)

  // 1. 지난번 상자 찾기: key가 있으면 key로, 없으면 "이 부모 안에서 같은 컴포넌트를 몇 번째로 불렀나"로 짝짓는다
  const n = parent.calls.get(fn) ?? 0;
  parent.calls.set(fn, n + 1);
  const id = key !== undefined ? `k${key}` : `i${n}`;
  let byId = parent.children.get(fn);
  if (!byId) parent.children.set(fn, (byId = new Map()));
  let inst = byId.get(id);
  if (!inst) byId.set(id, (inst = newInstance(fn, key, parent)));
  parent.used.add(inst); // 이번에 불렀다 = 아직 화면에 있다. memo로 건너뛰어도 불린 것이므로 상태가 남는다

  // 2. memo: props가 같고 자기 상태도 안 바뀌었으면 함수를 부르지 않고 지난번 VNode "객체"를 그대로 돌려준다.
  //    같은 객체가 오면 diff가 첫 줄(a === b)에서 하위 트리 비교를 통째로 건너뛴다 → 호출도 비교도 0번
  if (fn.isMemo && inst.output !== undefined && !inst.dirty && shallowEqual(inst.props, props)) {
    inst.root.memoHits++;
    return inst.output;
  }
  inst.props = props;
  return renderInstance(inst);
}

// 상자 하나로 컴포넌트 함수를 실행한다. 루트도 같은 길을 쓴다
function renderInstance(inst) {
  const prev = current;
  current = inst;
  inst.hookIndex = 0; // 매 렌더 0부터: 같은 순서로 hook을 부르면 같은 칸을 다시 만난다
  inst.effects = [];
  inst.used = new Set();
  inst.calls = new Map();
  let out;
  try {
    out = inst.fn(inst.props);
  } finally {
    current = prev; // 렌더가 끝나면 부모 상자로 돌아간다. 맨 위면 null이라 렌더 밖 hook 호출은 에러
  }
  if (inst.hookCount !== undefined && inst.hookIndex !== inst.hookCount) {
    throw new Error(`hook 개수가 바뀌었습니다 (${inst.hookCount} → ${inst.hookIndex}). 조건문·반복문 안에서 hook을 부르면 순서로 칸을 찾을 수 없습니다`);
  }
  inst.hookCount = inst.hookIndex;
  // 이번에 부르지 않은 자식 상자 = 화면에서 빠진 컴포넌트. cleanup을 예약하고 버린다
  for (const byId of inst.children.values()) {
    for (const [id, child] of byId) {
      if (!inst.used.has(child)) { byId.delete(id); removeInstance(child); }
    }
  }
  inst.dirty = false;
  // 함수가 "끝난" 순서로 effect를 줄 세운다. 자식은 부모보다 먼저 끝나므로 자식 effect가 먼저 실행된다 (React와 같음)
  inst.root.pendingEffects.push(...inst.effects);
  inst.output = withKey(out, inst.key);
  return inst.output;
}

// key는 컴포넌트가 아니라 부모 목록의 일이므로 결과 VNode에 붙인다
function withKey(out, key) {
  return key !== undefined && out && typeof out === 'object' && !Array.isArray(out) ? { ...out, key } : out;
}

// 상자와 그 아래 상자를 모두 "빠짐"으로 표시하고, commit에서 cleanup을 부르도록 모은다. 이후 setState는 무시된다
function removeInstance(inst) {
  inst.unmounted = true;
  for (const byId of inst.children.values()) for (const child of byId.values()) removeInstance(child);
  inst.root.removed.push(inst);
}

function forEachInstance(inst, fn) {
  fn(inst);
  for (const byId of inst.children.values()) for (const child of byId.values()) forEachInstance(child, fn);
}

// 트리에서 target 객체까지 가는 길 [루트, …, target]. 없으면 null
// shortcut: 노드 수만큼 참조를 비교한다(O(N)). 트리가 수만 개로 커지면 상자에 자기 위치를 기록해 두도록 바꾼다
function findPath(node, target) {
  if (node === target) return [node];
  for (const child of node.children ?? []) {
    const p = findPath(child, target);
    if (p) { p.unshift(node); return p; }
  }
  return null;
}

/*
 * path 끝의 노드를 out으로 바꾼 새 트리를 만든다. 길 위의 조상만 복사하고 나머지는 같은 객체를 쓴다.
 * 이전 객체를 직접 고치면 diff가 "같은 객체"로 보고 건너뛰어 화면이 안 바뀌므로 반드시 복사한다.
 * @returns {{ root: VNode, replaced: Map<object, any> }} replaced = 이전 객체 → 새 객체 (상자 기록 갱신용)
 */
function replaceAt(path, out) {
  const replaced = new Map([[path.at(-1), out]]);
  let child = path.at(-1);
  let next = out;
  for (let i = path.length - 2; i >= 0; i--) {
    const node = path[i];
    const at = node.children.indexOf(child);
    // 바로 위 부모: out이 null·배열·글자일 수 있으니 h와 같은 규칙으로 정리한다. 그 위로는 한 칸만 바꾼다
    const children = i === path.length - 2
      ? normalizeChildren([...node.children.slice(0, at), out, ...node.children.slice(at + 1)])
      : node.children.map((c, j) => (j === at ? next : c));
    const copy = { ...node, children };
    replaced.set(node, copy);
    child = node;
    next = copy;
  }
  return { root: next, replaced };
}

/**
 * 자식 컴포넌트를 memo로 감싼다. props가 얕은 비교로 같고 자기 상태도 안 바뀌었으면 다시 실행하지 않는다.
 * 리스트 항목처럼 여러 번 쓰이면 상자마다 따로 기억한다.
 * @template {Function} F
 * @param {F} Component
 * @returns {F}
 */
export function memo(Component) {
  const Memo = (props) => Component(props);
  Memo.isMemo = true;
  return Memo;
}

// props 객체의 값들을 하나씩 Object.is로 비교 (얕은 비교). children 배열은 매번 새로 만들어지므로 자식을 넘기면 늘 다르다
function shallowEqual(a, b) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
}

/* ─────────────────────────── 루트 컴포넌트 ─────────────────────────── */

export class FunctionComponent {
  /**
   * @param {(props: any) => any} fn 루트 컴포넌트 함수
   * @param {any} [props]
   */
  constructor(fn, props = {}) {
    this.fn = fn;
    this.props = props;
    this.hooks = []; // 루트의 상태 저장소. 렌더가 끝나도 남는다 (함수 바깥에 있으므로)
    this.hookIndex = 0; // 이번 렌더에서 몇 번째 hook을 부르는 중인지
    this.hookCount = undefined; // 첫 렌더의 hook 개수. 이후 렌더와 다르면 조건문 안에서 hook을 쓴 것
    // 루트도 상자 하나다: 자식 상자들의 맨 위
    this.root = this;
    this.parent = null;
    this.depth = 0;
    this.key = undefined;
    this.output = undefined;
    this.children = new Map();
    this.used = null;
    this.calls = null;
    this.effects = [];
    this.dirty = false;
    this.unmounted = false;
    this.dirtySet = new Set(); // setState로 바뀐 상자들 (다음 flush에서 다시 실행)
    this.vnode = null; // 지금 화면에 반영된 #root VNode (다음 diff의 "이전")
    this.container = null;
    this.pendingEffects = []; // 이번 commit에서 실행할 effect들 (끝난 순서 = 자식 먼저)
    this.removed = []; // 이번에 화면에서 빠진 상자들 (commit에서 cleanup)
    this.scheduled = false; // 리렌더가 이미 예약됐는지 (batching)
    this.setStateCalls = 0; // 이번 렌더로 묶인 setState 횟수
    this.memoHits = 0; // 이번 렌더에서 memo로 건너뛴 자식 수
    this.renderCount = 0;
    /** 렌더가 화면에 반영될 때마다 불린다. Phase 2 확인 페이지의 Hooks 인스펙터가 쓴다 @type {((info: CommitInfo) => void) | null} */
    this.onCommit = null;
  }

  /** 루트부터 컴포넌트 함수를 실행해 #root VNode를 만든다. DOM은 건드리지 않는다. */
  render() {
    const out = renderInstance(this);
    return { type: ROOT, props: {}, children: normalizeChildren([out]) };
  }

  /** 처음 그리기: 전체를 createElement로 만든다 (비교할 이전 VNode가 없으므로). */
  mount(container) {
    this.container = container;
    this.begin();
    this.vnode = this.render();
    container.replaceChildren(createElement(this.vnode));
    this.stopEvents = delegateEvents(container, () => this.vnode);
    this.renderCount++;
    this.commit([]);
  }

  /** 루트부터 다시 그리기: 새 VNode → diff → patch. 바뀐 곳만 고친다 (Phase 1 엔진 재사용). */
  update() {
    this.flush(true);
  }

  /**
   * 예약된 리렌더 처리. 루트가 바뀌었거나 full이면 루트부터, 아니면 바뀐 자식 상자만 다시 실행한다.
   * 얕은 상자부터 처리한다: 부모를 다시 실행하면서 함께 실행된 자식은 dirty가 풀려서 두 번 실행하지 않는다.
   */
  flush(full = false) {
    if (!this.container) return; // unmount된 뒤에 온 setState는 무시
    const dirty = [...this.dirtySet].sort((a, b) => a.depth - b.depth);
    this.dirtySet.clear();
    this.begin();
    let next = full || this.dirty ? this.render() : this.vnode;
    for (const inst of dirty) if (inst.dirty && !inst.unmounted) next = this.refresh(inst, next);
    if (next === this.vnode) { this.setStateCalls = 0; return; } // 바뀐 상자가 모두 이미 빠졌다
    const patches = diff(this.vnode, next);
    patch(this.container, patches);
    this.vnode = next;
    this.renderCount++;
    this.commit(patches);
  }

  // 상자 하나만 다시 실행하고, 그 결과를 끼운 새 #root 트리를 돌려준다
  refresh(inst, rootV) {
    if (inst === this) return this.render();
    const old = inst.output;
    const path = old && typeof old === 'object' && !Array.isArray(old) ? findPath(rootV, old) : null;
    // 지난 출력이 null·배열·글자면 트리에서 내 자리를 가리킬 노드가 없다 → 부모를 다시 실행해 부모 목록 안에서 처리
    if (!path) return this.refresh(inst.parent, rootV);
    const { root, replaced } = replaceAt(path, renderInstance(inst));
    // 복사된 조상을 지난 출력으로 기억하던 상자도 새 객체를 가리키게 한다 (다음에 자기 자리를 찾을 수 있도록)
    forEachInstance(this, (i) => { if (replaced.has(i.output)) i.output = replaced.get(i.output); });
    return root;
  }

  begin() {
    this.pendingEffects = [];
    this.removed = [];
    this.memoHits = 0;
  }

  // 화면 반영 직후: 빠진 상자 cleanup → 알림 → effect 실행
  commit(patches) {
    for (const inst of this.removed) cleanupHooks(inst);
    const batched = this.setStateCalls;
    this.setStateCalls = 0;
    this.onCommit?.({ patches, batched, memoHits: this.memoHits, render: this.renderCount, hooks: this.hooks });
    runEffects(this.pendingEffects.filter((e) => !e.inst.unmounted));
  }

  /**
   * setState가 부르는 리렌더 예약. 바로 렌더하지 않고 지금 실행 중인 코드(이벤트 핸들러)가 끝난 직후로 미룬다.
   * 핸들러 안에서 setState를 여러 번 불러도 첫 번째만 예약하고 나머지는 이미 예약됐으니 넘어간다 → 렌더 1번 (batching)
   * @param {object} [inst] 상태가 바뀐 상자. 생략하면 루트
   */
  scheduleUpdate(inst = this) {
    this.setStateCalls++;
    inst.dirty = true;
    this.dirtySet.add(inst);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false; // flush 전에 풀어야 effect 안의 setState가 다음 렌더를 다시 예약할 수 있다
      this.flush();
    });
  }

  /** 화면에서 내리기: 모든 상자의 effect cleanup 실행, 이벤트 리스너 제거, DOM 비우기. */
  unmount() {
    if (!this.container) return;
    forEachInstance(this, (inst) => { inst.unmounted = true; cleanupHooks(inst); });
    this.stopEvents();
    this.container.replaceChildren();
    this.container = null;
  }
}

function cleanupHooks(inst) {
  for (const hook of inst.hooks) if (hook.kind === 'effect' && hook.cleanup) hook.cleanup();
}

/**
 * @typedef {{ patches: import('./types.js').Patch[], batched: number, memoHits: number, render: number, hooks: any[] }} CommitInfo
 */

/* ─────────────────────────── hooks ─────────────────────────── */

// 모든 hook의 공통 입구: 규칙을 검사하고, 순서 번호로 지금 상자의 자기 칸을 찾는다
function nextHook(kind) {
  if (!current) throw new Error(`${kind} hook은 컴포넌트를 렌더하는 중에만 부를 수 있습니다`);
  const c = current;
  const i = c.hookIndex++;
  const hook = c.hooks[i];
  if (hook && hook.kind !== kind) throw new Error(`hook 순서가 바뀌었습니다: ${i}번 칸은 ${hook.kind}인데 ${kind}를 불렀습니다`);
  return { c, i, hook };
}

/**
 * 상태 하나. [현재 값, 바꾸는 함수]
 * @template T
 * @param {T | (() => T)} initial 첫 렌더에만 쓴다. 함수면 첫 렌더에 한 번만 호출 (localStorage 읽기 같은 비싼 초기화)
 * @returns {[T, (next: T | ((prev: T) => T)) => void]}
 */
export function useState(initial) {
  const { c, i, hook } = nextHook('state');
  if (hook) return [hook.value, hook.setState]; // 두 번째 렌더부터: 저장된 값을 꺼낸다

  const slot = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
  // setState는 slot과 상자를 클로저로 기억한다. 함수가 끝나도 slot은 상자의 hooks 배열에 남아 있어서 나중에 불러도 같은 칸을 고친다
  slot.setState = (next) => {
    if (c.unmounted) return; // 화면에서 빠진 컴포넌트의 setState(남은 타이머 등)는 무시
    const value = typeof next === 'function' ? next(slot.value) : next; // 함수형 업데이트: 최신 값을 받아 계산
    if (Object.is(value, slot.value)) return; // 같은 값이면 리렌더하지 않는다
    slot.value = value; // 1) 값 저장
    c.root.scheduleUpdate(c); // 2) 이 상자만 다시 실행하도록 예약 ← setState가 상태 변경 말고 하는 일
  };
  c.hooks[i] = slot;
  return [slot.value, slot.setState];
}

/**
 * 렌더 결과가 화면에 반영된 "뒤에" 할 일 (localStorage 저장, document.title, 타이머 등).
 * deps가 지난번과 같으면 건너뛴다. 다시 실행하기 전에 지난번이 돌려준 cleanup을 먼저 부른다.
 * @param {() => void | (() => void)} effect
 * @param {any[]} [deps] 생략하면 매 렌더 실행, []면 처음 한 번만
 */
export function useEffect(effect, deps) {
  const { c, i, hook } = nextHook('effect');
  const slot = hook ?? (c.hooks[i] = { kind: 'effect', deps: undefined, cleanup: undefined });
  if (!depsChanged(slot.deps, deps)) return;
  slot.deps = deps;
  // 지금 실행하면 아직 patch 전이라 화면이 이전 상태다. 상자에 적어 두고 commit에서 실행한다
  c.effects.push({ slot, effect, inst: c });
}

// 실제 React처럼 cleanup을 전부 먼저, 그다음 effect를 실행한다
function runEffects(list) {
  for (const { slot } of list) slot.cleanup?.();
  for (const { slot, effect } of list) {
    const cleanup = effect();
    slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  }
}

/**
 * 비싼 계산 결과를 기억한다. deps가 같으면 계산하지 않고 지난번 값을 돌려준다.
 * 같은 "객체"를 돌려주므로 memo 자식에게 넘기는 props(핸들러 묶음 등)를 렌더마다 같게 유지하는 데도 쓴다.
 * @template T
 * @param {() => T} compute
 * @param {any[]} deps
 * @returns {T}
 */
export function useMemo(compute, deps) {
  const { c, i, hook } = nextHook('memo');
  if (hook && !depsChanged(hook.deps, deps)) return hook.value;
  const slot = { kind: 'memo', deps, value: compute() };
  c.hooks[i] = slot;
  return slot.value;
}

// deps가 없으면 매번 바뀐 것으로 본다. 길이가 다르거나 하나라도 Object.is로 다르면 바뀐 것
function depsChanged(prev, next) {
  if (!prev || !next) return true;
  return prev.length !== next.length || next.some((d, i) => !Object.is(d, prev[i]));
}

/* ─────────────────────────── 이벤트 위임 ─────────────────────────── */

const EVENT_TYPES = ['click', 'input', 'change', 'submit', 'keydown'];

/**
 * 노드마다 리스너를 다는 대신 컨테이너 하나에 이벤트 종류별로 한 번만 단다 (React도 루트에 단다).
 * 이벤트가 오면 클릭된 DOM 노드의 위치(path)로 "지금" VNode를 찾아 그 핸들러를 부른다.
 * ∴ 렌더마다 새로 만들어진 핸들러(새 클로저)를 DOM에 다시 달 필요가 없고, 오래된 클로저가 불릴 일도 없다.
 * shortcut: focus·blur처럼 버블링하지 않는 이벤트는 받지 못한다. 필요하면 focusin·focusout을 EVENT_TYPES에 넣는다
 * @returns {() => void} 리스너를 떼는 함수
 */
function delegateEvents(container, getRoot) {
  const listener = (e) => {
    // 1. 이벤트가 난 노드에서 컨테이너까지 올라가며 DOM 경로를 모은다
    const chain = [];
    let node = e.target;
    while (node && node !== container) {
      chain.unshift(node);
      node = node.parentNode;
    }
    if (node !== container) return; // 컨테이너 밖
    // 2. 같은 경로를 VNode 트리에서 따라 내려간다. 인덱스는 patch.js와 같은 규칙(kids)으로 센다
    const vnodes = [];
    let v = getRoot();
    for (const n of chain) {
      v = v?.children?.[kids(n.parentNode).indexOf(n)];
      if (!v) break;
      vnodes.push(v);
    }
    // 3. 안쪽 노드부터 바깥으로 핸들러를 부른다 (버블링). stopPropagation()을 부르면 멈춘다
    for (const vn of vnodes.reverse()) {
      vn.events?.[e.type]?.(e);
      if (e.cancelBubble) break;
    }
  };
  for (const type of EVENT_TYPES) container.addEventListener(type, listener);
  return () => { for (const type of EVENT_TYPES) container.removeEventListener(type, listener); };
}
