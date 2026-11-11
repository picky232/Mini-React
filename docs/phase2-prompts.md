# Mini React Phase 2 실행 프롬프트

Codex와 Claude Code에서 공통으로 사용한다. 에이전트에 `Stage 1 실행해`라고 요청하면 아래 Stage 1과 공통 실행 규칙을 적용한다. 저장소 지침이 자동으로 로드되지 않는 세션에서는 `AGENTS.md와 docs/phase2-prompts.md를 읽고 Stage 1 실행해`라고 요청한다.

## 공통 실행 규칙

- `Stage N 실행해`는 Phase 2의 해당 단계 하나를 뜻한다. `Stage N 분석해`는 아래 코드 분석 프롬프트를 사용한다. Stage 6은 별도 요청을 받은 경우에 진행한다.
- `git status --short`를 확인하고 [AGENTS.md](../AGENTS.md), [PLAN.md](../PLAN.md)의 Phase 2 체크 항목, 해당 단계에 지정한 파일과 기존 테스트를 읽는다. 과제 요구사항은 [README.md](../README.md), Phase 1의 API와 모듈 경계는 [설계 문서](architecture.md)와 [JSDoc 계약](../src/core/contracts.js)을 기준으로 삼는다.
- Stage 1부터는 `docs/PHASE2_SPEC.md`의 관련 계약을 사용한다. 설계 문서가 없거나 현재 단계의 계약이 빠져 있으면 그 단계에 필요한 계약만 먼저 확인해 `docs/PHASE2_SPEC.md`에 기록하고 계속한다. 이 경우 Stage 0 완료 표시는 Stage 0의 설계 범위가 모두 충족됐을 때만 갱신한다. Stage 2~5에서 필요한 이전 단계 구현이 빠져 있으면 빠진 기능과 필요한 단계를 보고한다.
- Vanilla HTML/CSS/JavaScript ESM과 JSDoc을 유지한다. 루트 `FunctionComponent`가 State와 Hooks를 소유하고, 자식은 props를 받아 일반 Element/Text VNode를 반환하는 순수 함수로 둔다. DOM 읽기·쓰기와 리스너 관리는 `dom`에 맡긴다. Phase 1의 공개 계약과 데모·테스트를 보존하고 기존 엔진을 재사용한다.
- 해당 단계의 단위·통합 테스트를 먼저 실행하고 구현 완료 전에 `npm run check`를 실행한다. 파일을 지정해 실행할 때는 `npm test -- <테스트 경로>`를 사용한다. DOM이 필요한 테스트 첫 줄에 `// @vitest-environment jsdom`을 붙인다. 엔진 통합에서는 실제 Diff/Patch를 연결하고, 갱신 결과와 변경되지 않은 노드의 참조 동일성을 확인한다.
- 완료 조건을 충족한 항목을 `PLAN.md`에 체크하고 검증된 진행 상태를 `AGENTS.md`에 반영한다. 보고에는 변경 파일, 실행한 검증과 결과, 핵심 설계 이유, 남은 문제를 담는다. 코드 설명은 핵심 흐름과 관련 파일 위치를 중심으로 한다.
- 단계별 학습 시간은 이론 30%, AI 코딩 40%, 생성 코드 분석 30%로 나눈다. 구현 전에는 단계별 학습 질문을 읽고, 구현 후에는 아래 공통 코드 분석 프롬프트로 실제 동작을 따라간다.

## Stage 0 — Phase 1 분석과 Phase 2 설계

**목표** Phase 1 엔진의 재사용 지점과 Phase 2의 인터페이스를 확정한다.

- **읽기** `README.md`의 Phase 2 요구사항, `docs/architecture.md`, `src/core/contracts.js`, `src/core/vnode.js`, `src/core/diff.js`, `src/dom/render.js`, `src/dom/patch.js`, `tests/integration/engine.test.js`.
- **수정 범위** `docs/PHASE2_SPEC.md`와 진행 기록. Phase 1 소스·테스트를 유지하고 결과물은 설계 문서로 한정한다.
- **설계 계약** 기존 `h()`, `createDOM(vnode, ownerDocument)`, `diff(previous, next)`, `applyPatches(container, patches)`의 실제 시그니처와 역할을 확인한다. 새 모듈의 위치·의존성, `FunctionComponent`의 생성 인자, `mount()`와 `update()`의 입력·출력, 이전 VNode와 컨테이너 소유권을 정한다. 루트 전용 Hook 슬롯과 호출 순서, 갱신·해제·cleanup 흐름, 각 단계의 테스트 기준을 기록한다.
- **완료 기준** 이후 단계가 해당 문서로 구현 범위와 테스트를 정할 수 있다. 기존 계약과 충돌하는 지점을 발견하면 처리 방안도 기록한다. 문서 검토 결과와 재사용할 함수, 추가할 모듈, 핵심 설계 결정을 보고한다.

**학습 질문** `createDOM()`과 `applyPatches()` 중 어떤 함수가 실제 컨테이너에 노드를 삽입하는가?

## Stage 1 — `FunctionComponent`와 `mount()`

**목표** 함수형 컴포넌트를 실행해 첫 화면을 렌더링한다.

- **읽기** 설계 문서의 컴포넌트 계약, `src/core/vnode.js`, `src/dom/render.js`, `src/dom/patch.js`, `tests/unit/render.test.js`, `tests/integration/engine.test.js`.
- **수정 범위** 설계 계약에 지정한 컴포넌트 모듈, 대응 단위·통합 테스트, 필요한 계약과 진행 기록. 이번 단계의 런타임 구현은 초기 렌더링까지다.
- **입력·출력 계약** 루트 컴포넌트 함수와 props를 받아 VNode 하나를 얻는다. 클래스 인스턴스에 빈 `hooks` 배열을 두고, 빈 HTML 컨테이너에 첫 트리를 적용한 뒤 성공한 VNode를 다음 갱신의 기준으로 보관한다. `mount()`가 엔진에 맡기는 기본 경로는 `applyPatches(container, diff(null, vnode))`이며, 루트 삽입에서 기존 `createDOM()`을 사용한다. 부모는 `Child(props)`처럼 자식 함수를 호출해 반환된 VNode를 `h()`의 자식으로 넣는다.
- **완료 기준** 단위 테스트로 초기 Hook 배열과 VNode 보관을 확인하고, 통합 테스트로 빈 컨테이너에 부모·자식 props가 반영된 실제 DOM을 확인한다. 관련 테스트와 `npm run check`를 실행한다. 보고에는 다섯 단계 이내의 `mount()` 흐름과 핵심 로직 두세 가지를 담는다.

**학습 질문** 컴포넌트 함수가 반환한 VNode가 어떤 호출을 거쳐 실제 DOM이 되는가?

## Stage 2 — `update()`와 `useState()`

**목표** 루트의 상태를 유지하고 setter 호출 때 부분 갱신한다.

- **읽기** `docs/PHASE2_SPEC.md`, Stage 1 컴포넌트와 테스트, `src/core/diff.js`, `src/dom/patch.js`.
- **수정 범위** 컴포넌트 갱신 경로, 상태 Hook과 공통 슬롯 관리, 대응 테스트, 필요한 계약과 진행 기록. setter는 이 단계에서 동기적으로 갱신한다.
- **입력·출력 계약** `useState(initialValue)`는 `[state, setState]`를 반환한다. setter는 다음 값 또는 최신 상태를 입력으로 받는 함수형 updater를 받는다. 매 렌더링에서 호출 인덱스를 처음부터 사용하고 같은 순서의 Hook 호출을 같은 루트 인스턴스의 슬롯에 대응시킨다. Hook은 렌더링마다 동일한 순서로 호출한다. 자식은 값과 핸들러를 props로 받는다. `update()`는 루트를 재실행하고 `diff(previous, next)`와 `applyPatches(container, patches)`를 호출해 적용 성공 후 이전 VNode를 갱신한다.
- **완료 기준** 여러 상태 슬롯의 독립성, 재렌더링 후 값 유지, 일반 값 및 최신 상태 기반 함수형 갱신을 단위 테스트로 검증한다. 실제 클릭 → setter → Diff/Patch 통합 테스트에서 카운터와 변경되지 않은 DOM 참조를 확인한다. 관련 테스트와 `npm run check`를 실행하고 상태 저장 위치와 setter → update → diff → patch 흐름을 보고한다.

**학습 질문** 컴포넌트 함수가 매번 다시 실행되어도 상태가 유지되는 이유는 무엇인가?

## Stage 3 — `useEffect()`

**목표** DOM에 렌더링을 반영한 뒤 Effect를 실행하고 이전 Effect를 정리한다.

- **읽기** `docs/PHASE2_SPEC.md`, 컴포넌트의 mount/update 경로, Hook 슬롯과 상태 테스트.
- **수정 범위** Effect Hook, DOM 반영 후 실행 경로, 컴포넌트 해제와 cleanup 경로, 대응 테스트, 필요한 계약과 진행 기록.
- **입력·출력 계약** `useEffect(effect, dependencies?)`는 기존 Hook 슬롯을 재사용한다. 의존성 배열의 길이와 각 항목을 `Object.is`로 비교한다. 첫 DOM 반영 후 실행하며, `[]`는 마운트마다 최초 한 번, 생략 시에는 DOM 반영에 성공한 렌더링마다 실행한다. 재실행 전에는 저장한 이전 cleanup을 실행하고, 컴포넌트를 해제할 때는 남아 있는 cleanup을 실행한다. Effect가 함수를 반환한 경우 그 함수를 cleanup으로 저장한다.
- **완료 기준** 첫 실행, 동일한 의존성에서 건너뜀, 변경 시 이전 cleanup → 새 Effect 순서, `[]`와 생략의 차이, 해제 시 cleanup, `useState`와의 슬롯 독립성을 확인한다. 통합 테스트에서 Effect가 이미 반영된 DOM을 읽는지 검증한다. 관련 테스트와 `npm run check`를 실행하고 렌더·DOM 반영·Effect 실행 순서와 cleanup 조건을 보고한다.

**학습 질문** 렌더링 중에는 어떤 정보만 저장하고, 실제 Effect와 cleanup은 언제 실행하는가?

## Stage 4 — `useMemo()`

**목표** 의존성이 같을 때 이전 계산값을 재사용한다.

- **읽기** `docs/PHASE2_SPEC.md`, 기존 Hook 슬롯·의존성 비교 코드와 대응 테스트.
- **수정 범위** Memo Hook, 재사용할 의존성 비교 로직, 대응 테스트, 필요한 계약과 진행 기록.
- **입력·출력 계약** `useMemo(calculate, dependencies)`는 첫 렌더링이나 의존성 변경 시 계산을 실행하고 결과를 해당 Hook 슬롯에 저장해 반환한다. 배열 길이와 각 항목을 `Object.is`로 비교하고, 같으면 저장된 결과를 반환한다.
- **완료 기준** 최초 호출, 동일 의존성에서 호출 횟수와 반환 참조 유지, 변경 및 배열 길이 변경 시 재계산, 여러 Memo 슬롯의 독립성을 검증한다. `NaN`, `+0`/`-0`처럼 `Object.is`의 차이가 드러나는 입력과 State·Effect·Memo를 한 컴포넌트에서 쓰는 통합 시나리오도 확인한다. 관련 테스트와 `npm run check`를 실행하고 캐시 재사용 조건과 실제 React와의 범위 차이를 보고한다.

**학습 질문** 렌더링은 다시 일어났지만 `calculate`는 실행되지 않는 예를 설명할 수 있는가?

## Stage 5 — Todo 데모와 전체 검증

**목표** 사용자 입력과 클릭으로 부분 갱신되는 Todo 페이지를 완성한다.

- **읽기** `README.md`, `docs/PHASE2_SPEC.md`, 컴포넌트·Hook 공개 API, Phase 1 데모의 실행 방식과 `tests/integration/demo.test.js`.
- **수정 범위** Phase 2 데모의 HTML/CSS/JS 진입점, 대응 테스트, 실행 방법과 구현 범위를 설명하는 README, 진행 기록. 기존 Phase 1 데모에도 계속 접근할 수 있게 한다.
- **동작 계약** 할 일 추가, 완료/미완료 전환, 삭제, 전체/완료/미완료 필터, 완료 개수 표시를 제공한다. 루트에서 `useState`로 목록과 필터를 관리하고, `useMemo`로 필터 결과를 계산하며, `useEffect`로 문서 제목 같은 외부 상태를 동기화한다. 자식은 props와 이벤트 핸들러를 전달받는다. 입력 처리는 기존 엔진의 문자열 속성·이벤트 계약에 맞추고, 사용자 조작 후 화면은 기존 Diff/Patch로 갱신한다.
- **완료 기준** 실제 입력·클릭으로 추가 → 전환 → 필터 변경 → 삭제를 실행하는 통합 테스트를 추가한다. 빈 목록, 빈 입력, 마지막 항목 삭제, 완료 개수와 변경되지 않은 DOM 참조를 확인한다. 기존 Hook·컴포넌트 단위 테스트와 Phase 1 회귀 테스트를 포함해 `npm run check`를 실행한다. `npm run dev`로 브라우저에서 같은 조작을 확인한다. 변경 범위를 추가로 확인할 필요가 있을 때는 `MutationObserver`를 사용한다.
- **문서와 보고** README에 데모 URL 경로와 실행 방법, 이벤트 → State → VNode → Diff/Patch 흐름, 실제 React와의 차이와 현재 한계를 기록한다. 보고에는 구현 항목, 실행 방법, 자동·브라우저 검증 결과, 남은 제한과 후속 개선 우선순위를 담는다.

**학습 질문** 할 일 하나를 완료할 때 어떤 Hook이 어떤 값을 갱신하고, 기존 DOM 중 어느 부분이 바뀌는가?

## 공통 코드 분석 프롬프트 — `Stage N 분석해`

해당 단계의 실제 구현과 테스트를 읽기 전용으로 살펴본다. 기능이 해결하는 문제, 실행 흐름, 핵심 함수와 자료구조의 변화, 설계 이유, 대안 한 가지의 비용, 실제 React와의 차이를 순서대로 정리한다. 어려운 부분은 작은 입력을 예로 들어 호출과 값의 변화를 추적하고 관련 코드 위치를 알려준다. 이해도 확인 문제는 사용자가 요청할 때 낸다.

## Stage 6 (선택) — Batching

**목표** 같은 작업 구간의 여러 State 갱신을 한 번의 렌더링으로 처리한다.

- **읽기** Stage 1~5의 컴포넌트·Hook 계약, setter와 update 코드, 기존 렌더링·Effect 테스트. Stage 5 검증 완료 후 진행한다.
- **수정 범위** 갱신을 모으는 최소 스케줄링 경로, 대응 테스트, 관련 계약과 진행 기록.
- **동작 계약** 갱신을 묶는 구간과 적용 시점, 비동기 경계와 오류 처리 방식을 먼저 문서화한다. 여러 updater를 입력 순서대로 적용하고 각 함수형 updater가 그 시점의 최신 값을 받도록 한다. 동일 구간에서 가능한 경우 `update()`를 한 번 호출한다.
- **완료 기준** 연속 setter 호출의 최종 상태와 렌더링 횟수, 함수형 updater 순서, 정의한 비동기·오류 경계와 기존 동작을 검증한다. 관련 테스트와 `npm run check`를 실행하고 적용 전후 렌더링 횟수와 남은 제약을 보고한다.
