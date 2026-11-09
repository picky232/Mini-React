# 미니 리액트 과제: 핵심 요구사항

Vanilla HTML/CSS/JS(TS)로 동작하는 미니 리액트를 만든다. React, Vue 같은 외부 프레임워크는 금지(테스트 도구는 허용).
일정, 폴더 구조, 체크포인트는 docs/SCHEDULE.md를 따른다. 문서는 모두 docs/에 둔다.

## Phase 1: Virtual DOM + Diff + Patch
- 실제 DOM을 읽어 VDOM으로 바꾸는 함수, 두 VDOM을 비교하는 diff를 만든다.
- 검증 페이지에는 **실제 영역**, **테스트 영역**, **Patch / 뒤로가기 / 앞으로가기** 버튼이 있다.
  1. 로드하면 실제 영역의 샘플 HTML을 VDOM으로 바꾸고, 그 VDOM으로 테스트 영역을 렌더링한다.
  2. 사용자가 테스트 영역의 HTML을 수정한다.
  3. Patch를 누르면 테스트 영역을 새 VDOM으로 만들고, 이전 VDOM과 diff해서 **바뀐 부분만** 실제 영역에 반영한다. 새 VDOM은 history에 저장한다.
  4. 뒤로/앞으로 가기를 누르면 history의 VDOM으로 이동하고, 두 영역이 함께 바뀐다.
- diff 핵심 5가지 케이스: 추가 / 삭제 / 타입 교체 / 텍스트 변경 / 속성 변경 (자식은 재귀로 비교)

## Phase 2: Component, State, Hooks
- 함수형 컴포넌트만 쓴다. `FunctionComponent` 클래스에는 `hooks` 배열, `mount()`, `update()`가 있다.
- **제약:** hook과 state는 루트 컴포넌트에서만 쓴다. 자식은 props만 받는 stateless 순수 함수다(Lifting State Up).
- state가 바뀌면 자동으로 다시 렌더링한다. 이때 Phase 1의 VDOM 생성 → diff → patch를 그대로 재사용한다(전체를 다시 그리지 않는다).
- 최소 구현 hook: `useState`, `useEffect`, `useMemo`
- 핵심 질문: "함수는 매번 새로 실행되는데, 상태는 어떻게 유지할까?"
- Batching(여러 setState를 한 번에 처리)은 선택 과제다.

## 데모 페이지
- 주제는 자유다. 사용자 입력이나 클릭에 따라 화면이 부분 업데이트되면 된다.

## 품질 기준
- 모듈별 단위 테스트: VDOM 변환, diff, patch, useState, useEffect, useMemo
- 기능 테스트로 화면 동작을 확인하고, 엣지 케이스를 최대한 다룬다.
- 포트폴리오에 넣을 수준으로 완성한다. 다른 팀과 다른 차별점을 하나 이상 넣는다.

## 설명할 수 있어야 하는 것 (발표·README)
- DOM 조작이 느린 이유(Reflow/Repaint), DOM 변화를 감지하는 브라우저 API(MutationObserver)
- VDOM의 구조와 필요한 이유, diff 동작 방식, patch를 실제 DOM에 반영하는 방법
- 컴포넌트 분리 기준, state를 둘 위치, setState가 상태 변경 말고 하는 일(리렌더 예약)
- 이번에 만든 구현과 실제 React의 차이
- AI로 만든 코드라도 핵심 로직은 직접 설명할 수 있어야 한다. 코드를 만들 때 핵심 원리도 함께 짚어 준다.
