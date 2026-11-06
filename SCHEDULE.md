# 미니 리액트 구현 계획

## 진행 원칙

- 일차를 나누지 않고 **Phase 1 → Phase 2 → 마무리** 순서로 진행합니다. 앞 단계가 끝나면 바로 다음으로 넘어갑니다.
- 개념은 꼭 필요한 만큼만 먼저 보고, 나머지는 구현하면서 익힙니다.
- 코드는 AI로 빠르게 만들고, 모듈 하나가 끝날 때마다 **설명 체크포인트**를 통과해야 다음으로 넘어갑니다. 코드를 보지 않고 화이트보드에 설명할 수 있으면 통과입니다.
- T자형 학습: 핵심(diff, patch, hooks)은 깊게 파고, 심화(Fiber, 합성 이벤트 등)는 지도만 그려 둡니다.

반복 흐름:

> 짧은 개념 → AI로 구현 → 테스트를 돌리며 코드 읽기 → 체크포인트(안 보고 설명하기) → 막히면 그 개념만 깊게 보기

## 폴더 구조

```
src/
  vdom.js        # domToVNode, createElement (VNode ↔ DOM)
  diff.js        # diff(old, new) → patches
  patch.js       # patch(dom, patches)
  component.js   # h(), FunctionComponent, useState/useEffect/useMemo
phase1/index.html  # 실제 영역 / 테스트 영역 / Patch·뒤로·앞으로
app/index.html     # Phase 2 데모 앱
tests/           # 모듈별 단위 테스트
```

- 프레임워크 없이 ES Module로 만듭니다. 브라우저는 `file://`로 연 페이지에서 모듈 import를 막기 때문에 로컬 서버로 띄워야 합니다(예: `npx serve`).
- 테스트는 Vitest + jsdom을 씁니다. 둘 다 개발용 도구라서 "외부 프레임워크 금지" 규칙에 걸리지 않습니다.

---

## Phase 1: VDOM, Diff, Patch

**시작 전 개념:** 브라우저 렌더링 과정, Reflow/Repaint, VDOM이 왜 필요한지, VNode 구조 `{type, props, children}`, DOM 읽기 API(`nodeType`, `childNodes`, `attributes`)

| 순서 | 할 일 |
|---|---|
| 1 | `domToVNode`, `createElement` 구현과 테스트. 공백만 있는 텍스트 노드는 버리고, 주석 노드는 무시합니다 |
| 2 | `diff` 구현. 핵심 5가지 케이스는 **추가 / 삭제 / 타입이 다르면 교체 / 텍스트 변경 / 속성 변경**이고, 자식 노드는 재귀로 비교합니다 |
| 3 | `patch` 구현과 테스트. 같은 부모에서 여러 노드를 지울 때 **뒤에서부터 지워야** 인덱스가 밀리지 않습니다 |
| 4 | Phase 1 페이지 구현. 테스트 영역은 textarea(HTML 원문 편집)로 만듭니다. history는 배열과 인덱스로 관리하고, 뒤로 간 상태에서 Patch를 누르면 앞쪽 기록을 잘라냅니다 |

**체크포인트**
- [ ] 5가지 케이스가 각각 어떤 patch가 되는지 설명할 수 있다
- [ ] 각 patch가 실제 DOM API 중 무엇으로 반영되는지 설명할 수 있다
- [ ] 실제 DOM 조작이 왜 느린지 Reflow/Repaint로 설명할 수 있다

## Phase 2: Component, State, Hooks

**시작 전 개념:** 클로저, 그리고 "함수형 컴포넌트는 매번 다시 호출된다"는 사실

| 순서 | 할 일 |
|---|---|
| 1 | `h(type, props, ...children)` 구현. `type`이 함수면 props를 넘겨 그대로 호출합니다. 자식 컴포넌트는 상태 없는 순수 함수입니다 |
| 2 | `FunctionComponent` 클래스: `hooks[]`, `hookIndex`, `mount()`, `update()`. `update()`는 새 VNode 생성 → `diff` → `patch` 순서로 Phase 1 코드를 그대로 재사용합니다 |
| 3 | `useState`: 렌더할 때마다 `hookIndex`를 0으로 돌려 **호출 순서로 상태를 찾습니다**. `setState`는 값이 같으면(`Object.is`) 건너뛰고, 다르면 리렌더를 예약합니다 |
| 4 | `useEffect`(deps 비교, patch 이후 실행, cleanup), `useMemo`(deps가 같으면 캐시된 값 반환) 구현과 테스트 |
| 5 | Batching(선택 과제): `queueMicrotask`로 여러 `setState`를 리렌더 한 번으로 묶습니다. 자식 컴포넌트에서 hook을 호출하면 에러를 던지게 해서 과제 제약을 코드로 강제합니다 |

**체크포인트**
- [ ] hooks 배열의 인덱스가 렌더마다 어떻게 움직이는지 그림으로 그릴 수 있다
- [ ] 조건문 안에서 hook을 쓰면 왜 깨지는지 설명할 수 있다
- [ ] `setState`가 상태 변경 외에 무엇을 하는지(리렌더 예약, batching) 설명할 수 있다

## 마무리: 데모 앱, 품질, 발표

| 순서 | 할 일 |
|---|---|
| 1 | 데모 앱 구현. 예: 할 일 앱(입력, 목록, 필터는 `useMemo`, localStorage 동기화는 `useEffect`). 상태는 루트에만 두고 자식은 props만 받습니다 |
| 2 | 엣지 케이스 테스트: 빈 자식, 텍스트↔엘리먼트 교체, 속성 삭제, 맨 앞에 노드 삽입, 연속 `setState` 등. 기능 테스트는 jsdom 통합 테스트와 수동 체크리스트로 합니다 |
| 3 | 차별점 1~2개 추가(아래 참고) |
| 4 | README 작성(동작 흐름 다이어그램, 실제 React와의 차이), 발표 리허설 |

**실제 React와의 차이(README·발표에 넣을 내용):** Fiber와 작업 중단 가능한 렌더링, key 기반 재조정, 합성 이벤트, 컴포넌트별 state, 우선순위 스케줄링

## 차별점 후보 (하나만 해도 충분)

1. **MutationObserver 비교 (추천):** innerHTML로 전체를 다시 그릴 때와 우리 patch를 쓸 때의 DOM 변경 횟수를 숫자로 비교합니다. 구현이 작고 발표 효과가 큽니다.
2. **Patch 시각화:** 바뀐 노드를 잠깐 하이라이트하고 patch 로그를 띄웁니다.
3. **key 기반 리스트 재정렬:** 리스트 순서가 바뀔 때 노드를 지우고 다시 만드는 대신 옮기기만 합니다.

## 시간이 부족할 때

Phase 2의 hooks 구현이 가장 오래 걸리기 쉽습니다. 시간이 모자라면 Batching과 차별점부터 줄입니다.
