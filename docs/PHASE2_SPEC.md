# Phase 2 설계 계약

이 문서는 Stage 1에 필요한 컴포넌트 계약을 정의한다. 기존 엔진의 타입과 DOM 동작은 [Phase 1 설계 계약](architecture.md)을 따른다.

## Stage 1 — 최초 렌더링

| 인터페이스 | 계약 |
| --- | --- |
| `new FunctionComponent(render, props)` | [`src/component/function-component.js`](../src/component/function-component.js)에서 가져온다. `render(props)`는 `ElementVNode` 또는 `TextVNode` 하나를 반환한다. props가 없는 함수에는 `{}`를 전달할 수 있다. |
| `hooks` | 인스턴스마다 독립적인 빈 배열로 초기화한다. |
| `previousVNode` | 읽기 전용 getter다. 최초 렌더링 전에는 `null`이며, 마운트 성공 후에는 함수가 반환한 VNode 참조를 돌려준다. |
| `mount(container): void` | 비어 있는 HTML 컨테이너에 첫 트리를 삽입한다. 인스턴스당 성공한 최초 마운트는 한 번이며, 재호출하면 `Error`가 발생한다. |

- 루트 함수는 props로 첫 VNode를 만든다. 자식은 `Child(childProps)`로 호출하는 순수 함수이며, 부모는 반환된 VNode를 `h()`의 자식 목록에 넣는다.
- `FunctionComponent`는 `diff(null, vnode)`로 루트 삽입 Patch를 만들고 `applyPatches()`에 전달한다. DOM 계층이 컨테이너의 `ownerDocument`로 `createDOM()`을 호출하고 생성한 노드를 삽입한다.
- `null`과 `undefined`를 반환하면 `TypeError`가 발생한다. 나머지 VNode 형식과 컨테이너의 빈 상태는 엔진이 검증한다. 렌더링이나 삽입에 실패하면 `previousVNode`는 `null`이고, 실패 원인을 제거한 뒤 마운트를 재시도할 수 있다.
- 단위 테스트는 배열 독립성, 마운트 성공 전후의 VNode 참조, 중복 호출과 잘못된 반환을 확인한다. 통합 테스트는 실제 엔진으로 부모·자식 props를 렌더링하고, 비어 있지 않은 컨테이너를 거절할 때 기존 노드 참조를 유지하는지 확인한다.
