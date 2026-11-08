# Phase 1 설계 계약

현재 단계는 Stage 0이다. `src/core/contracts.js`는 JSDoc 타입만 제공하며 VNode 생성·변환, Diff, Patch, History 함수는 아직 구현하지 않았다. 아래 함수 시그니처는 이후 구현할 인터페이스다.

## 최소 구조와 의존성

```text
src/
  core/
    contracts.js        # 현재 존재: 데이터·함수 타입의 단일 기준
    vnode.js            # Stage 1: VNode 생성과 자식 정규화
    diff.js             # Stage 2: 순수 비교 → Patch 목록
    history.js          # Stage 4: 순수 이력 연산
  dom/
    from-dom.js         # Stage 1: DOM → VNode
    render.js           # Stage 1: VNode → 새 DOM
    patch.js            # Stage 3: 기존 DOM 부분 변경
  app/
    main.js             # Stage 5: 두 영역·버튼 연결
    style.css           # Stage 5
index.html              # Stage 5: 실제 영역, 편집 영역, 세 버튼
tests/
  contracts/            # 현재 존재: JSDoc 정적 검사 fixture
  unit/                 # 현재는 Node 환경 확인; 이후 기능별 테스트
  integration/          # 현재는 jsdom 환경 확인; 이후 실제 모듈 연결 테스트
  setup.js              # DOM fixture 정리
```

미구현 모듈·빈 디렉터리·throw 전용 함수는 미리 만들지 않는다. 필요한 단계에서 구현 파일과 테스트를 함께 추가한다.

- `vnode`, `diff`, `history`는 서로 독립적이며 DOM 전역이나 app을 참조하지 않는다. 공통 타입만 공유한다.
- `from-dom`은 `vnode`의 생성 함수를 사용할 수 있다.
- `render`는 VNode와 명시적으로 전달받은 Document를 사용한다.
- `patch`는 `render`에 의존한다. `render`와 `patch`의 속성·이벤트 처리 중복이 실제로 생기면 그때 DOM 내부 helper를 추출한다.
- `app`만 위 모듈을 조합한다. 하위 모듈은 app을 import하지 않는다.
- Phase 2의 함수형 컴포넌트 계층은 VNode를 생성하고 동일한 `diff → applyPatches`를 호출한다. Phase 1 엔진에 Hooks를 넣지 않는다.

## 데이터 구조

정확한 필드와 유니온은 `src/core/contracts.js`가 기준이다.

```js
// TextVNode
{ kind: 'text', value: 'hello' }

// ElementVNode
{
  kind: 'element', tag: 'button',
  props: { attrs: { class: 'primary', disabled: '' }, events: {} },
  children: [{ kind: 'text', value: 'Patch' }]
}

// Patch 예시: 루트의 첫 번째 텍스트 자식 변경
{ type: 'TEXT', path: [0], value: '완료' }

// History: 각 entry는 VNode 또는 빈 루트를 뜻하는 null
{ entries: [initialTree, nextTree], index: 1 }
```

- VNode·Patch·History는 불변 값으로 취급한다. JSDoc의 readonly는 정적 계약이며 런타임 freeze가 아니다. 공개 함수는 입력을 수정하지 않으며 소유권 규칙을 단위 테스트로 검증한다.
- `h`는 입력 props·배열을 복사한다. History 저장 시 트리·props·배열을 복사해 스냅샷을 분리한다. 이벤트 함수 참조는 유지하며 함수가 참조하는 외부 상태까지 복원하지 않는다. DOM 노드를 트리에 넣지 않는다.
- HTML Element와 Text만 지원한다. 소문자 태그, 문자열 속성, `style`·`class` 문자열을 사용한다. boolean 속성은 존재 시 `''`, 제거 시 키 삭제다. `false` 문자열은 제거가 아니다.
- `events`는 `click` 같은 이름 → EventListener 참조다. DOM에서 기존 리스너를 읽을 수 없으므로 `domToVNode`는 `events: {}`를 반환한다. 함수 비교는 참조 동일성이다. 렌더링 시 `addEventListener`, 변경·삭제 시 기존 함수를 `removeEventListener`로 해제한다. DOM 노드에 연결된 리스너의 내부 기록은 DOM 계층이 관리한다.
- 공백·빈 텍스트 노드를 그대로 유지하며 경로 인덱스는 `children`이 아닌 `childNodes`와 대응한다. 주석, SVG, template, inline `on*` 속성 등 지원하지 않는 입력은 조용히 누락하지 않고 TypeError로 거절한다.
- form의 `.value`·`.checked`처럼 속성과 별개인 live property, 포커스·selection은 Phase 1 스냅샷 범위 밖이다. 테스트 영역은 Stage 5에서 루트 내부를 contenteditable로 편집한다.
- key·Fragment·컴포넌트 VNode는 Phase 1에서 제외한다. Phase 2 자식 함수는 평가 후 동일한 Element/Text VNode를 반환한다.

## Patch 주소와 적용 규칙

컨테이너는 엔진이 소유하는 루트 노드를 0개 또는 1개만 가진다. 실제 영역과 테스트 영역의 바깥 컨테이너는 서로 별도이며 트리에 포함하지 않는다.

| type | 필수 데이터 | 의미 |
| --- | --- | --- |
| INSERT | path, node | 경로의 마지막 인덱스 앞에 삽입; 자식 수와 같은 인덱스면 append |
| REMOVE | path | 해당 노드 제거 |
| REPLACE | path, node | 해당 노드를 새 노드로 교체 |
| TEXT | path, value | Text 노드의 값만 변경 |
| PROPS | path, changes | Element의 속성·이벤트를 추가·변경·제거 |

- `[]`는 루트다. INSERT `[]`는 빈 컨테이너에서만 유효하다. REMOVE `[]` 이후 컨테이너는 비며, 빈 트리는 null이다.
- `[i, j]`는 현재 루트의 `childNodes[i].childNodes[j]`다. 인덱스는 0 이상의 정수다.
- 모든 경로는 **앞선 Patch까지 적용한 현재 DOM** 기준이다. 목록은 순서가 있는 명령이며 재정렬하지 않는다. Diff 구현 시 자식 삭제에 따른 인덱스 이동을 반드시 테스트한다.
- PROPS의 `changes`는 `setAttrs`, `removeAttrs`, `setEvents`, `removeEvents` 네 필드를 모두 갖는다. 동일 이름을 같은 범주의 set과 remove에 함께 넣지 않는다.
- Diff는 형제 노드를 인덱스로 대응한다. 재배열은 필요한 TEXT/PROPS/REPLACE/INSERT/REMOVE로 표현하며 최소 이동 수나 key 기반 정체성을 보장하지 않는다.
- 잘못된 경로·노드 종류·컨테이너 상태는 적용 시 예외다. 롤백은 제공하지 않으므로 목록 중간 실패 시 앞선 변경은 남을 수 있다. 정상 app 흐름은 저장된 트리와 실제 DOM을 일치시켜 유효한 Patch만 적용하며, 오류 시 이력을 진행시키지 않고 현재 스냅샷으로 복구한다.

## 함수 인터페이스

`Tree = VNode | null`, `PatchList = readonly Patch[]`. 아래 함수 타입도 contracts.js에 정의한다. 해당 구현 모듈은 그 typedef를 JSDoc으로 참조한다.

| 모듈 | export와 시그니처 | 책임·부수 효과 |
| --- | --- | --- |
| core/vnode.js | `h(tag, props: VNodeProps \| null, children?: readonly VNodeChild[]): ElementVNode` | 순수 생성; string/number → Text, boolean/null/undefined 생략. 중첩 배열은 지원하지 않음 |
| core/vnode.js | `createTextVNode(value: string \| number): TextVNode` | 순수 생성; 문자열로 정규화 |
| dom/from-dom.js | `domToVNode(node: Element \| Text): VNode` | DOM 읽기만 수행; Document·컨테이너 전체를 받지 않음 |
| dom/render.js | `createDOM(vnode: VNode, ownerDocument: Document): Element \| Text` | 연결되지 않은 DOM 생성; 컨테이너에 자동 삽입하지 않음 |
| core/diff.js | `diff(previous: Tree, next: Tree): PatchList` | 순수 비교; 같은 트리면 `[]`, 입력을 수정하지 않음 |
| dom/patch.js | `applyPatches(container: Element, patches: PatchList): Element \| Text \| null` | DOM 변경 후 현재 루트 반환; `[]`면 노드 정체성 유지 |
| core/history.js | `createHistory(initial: Tree): History` | 초기 스냅샷 1개, index 0 |
| core/history.js | `pushHistory(history: History, next: Tree): History` | 현재 위치 이후 이력을 버리고 새 스냅샷 추가 |
| core/history.js | `undo(history: History): History` | index 감소; 시작 경계에서는 기존 History 반환 |
| core/history.js | `redo(history: History): History` | index 증가; 마지막 경계에서는 기존 History 반환 |
| core/history.js | `getCurrent(history: History): Tree` | 현재 스냅샷 반환 |
| app/main.js | `startDemo(elements: DemoElements): () => void` | 초기 동기화, 버튼 연결; 반환 함수는 이벤트 해제 |

형식 오류는 TypeError, 경로·이력 범위 오류는 RangeError로 구분한다. 구체적인 오류 메시지는 테스트 계약으로 고정하지 않는다. 타입 검사는 인덱스 범위·HTML 지원 여부·배치 순서까지 검증하지 않으므로 구현 단계의 런타임 검증과 테스트가 필요하다.

## 데모와 이력 흐름

1. 시작: 실제 영역의 단일 루트 → VNode → History 생성 → 새 DOM을 테스트 영역에 렌더링한다.
2. 편집: 테스트 영역의 루트 내부만 편집한다. 편집 중에는 실제 영역·History를 바꾸지 않는다.
3. Patch: 현재 저장 트리와 테스트 영역에서 읽은 트리를 비교한다. 실제 영역에 적용 성공한 뒤 History에 저장한다. 변경이 없으면 저장하지 않는다.
4. Undo/Redo: 이동한 History의 스냅샷을 목표로 실제·테스트 두 영역 모두 Diff/Patch한다. 실제 영역은 저장된 현재 트리, 테스트 영역은 편집 DOM을 다시 읽은 트리를 각각 비교의 출발점으로 사용한다. 테스트 영역의 미반영 편집은 이때 버린다. 이력 이동 시 새 entry를 저장하지 않는다.
5. Undo 후 Patch하면 미래 이력을 버린다. 이동 경계에서는 버튼을 비활성화하고 상태를 유지한다.

Phase 2는 과제 README의 `FunctionComponent` 클래스(`hooks`, `mount`, `update`)를 별도 계층으로 구현한다. 루트만 State/Hooks를 사용하고 자식은 props만 받는 순수 함수로 유지한다.

## 선택한 기본값과 대안

| 기본값 | 이점 | 비용·대안 |
| --- | --- | --- |
| 인덱스 기반 형제 비교 | 코드·테스트·에이전트 문맥이 작음 | 중간 삽입·재정렬 시 변경량 증가. 필요하면 key·MOVE를 별도 단계로 도입 |
| VNode 스냅샷 이력 | Undo/Redo와 분기 설명·검증이 쉬움 | 이력 수 H, 트리 크기 N에 대해 O(HN) 메모리. 대안은 역 Patch 이력이나 구조 공유 |
| JS + JSDoc 검사 | Vanilla JS 유지, 계약 위반을 구현 전에 발견 | 개발 의존성 TypeScript 1개 추가. 대안은 검사 없는 JSDoc 또는 TS 소스 |

테스트는 [Vitest](https://vitest.dev/guide/)를 사용한다. 순수 모듈은 Node, DOM 모듈·통합은 [jsdom 환경](https://vitest.dev/guide/environment.html)에서 검증한다. 정적 계약은 [JSDoc typedef](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)를 검사하며 코드를 생성하지 않는다. jsdom은 실제 브라우저의 레이아웃·selection 검증을 대체하지 않는다.
