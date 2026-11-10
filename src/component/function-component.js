import { diff } from '../core/diff.js';
import { applyPatches } from '../dom/patch.js';

/** @typedef {import('../core/contracts.js').VNode} VNode */

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

    // 루트 함수의 this에 인스턴스가 바인딩되지 않도록 꺼내서 호출한다.
    const render = this.#render; // #render에 저장한 컴포넌트 함수를 #props를 전달하면서 실행
    const vnode = render(this.#props); // 그 결과 vnode가 저장됨
    // Diff에서 null은 빈 트리를 뜻한다. 루트 함수는 Element 또는 Text VNode를 반환해야 한다.
    if (vnode === null || vnode === undefined) {
      throw new TypeError('Component must return a VNode.');
    }

    // 빈 트리와 비교하면 루트 삽입 Patch가 생긴다. 노드 생성과 삽입은 DOM 엔진이 맡는다.
    applyPatches(container, diff(null, vnode)); // 최초 렌더링과 이후 업데이트에서 동일한 Diff·Patch 엔진을 재사용 가능
    // 마지막으로 방금 렌더링한 VNode를 저장. 그래서 다음 update()에서는 이 VNode를 이전 상태로 사용 가능
    this.#previousVNode = vnode;
  }
}
