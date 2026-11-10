# 미니 리액트 구현

## 과제 개요

- 두 단계에 걸쳐 **"동작하는 미니 리액트"** 를 직접 구현합니다.
  - **Phase 1**: Virtual DOM + Diff 알고리즘 + Patch
  - **Phase 2**: 함수형 Component + State + Hooks (`useState` / `useEffect` / `useMemo`)
- 최종 결과물은 사용자의 입력/클릭 등에 따라 **부분 업데이트되는 동작하는 웹 페이지**입니다.

## Phase 1. Virtual DOM + Diff + Patch

- React 의 핵심 개념인 Virtual DOM 과 Diff 알고리즘을 구현합니다.
  - 브라우저의 DOM 정보를 읽어서 Virtual DOM 으로 변환하는 함수를 작성합니다.
  - 두 Virtual DOM 을 비교하여 변경된 부분을 찾아내는 Diff 알고리즘을 작성합니다.
- 이 알고리즘을 검증할 수 있는 웹 페이지를 구현합니다.
  - 페이지 내에 다음과 같이 2개의 영역과 **Patch, 뒤로가기, 앞으로가기** 버튼들이 있어야 합니다.
    - 실제 영역
    - 테스트 영역
  - 웹 페이지를 로드하면
    - "실제 영역" 의 샘플 HTML 코드를 Virtual DOM 트리로 변환합니다.
  - 방금 만든 Virtual DOM 을 이용하여 테스트 영역을 렌더링합니다.
  - 사용자가 "테스트 영역" 에 있는 샘플 HTML 코드를 자유롭게 수정합니다.
  - Patch 버튼을 누르면
    - 현재 테스트 영역 상태를 다시 Virtual DOM 으로 만듭니다.
    - Diff 알고리즘을 이용해서 이전 Virtual DOM 과 비교하여 변경된 부분을 찾습니다.
    - 변경된 부분만 "실제 영역" 에 렌더링합니다.
    - 새로 변경된 Virtual DOM 은 State History 에 저장합니다.
  - 뒤로가기, 앞으로가기 버튼을 눌러 state history 에 저장된 특정 Virtual DOM 으로 이동 가능하며 "실제 영역", "테스트 영역" 도 함께 변경되어야 합니다.

## Phase 2. Component · State · Hooks

- 이번 단계 과제는 기존 React 의 핵심 기능인 Component · State · Hooks 를 직접 구현하고 이를 활용하여 동작하는 웹 페이지를 만들어 보는 것입니다.

### Component (컴포넌트)

- Component 는 UI 를 나누는 작은 단위입니다.
- 각각의 Component 는 자신만의 로직과 렌더링을 담당합니다.
- 반드시 **함수형 컴포넌트** 로 구현합니다.
- 구현 방식
  - 함수형 컴포넌트를 감싸는 `FunctionComponent` 클래스를 직접 만듭니다.
  - 이 클래스에는 아래 기능이 필요합니다.
    - `hooks` 배열 (상태 저장용)
    - `mount()`: 처음 렌더링
    - `update()`: 상태 변경 후 다시 렌더링
- **제약조건 (중요)**
  - Hook 은 최상위 컴포넌트에서만 사용 가능합니다.
  - State (상태) 는 "최상위 컴포넌트 (루트 컴포넌트)" 에서만 관리합니다.
  - 자식 컴포넌트는 state (상태) 를 가지지 않고, 부모로부터 전달받은 props 만 사용합니다. (Lifting State Up 패턴)
    - 즉, 자식 컴포넌트는 상태 없이 (Stateless) props 만 받아서 사용하는 순수 함수로 구현합니다.

### State (상태)

- State 는 값이 변경될 수 있는 동적 데이터입니다.
- State 가 바뀌면 → 화면이 자동으로 다시 그려져야 합니다.

### Hooks

- 함수형 컴포넌트에서도 상태와 생명주기를 사용할 수 있게 해주는 기능입니다.
- 최소 구현 대상
  - `useState`
  - `useEffect`
  - `useMemo`
- 핵심 질문

> "함수는 매번 새로 실행되는데, 상태는 어떻게 유지할까?" → 이 문제를 해결하는 것이 Hooks 의 핵심입니다.

## Phase 1 ↔ Phase 2 연계: Virtual DOM + Diff + Patch 활용

- Phase 2 의 상태가 변경되어 다시 렌더링할 때, Phase 1 에서 만든 Virtual DOM 을 그대로 활용합니다.
- 동작 흐름
  1. Virtual DOM 생성
  2. 이전 Virtual DOM 과 비교 (Diff)
  3. 바뀐 부분만 실제 DOM 에 반영 (Patch)

> **목표: 전체를 다시 그리지 않고 필요한 부분만 업데이트**

## 테스트 페이지 개발

- Phase 1 과 Phase 2 에서 구현한 내용을 활용하여 브라우저에서 동작하는 웹 페이지를 구현합니다.
- 어떤 주제라도 상관 없습니다. 다만, 반드시 사용자의 입력/클릭 등에 따라 화면이 변경되어야 합니다.

## 기술 스택 / 제한

- HTML, CSS, Javascript (또는 Typescript) — Vanilla
- 외부 프레임워크 (React, Vue 등) 사용 금지

## 공통 학습 원칙

- "학습" 보다는 "구현" 이 우선입니다. AI 등을 적극적으로 활용하여 **결과물을 만들어내는 것** 이 최우선 목표입니다.
  - 다만, 만들어진 결과물 중 핵심 로직에 대해서는 이해하고 설명할 수 있어야 합니다.
  - 코드를 직접 작성하기 어려운 경우, 전체 코드를 AI 를 통해 생성해도 괜찮습니다. 다만, 생성된 코드를 반드시 학습하고 그 원리를 이해해야 합니다.
- 추가적으로, 다른 팀과의 차별점을 둘 수 있는 **추가 구현 요소** 에 대해서도 함께 고민해 보시기 바랍니다.

## 중점 포인트

### Phase 1 — 브라우저 / DOM / Diff 관련

- 브라우저에서 DOM 을 다루는 방법 (Document, Window)
- 실제 DOM 의 **변화를 감지** 하기 위한 브라우저 API
- 실제 DOM 이 느린 이유
  - Reflow / Repaint 관점
- Virtual DOM
  - 구조
  - 필요한 이유
- Diff 알고리즘
  - 동작 방식
  - 최소 변경을 찾기 위한 5가지 핵심 케이스
  - 실제 DOM 에 반영 방법
- React 에서 실제 DOM 을 변경할 때, Virtual DOM 과 Diff 알고리즘의 동작 방식

### Phase 2 — Component / State / Hooks 관련

- UI 를 어떻게 Component 로 나눌 것인가?
- State (상태) 는 어디에 두는 것이 좋은가?
- setState 는 상태 변경 외에 무엇을 해야 할까?
- 여러 상태 변경을 한 번에 처리하는 방법은?
  - Batching 방법을 고민해 보세요. 단 **선택 과제**입니다.
- 이번에 구현한 React 와 실제 React 의 차이점에 대해서 공부해 보세요.

## 품질

- **단위 테스트** 를 통해 각 모듈 (Virtual DOM 변환, Diff, Patch, useState, useEffect, useMemo 등) 을 검증합니다.
- 기능 테스트를 통해 화면이 제대로 동작하는지 확인합니다.
- 테스트 영역에 다양한 태그와 요소를 추가해 여러 동작과 변화를 자유롭게 확인해 보세요.
- **엣지 케이스를 최대한 고려** 합니다.
- 이력서와 포트폴리오에 포함할 수 있을 만큼 완성도 높은 수준으로 구현합니다.

## Phase 1 데모 실행

Node.js 지원 범위는 `package.json`의 `engines`에 있습니다. 아래 명령을 실행하고 터미널에 표시되는 로컬 주소를 브라우저에서 엽니다.

```sh
npm ci
npm run dev
```

**HTML 코드 보기** 스위치를 켜면 실제 영역의 소스를 확인하고 테스트 영역의 태그·속성·텍스트를 수정할 수 있습니다. 테스트 코드는 루트 노드 하나를 기준으로 편집합니다. 스위치를 끄면 초안이 렌더링된 모습을 볼 수 있고, **Patch**를 누르면 실제 영역에 반영됩니다. **뒤로가기**와 **앞으로가기**는 두 영역을 같은 이력으로 맞춥니다. 뒤로 간 뒤 새 편집을 반영하면 그 위치에서 새 이력이 시작됩니다.

- [데이터 구조·인터페이스·의존성](docs/architecture.md)
- [단계별 구현·검증·학습 계획](PLAN.md)
- [AI 작업 공통 지침](AGENTS.md)
- [JavaScript JSDoc 계약](src/core/contracts.js)

| 명령 | 용도 |
| --- | --- |
| npm run dev | Phase 1 데모 개발 서버 실행 |
| npm test | Vitest 전체 실행, watch 없이 종료 |
| npm run test:unit | 순수 로직과 DOM 단위 테스트 |
| npm run test:integration | jsdom 환경 통합 테스트 |
| npm run test:watch | 개발 중 변경 감지 |
| npm run typecheck | JS/JSDoc 계약 정적 검사, 출력 파일 없음 |
| npm run check | 정적 검사 후 전체 테스트 |

Vitest는 기능별 단위 테스트와 엔진·데모 통합 테스트를 실행합니다. `tests/contracts`는 JSDoc 타입 검사를 위한 fixture입니다. DOM이 필요한 테스트에는 파일 첫 줄에 `// @vitest-environment jsdom`을 붙입니다.
