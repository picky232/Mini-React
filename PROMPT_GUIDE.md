# 에이전트 프롬프트 작성 지침

오케스트레이션에서 에이전트는 **이 대화를 모른 채** 프롬프트 한 장만 보고 일한다. 프롬프트가 곧 업무 지시서다.
이 문서는 그 지시서를 쓰는 원칙과 템플릿, Phase 1에 바로 쓸 예시를 담는다. 파이프라인 구조는 [PHASE1_PLAN.md](PHASE1_PLAN.md) 5장을 본다.

---

## 1. 원칙 7가지

| # | 원칙 | 나쁜 예 | 좋은 예 |
|---|---|---|---|
| 1 | **맥락은 프롬프트 안에서 끝낸다** | "아까 정한 형식대로" | "`src/types.js`의 `Patch` 타입을 따른다" |
| 2 | **계약을 먼저 읽힌다** | 함수 이름만 알려 줌 | 읽을 파일을 경로로 나열하고, 계약을 바꾸지 말라고 적음 |
| 3 | **수정해도 되는 파일을 못 박는다** | "필요하면 다른 파일도 고쳐" | "`src/diff.js`, `tests/diff.test.js`만 수정한다" |
| 4 | **완료를 명령어로 정의한다** | "잘 동작하게" | "`npx vitest run tests/diff.test.js`가 0 failed" |
| 5 | **실패 시 할 일을 정한다** | 언급 없음 | "3회 수정해도 실패하면 멈추고 원인을 보고한다" |
| 6 | **테스트 약화를 금지한다** | 언급 없음 | "기존 테스트 삭제·skip·기대값 변경 금지" |
| 7 | **보고 형식을 고정한다** | "결과 알려 줘" | 아래 JSON 스키마로 보고 |

추가로 지킬 것:
- 한 프롬프트에는 **한 가지 일**만 시킨다. "구현하고 리뷰도 해 줘"는 두 에이전트로 나눈다.
- 테스트를 **쓰는** 에이전트와 구현을 **고치는** 에이전트를 나눈다. 같은 에이전트가 둘 다 하면 테스트를 약하게 고쳐서 통과시키기 쉽다.
- "왜"를 한 줄 적는다. 규칙의 이유를 알면 에이전트가 예외 상황에서 더 맞게 판단한다.

---

## 2. 템플릿

```
## 역할
너는 <모듈> 담당 구현자다.

## 목표
<한 문장. 무엇을 만들어 어떤 상태로 끝내는지>

## 먼저 읽을 파일
- PHASE1_PLAN.md 의 <장>
- src/types.js (계약. 수정 금지)
- tests/fixtures.js (공용 픽스처. 수정 금지)

## 수정 가능한 파일 (이 외에는 절대 수정하지 않는다)
- src/<모듈>.js
- tests/<모듈>.test.js

## 요구사항
- <구체 조건 1>
- <구체 조건 2>

## 금지
- React, Vue 등 외부 프레임워크 사용
- 계약(src/types.js) 변경. 계약이 부족하면 멈추고 보고한다
- 기존 테스트 삭제, skip, 기대값 약화

## 완료 조건
`<실행 명령>` 결과가 0 failed.

## 실패 시
수정 → 재실행을 최대 3회. 그래도 실패하면 멈추고 실패한 테스트 이름, 에러 메시지, 추정 원인을 보고한다.

## 보고 형식
아래 JSON 하나로만 답한다. (3장 스키마)
```

---

## 3. 보고 스키마

모든 에이전트가 같은 형식으로 보고해야 다음 단계가 결과를 그대로 받아 쓸 수 있다.

```json
{
  "status": "pass | fail | blocked",
  "filesChanged": ["src/diff.js", "tests/diff.test.js"],
  "testCommand": "npx vitest run tests/diff.test.js",
  "testSummary": "12 passed, 0 failed",
  "failures": [
    { "test": "테스트 이름", "error": "에러 메시지", "suspectedModule": "diff | patch | vdom | history | page", "cause": "추정 원인" }
  ],
  "coreIdea": ["핵심 원리 1", "핵심 원리 2", "핵심 원리 3"],
  "predictQuestion": "결과를 예측해 볼 질문 1개와 정답",
  "contractIssues": ["계약이 부족하거나 모순인 점. 없으면 빈 배열"]
}
```

- `status: blocked`는 계약 문제처럼 **혼자 풀면 안 되는 일**을 만났다는 뜻이다. 메인 세션이 계약을 고친 뒤 다시 보낸다.
- `coreIdea`와 `predictQuestion`은 학습용이다. Stage 4에서 체크포인트 자료로 모은다.

---

## 4. Phase 1 프롬프트 예시

공통 부분(금지, 실패 시, 보고 형식)은 템플릿 그대로 붙인다. 아래는 단계마다 달라지는 부분만 적는다.

### Stage 1-A: vdom

```
## 역할
너는 vdom 모듈 담당 구현자다.
## 목표
DOM ↔ VNode 변환 함수 4개를 구현하고, Stage 0에서 만든 createElement까지 포함해 단위 테스트를 통과시킨다.
createElement는 이미 구현되어 있다. 테스트가 실패할 때만 고친다.
tests/vdom.test.js의 기존 createElement 테스트는 지우거나 바꾸지 않고, 그 아래에 새 테스트를 추가한다.
## 먼저 읽을 파일
PHASE1_PLAN.md 1·2·4장, src/types.js, tests/fixtures.js
## 수정 가능한 파일
src/vdom.js, tests/vdom.test.js
## 요구사항
- domToVNode: 공백만 있는 텍스트 노드와 주석은 null. 태그 이름은 소문자
- containerToVNode, htmlToVNode: #root VNode 반환. htmlToVNode는 template 엘리먼트로 파싱
- createElement: VNode → DOM 노드. #text는 텍스트 노드
- vnodeToHTML: #root는 자식만 이어 붙임. 텍스트의 < & 와 속성값의 " 를 이스케이프
- 테스트: 4장 vdom 행의 항목을 모두 다룬다. DOM → VNode → DOM 왕복이 같은지 확인
## 완료 조건
npx vitest run tests/vdom.test.js 결과 0 failed
```

### Stage 1-B: diff

```
## 역할
너는 diff 모듈 담당 구현자다.
## 목표
두 #root VNode를 비교해 Patch 배열을 만드는 순수 함수 diff를 구현한다.
## 먼저 읽을 파일
PHASE1_PLAN.md 2장(Patch, 순서 규칙)과 4장, src/types.js, tests/fixtures.js
## 수정 가능한 파일
src/diff.js, tests/diff.test.js
## 요구사항
- 같은 위치끼리 비교한다. 판단 순서: 추가 → 삭제 → 타입 다름(REPLACE, 하위 비교 안 함) → 텍스트 다름(TEXT) → 속성 다름(PROPS) → 자식 재귀
- 한 부모의 REMOVE는 인덱스 내림차순으로 내보낸다 (이유: patch가 배열 순서대로 지워도 인덱스가 밀리지 않게)
- 모든 path는 이전 트리 기준
- DOM API를 쓰지 않는다 (테스트에서 DOM 없이 돌아야 함)
- 테스트는 tests/fixtures.js 의 CASES[].oldV / newV 로 diff를 직접 호출하고 patches 와 toEqual 비교한다
- src/vdom.js 를 import하지 않는다 (이유: vdom 구현과 병렬로 진행하기 위해)
## 완료 조건
npx vitest run tests/diff.test.js 결과 0 failed
```

### Stage 1-C: patch

```
## 역할
너는 patch 모듈 담당 구현자다.
## 목표
Patch 배열을 실제 DOM 컨테이너에 적용하는 patch 함수를 구현한다.
## 먼저 읽을 파일
PHASE1_PLAN.md 2장, src/types.js, tests/fixtures.js
## 수정 가능한 파일
src/patch.js, tests/patch.test.js
## 요구사항
- path를 따라 컨테이너에서 대상 노드를 찾는다. [] 는 컨테이너
- 5가지 타입을 2장 표의 DOM API로 반영한다. 노드 생성은 src/vdom.js의 createElement만 import한다
- 배열 순서대로 적용한다 (정렬은 diff 책임)
- 테스트는 diff를 쓰지 말고 손으로 만든 patch로 작성한다 (이유: diff 구현과 병렬로 진행하기 위해)
- createElement는 Stage 0에서 이미 구현되어 있다. 동작이 계약과 다르면 직접 고치지 말고 status: blocked로 보고한다
## 완료 조건
npx vitest run tests/patch.test.js 결과 0 failed
```

### Stage 1-D: history + 검증 페이지

```
## 역할
너는 history 모듈과 Phase 1 검증 페이지 담당 구현자다.
## 목표
순수 history 모듈을 구현해 테스트를 통과시키고, 6장 동작대로 검증 페이지를 만든다.
## 먼저 읽을 파일
PHASE1_PLAN.md 1·2·6장, src/types.js
## 수정 가능한 파일
src/history.js, tests/history.test.js, phase1/index.html, phase1/main.js, phase1/style.css
## 요구사항
- history: 뒤로 간 상태에서 push하면 앞쪽 기록을 잘라낸다. 경계에서 back/forward는 이동하지 않는다
- 페이지: 실제 영역, 테스트 영역(textarea), Patch / 뒤로 / 앞으로 버튼, patch 로그, 변경 횟수 비교 표시
- 페이지는 src/의 함수만 import한다. 다른 모듈 내부를 고치지 않는다
## 완료 조건
npx vitest run tests/history.test.js 결과 0 failed. 페이지는 수동 확인 체크리스트를 보고에 적는다
```

### Stage 2: 통합 테스트

```
## 역할
너는 통합 테스트 작성자다. 구현 파일은 절대 고치지 않는다.
## 목표
PHASE1_PLAN.md 4장 "통합 테스트의 성질"을 tests/fixtures.js의 모든 HTML 쌍에 대해 검사한다.
## 수정 가능한 파일
tests/integration.test.js
## 요구사항
- 결과 HTML 일치와 MutationObserver 변경 횟수(takeRecords 사용)를 모두 확인한다
- 실패하면 failures[].suspectedModule 에 원인 모듈을 적는다
## 완료 조건
테스트를 작성하고 실행한 결과를 그대로 보고한다. 실패가 있어도 status: fail로 보고하면 완료다
```

### Stage 3: 검증 2종 (sonnet)

```
[엣지 케이스 사냥꾼]
너는 diff/patch를 깨뜨리는 입력을 찾는 테스터다. 구현은 고치지 않는다.
tests/edge.test.js 만 수정한다. 4장 엣지 케이스 목록에 없는 경우를 최소 5개 찾아 테스트로 추가하고,
실패하는 것은 그대로 두고 보고한다. 통과하는 테스트를 실패하게 만들려고 기대값을 억지로 바꾸지 않는다.

[계약 검토자]
너는 코드 검토자다. 어떤 파일도 수정하지 않는다.
src/, tests/, phase1/ 를 읽고 다음을 찾는다: 계약(src/types.js) 위반, 외부 프레임워크 사용,
테스트 삭제·skip·약화, 담당 외 파일 수정 흔적, diff가 DOM API를 쓰는 곳. 각 지적에 파일:줄을 붙인다.
```

### Fix: 수정

```
## 역할
너는 버그 수정자다. tests/ 아래 파일은 절대 고치지 않는다.
## 목표
아래 실패 목록을 원인 모듈에서 고쳐 npx vitest run 을 0 failed로 만든다.
## 입력
<Stage 2·3 보고의 failures 배열을 그대로 붙인다>
## 수정 가능한 파일
src/ 아래 파일 (계약 src/types.js 제외)
## 실패 시
최대 3회. 테스트 자체가 틀렸다고 판단되면 고치지 말고 그 이유를 보고한다
```

---

## 5. 메인 세션에 요청하는 방법

워크플로우는 토큰을 많이 쓰므로 요청할 때 범위를 분명히 한다.

```
워크플로우로 Phase 1 Stage 1~Fix를 실행해줘.
- 프롬프트는 PROMPT_GUIDE.md 4장을 쓴다
- Stage 1은 4개 병렬, Stage 3은 sonnet
- 끝나면 npx vitest run 결과와 각 에이전트의 coreIdea를 모아서 보여줘
```

- Stage 0(계약)은 워크플로우 전에 메인 세션에서 따로 하고 승인한다.
- 일부 함수를 직접 쓰고 싶으면 "diff의 자식 재귀 부분은 TODO로 비워 둬"처럼 프롬프트에 추가한다.

---

## 6. 자주 하는 실수

| 실수 | 결과 | 막는 방법 |
|---|---|---|
| 수정 가능 파일을 안 적음 | 병렬 에이전트끼리 같은 파일을 덮어씀 | 템플릿의 "수정 가능한 파일" 필수 |
| 완료 조건이 "잘 되게" | 에이전트가 테스트 없이 끝냄 | 실행 명령과 기대 결과를 적음 |
| 같은 에이전트에게 테스트와 구현을 다 시킴 | 테스트를 약화해서 통과시킴 | 작성자와 수정자를 분리 |
| 계약을 에이전트가 고치게 둠 | 모듈끼리 형식이 어긋남 | 계약 수정은 blocked로 보고하고 메인이 처리 |
| 보고 형식이 자유 | 다음 단계에서 결과를 못 씀 | JSON 스키마 고정 |
| 반복 횟수 제한 없음 | 같은 실패를 계속 반복하며 비용 증가 | 최대 3회 후 보고 |
