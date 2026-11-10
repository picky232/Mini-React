import { diff } from '../core/diff.js';
import { applyPatches } from '../dom/patch.js';
import { replaceDOMTree } from '../dom/render.js';

/** @typedef {import('../core/contracts.js').VNode} VNode */
/** @typedef {{ hooks: unknown[], nextIndex: number, update: () => void }} RenderContext */
/** @template T @typedef {(previous: T) => T} StateUpdater */
/** @template T @typedef {(action: T | StateUpdater<T>) => void} StateSetter */
/** @template T @typedef {{ value: T, setState: StateSetter<T> }} StateSlot */

// 루트 함수를 실행하는 동안만 슬롯을 찾을 문맥을 제공한다. 상태값은 각 인스턴스에 있다.
/** @type {RenderContext | null} */
let activeRender = null;

/**
 * 슬롯을 만들 때 setter도 함께 만들어 이후 렌더링에서 같은 함수를 반환한다.
 * @template T
 * @param {T} initialValue
 * @param {() => void} update
 * @returns {StateSlot<T>}
 */
function createStateSlot(initialValue, update) {
  /** @type {StateSlot<T>} */
  const slot = {
    value: initialValue,
    setState(action) {
      if (activeRender !== null) {
        throw new Error('Cannot set state during render.');
      }

      // 이전 렌더의 지역 변수 대신 호출 시점에 슬롯에서 최신 값을 읽는다.
      const previous = slot.value;
      slot.value = typeof action === 'function'
        ? (/** @type {StateUpdater<T>} */ (action))(previous)
        : action;

      try {
        update();
      } catch (error) {
        // 갱신이 실패하면 상태값도 마지막으로 화면에 반영된 값과 맞춘다.
        slot.value = previous;
        throw error;
      }
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
  if (activeRender === null) {
    throw new Error('useState requires a rendering root component.');
  }

  const { hooks, update } = activeRender;
  const index = activeRender.nextIndex++;
  // 렌더마다 같은 순서로 호출하는 규칙에 따라 같은 위치에서 같은 타입의 슬롯을 읽는다.
  let slot = /** @type {StateSlot<T> | undefined} */ (hooks[index]);
  if (slot === undefined) {
    slot = createStateSlot(initialValue, update);
    hooks[index] = slot;
  }

  return [slot.value, slot.setState];
}

/**
 * 루트 렌더 함수를 감싸고 렌더링 사이에 유지할 데이터를 보관한다.
 * @template Props
 */
export class FunctionComponent {
  /**
   * 인스턴스마다 슬롯 배열을 따로 두어 렌더 함수가 다시 실행돼도 Hook 값을 유지할 수 있다.
   * @type {unknown[]}
   */
  hooks = [];

  #render;
  #props;

  /** @type {Element | null} */
  #container = null;

  #isCommitting = false;

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
    this.#container = container;
  }

  /** 마운트한 컨테이너에 루트 함수의 새 VNode를 반영한다. */
  update() {
    if (this.#container === null) {
      throw new Error('Component must be mounted before updating.');
    }

    this.#renderAndCommit(this.#container);
  }

  /** @returns {VNode} */
  #renderVNode() {
    const previousRender = activeRender;
    // 인스턴스의 슬롯 배열은 그대로 쓰고, 호출 위치만 매 렌더링마다 0부터 센다.
    activeRender = { hooks: this.hooks, nextIndex: 0, update: () => this.update() };
    try {
      // 루트 함수의 this에 인스턴스가 바인딩되지 않도록 꺼내서 호출한다.
      const render = this.#render;
      const vnode = render(this.#props);
      // Diff에서 null은 빈 트리를 뜻한다. 루트 함수는 Element 또는 Text VNode를 반환해야 한다.
      if (vnode === null || vnode === undefined) {
        throw new TypeError('Component must return a VNode.');
      }
      return vnode;
    } finally {
      activeRender = previousRender;
    }
  }

  /** @param {Element} container */
  #renderAndCommit(container) {
    if (this.#isCommitting) {
      throw new Error('Component is already rendering an update.');
    }

    const previous = this.#previousVNode;
    const hookCount = this.hooks.length;
    let applyingPatches = false;
    this.#isCommitting = true;
    try {
      const vnode = this.#renderVNode();
      // 첫 마운트는 null과 비교해 루트를 삽입하고, 갱신은 마지막으로 적용한 트리와 비교한다.
      const patches = diff(previous, vnode);
      applyingPatches = true;
      applyPatches(container, patches);
      this.#previousVNode = vnode;
    } catch (error) {
      // 실패한 최초 렌더링에서 새로 만든 슬롯을 비워 재시도 시 초기값을 다시 읽는다.
      this.hooks.length = hookCount;
      if (applyingPatches && previous !== null) {
        // 앞선 Patch가 이미 DOM을 바꿨을 수 있으므로 마지막 성공 트리로 화면을 복원한다.
        replaceDOMTree(container, previous);
      }
      throw error;
    } finally {
      this.#isCommitting = false;
    }
  }
}
