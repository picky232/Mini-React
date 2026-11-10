# Phase 2 설계 계약

이 문서는 구현 단계에서 확정한 컴포넌트와 Hook 계약을 기록한다. 기존 엔진의 타입과 DOM 동작은 [Phase 1 설계 계약](architecture.md)을 따른다.

## Stage 1 — 최초 렌더링

| 인터페이스 | 계약 |
| --- | --- |
| `new FunctionComponent(render, props)` | [`src/component/function-component.js`](../src/component/function-component.js)에서 가져온다. `render(props)`는 `ElementVNode` 또는 `TextVNode` 하나를 반환한다. props가 없는 함수에는 `{}`를 전달할 수 있다. |
| `hooks` | 인스턴스마다 독립적인 빈 배열로 초기화한다. |
| `previousVNode` | 읽기 전용 getter다. 마운트 전과 해제 후에는 `null`이며, 마운트한 동안에는 마지막으로 DOM에 반영한 VNode 참조를 돌려준다. |
| `mount(container): void` | 비어 있는 HTML 컨테이너에 첫 트리를 삽입한다. 마운트된 동안 재호출하면 `Error`가 발생한다. |

- 루트 함수는 props로 첫 VNode를 만든다. 자식은 `Child(childProps)`로 호출하는 순수 함수이며, 부모는 반환된 VNode를 `h()`의 자식 목록에 넣는다.
- `FunctionComponent`는 `diff(null, vnode)`로 루트 삽입 Patch를 만들고 `applyPatches()`에 전달한다. DOM 계층이 컨테이너의 `ownerDocument`로 `createDOM()`을 호출하고 생성한 노드를 삽입한다.
- `null`과 `undefined`를 반환하면 `TypeError`가 발생한다. 나머지 VNode 형식과 컨테이너의 빈 상태는 엔진이 검증한다. 렌더링이나 삽입에 실패하면 `previousVNode`는 `null`이고, 실패 원인을 제거한 뒤 마운트를 재시도할 수 있다.
- 단위 테스트는 배열 독립성, 마운트 성공 전후의 VNode 참조, 중복 호출과 잘못된 반환을 확인한다. 통합 테스트는 실제 엔진으로 부모·자식 props를 렌더링하고, 비어 있지 않은 컨테이너를 거절할 때 기존 노드 참조를 유지하는지 확인한다.

## Stage 2 — 상태와 부분 갱신

| 인터페이스 | 계약 |
| --- | --- |
| `update(): void` | 마운트한 컨테이너에서 루트 함수를 다시 실행한다. 기존 `diff(previousVNode, nextVNode)`와 `applyPatches()`를 사용하고 적용이 성공하면 `previousVNode`를 갱신한다. 마운트 전이나 갱신 도중 같은 인스턴스에 재진입하면 `Error`가 발생한다. |
| `useState(initialValue)` | `FunctionComponent`와 같은 모듈에서 가져온다. 루트 렌더 함수 안에서 호출하면 `[state, setState]`를 반환한다. 초기값은 슬롯을 처음 만들 때 사용하며 함수도 초기값으로 저장할 수 있다. |
| `setState(valueOrUpdater): void` | 값을 받거나 최신 슬롯 값을 입력으로 받는 순수 updater를 실행하고 갱신한다. 함수를 상태로 저장하려면 해당 함수를 반환하는 updater를 전달한다. 일반 이벤트에서는 즉시 갱신하고, `batch()` 안이나 DOM 반영 직후 실행하는 Effect와 cleanup에서는 갱신을 예약한다. |

- 렌더링마다 슬롯 인덱스를 0부터 센다. 같은 순서로 호출하면 값과 setter를 같은 인스턴스의 배열에서 다시 읽는다. 현재 렌더 문맥은 루트 함수 실행 중에만 유지된다. Hook은 루트 함수 최상위에서 항상 같은 순서로 호출하고, 자식에는 값과 핸들러를 props로 전달한다.
- Patch 적용에 실패하면 DOM 계층이 마지막으로 성공한 VNode로 컨테이너의 자식 트리를 다시 만든다. 복구된 자식 노드는 새로 생성되며, 저장된 VNode의 이벤트 리스너도 다시 등록된다. `previousVNode`는 마지막 성공 값을 유지하고 원래 적용 오류는 호출자에게 전달한다. setter가 시작한 렌더링이나 Patch 적용이 실패하면 슬롯 값도 직전 값으로 돌아간다.
- 단위 테스트는 슬롯·루트의 독립성, 일반 값과 함수형 갱신, 렌더 문맥과 실패 후 상태를 확인한다. 통합 테스트는 실제 클릭으로 변경된 DOM과 기존 노드 참조를 검사하고, 앞선 Patch 적용을 관찰한 뒤 발생한 오류에서 DOM·VNode·상태가 복구되고 재시도할 수 있는지 확인한다.

## Stage 3 — Effect와 컴포넌트 해제

| 인터페이스 | 계약 |
| --- | --- |
| `useEffect(effect, dependencies?): void` | `FunctionComponent`와 같은 모듈에서 가져온다. 루트 렌더 함수에서 호출하며, `effect`는 동기 콜백이고 반환한 함수는 cleanup으로 보관한다. |
| `unmount(): void` | 기존 Patch 엔진으로 소유한 DOM 루트를 제거한다. 컨테이너 연결, 저장된 VNode와 Hook 슬롯을 비운 뒤 남아 있는 cleanup을 호출한다. 이미 해제된 경우 그대로 반환하며, 이후 다시 마운트하면 초기 상태부터 시작한다. |

- 루트는 `useState`와 `useEffect`에 같은 슬롯 인덱스를 사용한다. 렌더링 중에는 Effect를 예약하고 DOM과 VNode가 반영된 직후에 실행한다. 같은 슬롯의 이전 cleanup이 있으면 새 Effect보다 먼저 실행한다. 실패한 렌더링이나 Patch에서 예약한 Effect는 폐기하고 이전 cleanup은 유지한다.
- 의존성은 배열 길이와 각 항목을 `Object.is`로 비교한다. `[]`는 마운트마다 한 번, 생략하면 성공한 렌더링마다 실행한다. 비교 기준으로 사용할 배열의 항목을 복사해 보관한다.
- Effect와 cleanup은 동기적으로 실행한다. 마운트나 갱신에 속한 Effect와 cleanup에서 같은 인스턴스의 setter를 호출하면 요청을 큐에 넣는다. 현재 커밋의 모든 Effect가 끝나고 cleanup과 의존성이 저장되면 요청을 순서대로 하나씩 반영한다. 함수형 updater는 처리 시점의 최신 값을 받는다.
- 직접 생명주기를 재호출하면 `Error`가 발생한다. 해제 시 cleanup에서는 이미 슬롯이 폐기됐으므로 해당 인스턴스의 setter 호출에 오류가 발생한다. Effect 콜백이 실패하면 다른 슬롯의 콜백까지 처리한 뒤 오류를 전달한다. 큐 처리에서 오류가 나거나 한 번의 마운트나 갱신에서 Effect가 새 요청을 추가한 커밋이 50회를 넘으면 대기 중인 요청을 폐기하고 이미 반영한 DOM·VNode·상태를 유지한다.

## Stage 4 — 계산 결과 재사용

| 인터페이스 | 계약 |
| --- | --- |
| `useMemo(calculate, dependencies): T` | `FunctionComponent`와 같은 모듈에서 가져온다. 루트 렌더 함수의 최상위에서 호출하며, 인자 없이 호출할 순수 계산 함수와 의존성 배열을 받는다. |

- Memo 슬롯마다 마지막으로 반영한 렌더의 의존성 배열 복사본과 계산 결과를 보관한다. 배열 길이와 항목을 Effect와 같은 `Object.is` 비교 로직으로 확인한다. 모두 같으면 이전 결과의 참조를 반환하며, 값이나 길이가 다르면 다시 계산한다.
- 새 값은 현재 렌더에서 즉시 사용할 수 있다. DOM 반영에 성공하면 슬롯을 교체하고, 렌더나 Patch에 실패하면 마지막으로 반영한 렌더의 캐시를 유지한다. `[]`는 마운트마다 처음 계산한 결과를 재사용하며, 컴포넌트를 해제하면 Hook 슬롯과 함께 캐시를 비운다.

## Stage 6 — 상태 갱신 배칭

| 인터페이스 | 계약 |
| --- | --- |
| `component.batch(callback): T` | 마운트한 루트 인스턴스의 setter를 콜백이 실행되는 동안 모은다. 콜백이 반환되면 요청 순서대로 최신 상태에 적용한 뒤 한 번 렌더링하고 콜백의 반환값을 돌려준다. |

- 같은 인스턴스의 중첩 호출은 가장 바깥쪽 배치에 합류한다. setter 호출이 없으면 렌더링을 생략한다. 콜백이 Promise를 반환하면 그 시점에 배치를 반영한다. `await` 이후에 호출한 setter는 새 구간에서 동작한다.
- 마운트나 갱신 직후 Effect에서 시작한 배치는 기존 Effect 큐에 단일 갱신으로 들어간다. DOM 반영 후 콜백들이 종료되면 예약 순서에 맞춰 실행된다. 배치를 모으는 동안 같은 인스턴스의 `update()` 또는 `unmount()`를 직접 호출하면 오류가 발생한다.
- 바깥쪽 콜백에서 동기 오류가 전파되면 모은 요청을 폐기한다. updater·렌더링·Patch에서 오류가 발생하면 배치의 상태 변경을 역순으로 되돌린다. DOM 반영이 끝난 뒤 발생한 Effect 오류는 반영된 상태를 유지한다.

## 병합 — 루트 전용 Hook 규칙과 커밋 알림

| 인터페이스 | 계약 |
| --- | --- |
| `child(render, props): VNode` | 자식 컴포넌트를 실행한다. 실행하는 동안 `useState`·`useEffect`·`useMemo`와 setter 호출은 `Error`다. 자식은 props만 받아 VNode를 돌려주는 순수 함수다. |
| `component.onCommit` | DOM 반영에 성공하고 그 커밋의 Effect가 끝날 때마다 `{ patches, hooks, renders }`로 불린다. Hooks 인스펙터 같은 개발 도구용이며 기본값은 `null`이다. 여기서 난 오류는 `console.error`로만 남기고 커밋을 되돌리지 않는다. |

- `TodoForm(props)`처럼 `child()` 없이 직접 호출한 자식은 루트 몸체와 구분할 수 없어 막지 못한다. 자식은 항상 `child()`로 부른다.
- 목록 항목은 `h('li', { attrs, events, key: id }, ...)`처럼 key를 넘기면 diff가 위치 대신 key로 짝짓는다.
