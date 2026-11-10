import { diff } from '../core/diff.js';
import { applyPatches } from '../dom/patch.js';
import { replaceDOMTree } from '../dom/render.js';

/** @typedef {import('../core/contracts.js').VNode} VNode */
/** @template T @typedef {(previous: T) => T} StateUpdater */
/** @template T @typedef {(action: T | StateUpdater<T>) => void} StateSetter */
/** @template T @typedef {{ kind: 'state', value: T, setState: StateSetter<T> }} StateSlot */
/** @typedef {() => void} Cleanup */
/** @typedef {() => void | Cleanup} Effect */
/** @typedef {{ kind: 'effect', dependencies: readonly unknown[] | undefined, cleanup: Cleanup | undefined }} EffectSlot */
/** @typedef {{ kind: 'memo', dependencies: readonly unknown[], value: unknown }} MemoSlot */
/** @typedef {{ kind: 'state' } | EffectSlot | MemoSlot} HookSlot */
/** @typedef {() => (() => void)} StateChange */
/**
 * @typedef {object} RenderContext
 * @property {HookSlot[]} hooks
 * @property {number} nextIndex
 * @property {(changeState: StateChange) => void} update
 * @property {(() => void)[]} pendingEffects
 * @property {[number, MemoSlot][]} pendingMemos
 */

const MAX_EFFECT_UPDATE_PASSES = 50;

// 루트 함수를 실행하는 동안만 슬롯을 찾을 문맥을 제공한다. 상태값은 각 인스턴스에 있다.
/** @type {RenderContext | null} */
let activeRender = null;

/** @param {string} hook */
function requireRender(hook) {
  if (activeRender === null) {
    throw new Error(`${hook} requires a rendering root component.`);
  }
  return activeRender;
}

/**
 * 슬롯을 만들 때 setter도 함께 만들어 이후 렌더링에서 같은 함수를 반환한다.
 * @template T
 * @param {T} initialValue
 * @param {RenderContext} context
 * @param {number} index
 * @returns {StateSlot<T>}
 */
function createStateSlot(initialValue, { hooks, update }, index) {
  /** @type {StateSlot<T>} */
  const slot = {
    kind: 'state',
    value: initialValue,
    setState(action) {
      if (activeRender !== null) {
        throw new Error('Cannot set state during render.');
      }
      if (hooks[index] !== slot) {
        throw new Error('Cannot set state on a discarded hook.');
      }

      update(() => {
        // 슬롯의 최신 값으로 갱신하고, DOM 반영 실패 시 이전 값을 복원할 함수를 반환한다.
        const previous = slot.value;
        slot.value = typeof action === 'function'
          ? (/** @type {StateUpdater<T>} */ (action))(previous)
          : action;
        return () => { slot.value = previous; };
      });
    },
  };
  return slot;
}

/**
 * 호출 순서에 해당하는 슬롯에서 상태값과 setter를 읽는다.
 * @template T
 * @param {T} initialValue
 * @returns {[T, StateSetter<T>]}
 */
export function useState(initialValue) {
  const context = requireRender('useState');
  const index = context.nextIndex++;
  const hook = context.hooks[index];
  if (hook !== undefined && hook.kind !== 'state') {
    throw new Error('Hook order changed between renders.');
  }

  // 렌더마다 같은 순서로 호출하는 규칙에 따라 같은 위치에서 같은 타입의 슬롯을 읽는다.
  const slot = /** @type {StateSlot<T> | undefined} */ (hook) ?? createStateSlot(initialValue, context, index);
  context.hooks[index] = slot;
  return [slot.value, slot.setState];
}

/**
 * 의존성을 생략하면 매번 실행한다. 배열은 길이와 각 값이 모두 같은지 비교한다.
 * @param {readonly unknown[] | undefined} previous
 * @param {readonly unknown[] | undefined} next
 */
function sameDependencies(previous, next) {
  return previous !== undefined && next !== undefined && previous.length === next.length
    && previous.every((value, index) => Object.is(value, next[index]));
}

/**
 * 루트 렌더 중에는 실행할 Effect만 예약한다. 실제 호출은 DOM 반영이 끝난 뒤에 한다.
 * @param {Effect} effect
 * @param {readonly unknown[]} [dependencies]
 */
export function useEffect(effect, dependencies) {
  const context = requireRender('useEffect');
  const index = context.nextIndex++;
  const hook = context.hooks[index];
  if (hook !== undefined && hook.kind !== 'effect') {
    throw new Error('Hook order changed between renders.');
  }

  /** @type {EffectSlot} */
  const slot = hook ?? { kind: 'effect', dependencies: undefined, cleanup: undefined };
  context.hooks[index] = slot;
  if (sameDependencies(slot.dependencies, dependencies)) return;

  const nextDependencies = dependencies === undefined ? undefined : [...dependencies];
  context.pendingEffects.push(() => {
    // cleanup을 먼저 비워 두면 정리 중 오류가 나도 같은 함수를 다시 호출하지 않는다.
    const cleanup = slot.cleanup;
    slot.cleanup = undefined;
    slot.dependencies = undefined;
    cleanup?.();

    const result = effect();
    slot.cleanup = typeof result === 'function' ? result : undefined;
    slot.dependencies = nextDependencies;
  });
}

/**
 * 의존성이 그대로면 이전에 반영한 계산 결과의 참조를 재사용한다.
 * @template T
 * @param {() => T} calculate
 * @param {readonly unknown[]} dependencies
 * @returns {T}
 */
export function useMemo(calculate, dependencies) {
  const context = requireRender('useMemo');
  if (!Array.isArray(dependencies)) {
    throw new TypeError('useMemo dependencies must be an array.');
  }

  const index = context.nextIndex++;
  const hook = context.hooks[index];
  if (hook !== undefined) {
    if (hook.kind !== 'memo') throw new Error('Hook order changed between renders.');
    if (sameDependencies(hook.dependencies, dependencies)) {
      return /** @type {T} */ (hook.value);
    }
  }

  // 렌더 중 계산한 값은 바로 반환하고, 캐시 교체는 DOM 반영 성공까지 미룬다.
  const nextDependencies = [...dependencies];
  const value = calculate();
  context.pendingMemos.push([index, { kind: 'memo', dependencies: nextDependencies, value }]);
  return value;
}

/**
 * 한 콜백이 실패해도 같은 커밋이나 해제에 속한 나머지 콜백을 실행한 뒤 오류를 전달한다.
 * @param {readonly (() => void)[]} callbacks
 */
function runEffectCallbacks(callbacks) {
  const errors = [];
  for (const callback of callbacks) {
    try {
      callback();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Multiple effect callbacks failed.');
}

/**
 * 한 슬롯을 여러 번 변경해도 역순으로 복원하면 배치 시작 전 값으로 돌아간다.
 * @param {readonly StateChange[]} changes
 */
function applyStateChanges(changes) {
  /** @type {(() => void)[]} */
  const rollbacks = [];
  const rollback = () => {
    for (const restore of rollbacks.reverse()) restore();
  };

  try {
    for (const change of changes) rollbacks.push(change());
  } catch (error) {
    rollback();
    throw error;
  }
  return rollback;
}

/**
 * 루트 렌더 함수를 감싸고 렌더링 사이에 유지할 데이터를 보관한다.
 * @template Props
 */
export class FunctionComponent {
  /**
   * 인스턴스마다 슬롯 배열을 따로 두어 렌더 함수가 다시 실행돼도 Hook 값을 유지할 수 있다.
   * @type {HookSlot[]}
   */
  hooks = [];

  #render;
  #props;

  /** @type {Element | null} */
  #container = null;

  #isCommitting = false;

  /** @type {StateChange[] | null} */
  #queuedEffectUpdates = null;

  /** @type {StateChange[] | null} */
  #batchedUpdates = null;

  /**
   * 마지막으로 DOM에 반영한 VNode다. 최초 마운트 전에는 null이며 이후 Diff의 비교 기준이 된다.
   * @type {VNode | null}
   */
  #previousVNode = null;

  /**
   * @param {(props: Props) => VNode} render
   * @param {Props} props
   */
  constructor(render, props) {
    this.#render = render;
    this.#props = props;
  }

  get previousVNode() {
    return this.#previousVNode;
  }

  /**
   * 루트 함수가 props로 만든 트리를 빈 컨테이너에 처음 렌더링한다.
   * @param {Element} container
   */
  mount(container) {
    // 이미 이전 VNode가 저장되어 있다면 처음 렌더링을 수행한 것으로 판단하고 오류를 발생
    if (this.#previousVNode !== null) {
      throw new Error('Component is already mounted.');
    }

    this.#renderAndCommit(container);
  }

  /** 마운트한 컨테이너에 루트 함수의 새 VNode를 반영한다. */
  update() {
    this.#update();
  }

  /**
   * 동기 콜백이 호출한 setter를 모아 하나의 갱신으로 반영한다.
   * @template T
   * @param {() => T} callback
   * @returns {T}
   */
  batch(callback) {
    if (this.#container === null) {
      throw new Error('Component must be mounted before batching.');
    }
    if (this.#isCommitting && this.#queuedEffectUpdates === null) {
      throw new Error('Component is already processing a lifecycle operation.');
    }
    if (this.#batchedUpdates !== null) return callback();

    /** @type {StateChange[]} */
    const changes = [];
    this.#batchedUpdates = changes;
    let result;
    try {
      result = callback();
    } finally {
      // Promise를 반환하더라도 여기서 수집을 끝낸다. 이후 setter는 새 구간에서 실행된다.
      this.#batchedUpdates = null;
    }

    if (changes.length > 0) {
      // Effect 중이라면 합친 갱신 하나를 기존 Effect 큐가 처리한다.
      try {
        this.#update(() => applyStateChanges(changes));
      } catch (error) {
        // 갱신 오류로 반환할 수 없게 된 콜백 Promise의 거부를 처리한다.
        void Promise.resolve(result).catch(() => {});
        throw error;
      }
    }
    return result;
  }

  /** DOM 루트를 제거하고 등록된 cleanup을 호출한다. 이후 새로 마운트할 수 있다. */
  unmount() {
    if (this.#isCommitting || this.#batchedUpdates !== null) {
      throw new Error('Component is already processing a lifecycle operation.');
    }
    const container = this.#container;
    if (container === null) return;

    this.#isCommitting = true;
    try {
      applyPatches(container, diff(this.#previousVNode, null));
      const cleanups = [];
      for (const slot of this.hooks) {
        if (slot.kind === 'effect' && slot.cleanup) cleanups.push(slot.cleanup);
      }

      // 먼저 마운트 정보를 비워 cleanup이 실패해도 해제된 상태와 한 번만 정리하는 규칙을 유지한다.
      this.#container = null;
      this.#previousVNode = null;
      this.hooks.length = 0;
      runEffectCallbacks(cleanups);
    } finally {
      this.#isCommitting = false;
    }
  }

  /** @param {StateChange} [changeState] */
  #update(changeState) {
    if (this.#container === null) {
      throw new Error('Component must be mounted before updating.');
    }

    if (this.#batchedUpdates !== null) {
      if (changeState === undefined) throw new Error('Cannot update while collecting a batch.');
      // 슬롯 값은 갱신 시점까지 유지해 updater가 바로 앞 요청의 결과를 읽도록 한다.
      this.#batchedUpdates.push(changeState);
      return;
    }

    if (changeState !== undefined && this.#queuedEffectUpdates !== null) {
      // Effect가 예약한 함수형 updater는 큐에서 꺼낼 때 최신 상태로 계산한다.
      this.#queuedEffectUpdates.push(changeState);
      return;
    }

    this.#renderAndCommit(this.#container, changeState);
  }

  #renderVNode() {
    const previousRender = activeRender;
    const hookCount = this.hooks.length;
    // 인스턴스의 슬롯 배열은 그대로 쓰고, 호출 위치만 매 렌더링마다 0부터 센다.
    /** @type {RenderContext} */
    const context = {
      hooks: this.hooks,
      nextIndex: 0,
      update: (changeState) => this.#update(changeState),
      pendingEffects: [],
      pendingMemos: [],
    };
    activeRender = context;
    try {
      // 루트 함수의 this에 인스턴스가 바인딩되지 않도록 꺼내서 호출한다.
      const render = this.#render;
      const vnode = render(this.#props);
      // Diff에서 null은 빈 트리를 뜻한다. 루트 함수는 Element 또는 Text VNode를 반환해야 한다.
      if (vnode === null || vnode === undefined) {
        throw new TypeError('Component must return a VNode.');
      }
      if (this.#previousVNode !== null && context.nextIndex !== hookCount) {
        throw new Error('Hook order changed between renders.');
      }
      return { vnode, pendingEffects: context.pendingEffects, pendingMemos: context.pendingMemos };
    } finally {
      activeRender = previousRender;
    }
  }

  /**
   * @param {Element} container
   * @param {StateChange} [changeState]
   */
  #renderAndCommit(container, changeState) {
    if (this.#isCommitting) {
      throw new Error('Component is already processing a lifecycle operation.');
    }

    /** @type {StateChange[]} */
    const queuedUpdates = [];
    let nextChange = changeState;
    let nextUpdateIndex = 0;
    let schedulingPasses = 0;
    this.#isCommitting = true;
    try {
      do {
        const rollbackState = nextChange?.();
        const pendingEffects = this.#commitDOM(container, rollbackState);
        const queuedCount = queuedUpdates.length;

        // DOM 반영 뒤에만 예약을 받는다. 모든 cleanup과 의존성 저장이 끝나면 큐를 이어서 처리한다.
        this.#queuedEffectUpdates = queuedUpdates;
        runEffectCallbacks(pendingEffects);
        this.#queuedEffectUpdates = null;

        // Effect가 계속 갱신을 예약하면 동기 루프를 끊고 마지막으로 반영된 상태를 유지한다.
        if (queuedUpdates.length > queuedCount) {
          schedulingPasses += 1;
          if (schedulingPasses > MAX_EFFECT_UPDATE_PASSES) {
            throw new Error('Too many consecutive effect updates.');
          }
        }
        nextChange = queuedUpdates[nextUpdateIndex++];
      } while (nextChange !== undefined);
    } finally {
      this.#queuedEffectUpdates = null;
      this.#isCommitting = false;
    }
  }

  /**
   * @param {Element} container
   * @param {() => void} [rollbackState]
   */
  #commitDOM(container, rollbackState) {
    const previous = this.#previousVNode;
    const hookCount = this.hooks.length;
    let applyingPatches = false;
    try {
      const { vnode, pendingEffects, pendingMemos } = this.#renderVNode();
      // 첫 마운트는 null과 비교해 루트를 삽입하고, 갱신은 마지막으로 적용한 트리와 비교한다.
      const patches = diff(previous, vnode);
      applyingPatches = true;
      applyPatches(container, patches);
      for (const [index, slot] of pendingMemos) {
        this.hooks[index] = slot;
      }
      this.#previousVNode = vnode;
      this.#container = container;
      return pendingEffects;
    } catch (error) {
      // 렌더링 중 새로 만든 슬롯과 상태 변경을 되돌린다. 예약된 Effect는 실행되지 않는다.
      this.hooks.length = hookCount;
      rollbackState?.();
      if (applyingPatches && previous !== null) {
        // 앞선 Patch가 이미 DOM을 바꿨을 수 있으므로 마지막 성공 트리로 화면을 복원한다.
        replaceDOMTree(container, previous);
      }
      throw error;
    }
  }
}
