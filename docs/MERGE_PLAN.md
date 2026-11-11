# sohee-phase2 · jiho-phase2 평가와 병합 계획

[EVALUATION.md](EVALUATION.md)의 기준으로 두 브랜치를 평가하고, 그 결과를 바탕으로 하나로 합치는 계획을 세운다.

- 평가 대상: `origin/sohee-phase2` (`6eb43dd`), `jiho-phase2` (`9f0c5c7`)
- 평가일: 2026-11-10. 같은 날 검증 에이전트로 사실을 다시 확인하고 고쳤다. 고친 내용은 9장에 있다.
- 점수 표기: 0 없음 / 1 부분 충족 / 2 충족 / 3 모범

## 0. 결정 결과 (팀 합의)

평가 뒤 팀이 8장의 결정을 이렇게 내렸고, `team-merge` 브랜치에 반영했다. 그래서 아래 5·6장의 추천(경로 A)과 실제 진행(경로 B)이 다르다.

| # | 결정 | 반영 |
|---|------|------|
| D1 | **경로 B**: sohee 계약을 뼈대로 삼는다 | jiho의 key·LIS·MOVE, 보안 규칙, Patch 로그, Hooks 인스펙터를 sohee 계약 위에 다시 구현했다. 이유는 README "두 구현을 합친 방식" |
| D2 | 자식 hook을 **막는다** | `child()` 실행 중 hook 호출은 오류. 자식 state를 시도했던 과정은 README 트러블슈팅에 남겼다 |
| D3 | 위험 입력은 **거부**하고 이유를 보여 준다. Phase별로 나누지 않고 엔진 전체에서 막는다 | `src/core/security.js` 하나를 `h`·`createDOM`·`PROPS`가 공유한다. 그래서 jiho의 "script 왕복" 테스트는 옮기지 않았다 |
| D4 | `team-merge` 브랜치에서 합치고 `dev`로 PR | jiho-phase2를 merge해 두 커밋 기록을 모두 남겼다 |
| D5 | 줄바꿈 공백 텍스트는 버리고, 띄어쓰기만 있는 텍스트는 남기고, `pre`·`textarea` 안은 그대로 둔다. 주석은 버린다 | `src/dom/from-dom.js`의 `isIgnored`, `normalizeDOM` |

> 평가 이후 `sohee-phase2`에 커밋 3개(`ac4572d` useMemo, `3fbaa35` 할 일 데모, `d942b99` 명시적 batch)가 더해졌다. 아래 점수는 평가 시점(`6eb43dd`) 기준이므로, sohee의 hooks 정확성·테스트와 데모 점수는 지금 코드에서는 더 높다. `team-merge`는 이 최신 커밋을 바탕으로 만들었다.
>
> 테스트는 jiho의 282개 시나리오를 옮기지 않고, sohee 테스트를 유지하면서 병합으로 더한 기능만 `tests/integration/team-merge.test.js`로 최소 검증했다(팀 결정). jiho 테스트는 `jiho-phase2` 브랜치에 남아 있다.

## 1. 평가 방법

각 브랜치를 별도 worktree에 체크아웃했다. 그다음 `npm ci`, `npx vitest run`을 실행하고 엔진 코드를 읽었다. 두 엔진에 같은 시나리오를 넣는 임시 테스트도 돌렸고, 결과를 얻은 뒤 지웠다. 근거는 세 가지로 표시한다.

- **[실행]** 테스트나 시나리오를 실제로 돌려서 확인했다
- **[코드]** 코드를 읽고 판단했다
- **[미검증]** 브라우저, Performance 탭, Heap snapshot, 질의응답이 필요해 이번에는 확인하지 못했다. 점수는 코드로 추정한 값이다

### 실행 결과

| 항목 | sohee | jiho |
|------|-------|------|
| `npx vitest run` | 파일 18개, 테스트 194개 통과 | 파일 14개, 테스트 282개 통과 |
| 타입 검사 | `tsc --project jsconfig.json` 통과 | 스크립트 없음 |
| `<ul>` 5개 항목의 맨 앞에 1개 추가 | 6건 (TEXT 5, INSERT 1) | key 없음: 6건 / key 있음: **CREATE 1건** |
| 5개 항목 순서 뒤집기 | 4건 (TEXT 4) | key 없음: TEXT 4건 / key 있음: MOVE 4건 |
| 핸들러 하나에서 setState 2번 | **렌더 2번** | **렌더 1번** (microtask batching) |
| 같은 값으로 setState | 렌더 1번 | 렌더 안 함 (`Object.is` 비교) |
| unmount 중 첫 cleanup이 throw | 나머지 cleanup도 실행하고 DOM을 비운 뒤 오류를 전달 | **나머지 cleanup, DOM 비우기, 위임 리스너 해제가 모두 멈춤.** 다시 unmount하면 cleanup이 또 실행된다 |
| effect가 매번 setState | 51번째 렌더에서 `Too many consecutive effect updates.` 오류로 멈춤 | **300번까지 멈추지 않음** (상한 없음) |
| DOM → VNode: `<img onerror>` | TypeError로 거부 | VNode에 담기고 `setAttribute`까지 된다 |
| DOM → VNode: `<a href="javascript:">` | 통과 (HTML 코드 편집 경로 `readSource`에서만 막음) | 통과 (Phase 2 `h()`에서만 막음) |
| DOM → VNode: `<script>` | contenteditable 경로에서 통과 (HTML 코드 편집 경로에서만 막음) | 통과. `createElement`로 만든 script는 브라우저에서 실행된다 **[코드]** |

> 테스트 수(282 대 194)를 그대로 비교하지 않는다. 범위가 다르기 때문이다. jiho는 `vdom.test.js` 한 파일에 83개가 몰려 있고, sohee는 useMemo 테스트가 0개다. 아래 7번 기준에서 모듈별로 비교한다.

## 2. 두 구현은 계약이 다르다

합치는 방법을 정하는 가장 큰 사실이다. EVALUATION.md의 "모듈별로 골라 붙이기"는 두 구현이 같은 VNode와 patch 형식을 써야 성립한다. 이 두 브랜치는 거의 모든 축에서 형식이 다르다.

| 축 | sohee (`src/core/contracts.js`) | jiho (`src/types.js`) |
|----|------|------|
| 엘리먼트 VNode | `{ kind:'element', tag, props:{ attrs, events }, children }` | `{ type, props, children, key?, events? }` |
| 텍스트 VNode | `{ kind:'text', value }` | `{ type:'#text', text }` |
| 루트 | 컨테이너 안의 단일 루트 노드 (`Tree = VNode \| null`) | 자식 여러 개를 담는 `#root` |
| 추가 patch | `INSERT` (path = 새 노드 위치) | `CREATE` (path = 부모, `index` 별도) |
| 속성 patch | `PROPS { setAttrs, removeAttrs, setEvents, removeEvents }` | `PROPS { set, remove }` |
| 순서 이동 | 없음 (key 없음) | `MOVE { from, to }` (key + LIS) |
| 이벤트 | VNode에 담고 diff·patch로 붙였다 뗀다 (WeakMap) | diff 밖에서 처리. 컨테이너에 위임하고, 이벤트가 오면 현재 VNode를 찾는다. 위임하는 이벤트는 click·input·change·submit·keydown 5종뿐이라 다른 `onX`는 조용히 동작하지 않는다 |
| 공백만 있는 텍스트 | 보존 | 버림 (`/^[ \t\n\f\r]*$/`) |
| 주석 노드 | TypeError로 거부 | 버리고, 양옆 텍스트를 합침 |
| `h` 시그니처 | `h(tag, { attrs, events }, [children])` | `h(type, props, ...children)` (함수 컴포넌트, `onClick`, `key` 지원) |

**[실행]** jiho diff의 결과를 sohee `applyPatches`에 넣으면 실패한다. CREATE는 `Unknown patch type`으로 실패하고, `#root` 기준 path는 `Expected an HTML element`로 실패한다. 그래서 "diff는 jiho 것, patch는 sohee 것"처럼 섞으려면 어댑터를 두거나 한쪽을 다시 써야 한다. 이 계획은 다음 원칙을 따른다.

1. **뼈대를 계약 단위로 하나 고른다.** VNode 형식, patch 형식, 공백 규칙을 함께 정한다.
2. **반대쪽 장점은 코드를 복사하지 않는다.** 뼈대의 계약 위에서 다시 구현하고, 장점마다 비용을 적는다.
3. **반대쪽 테스트는 그대로 가져올 수 없다.** `h` 시그니처가 달라서 시나리오만 옮기고, 테스트는 뼈대 형식으로 다시 쓴다.

## 3. 기준별 점수

### 3-1. 프로젝트 전체 기준 (1~5, 9)

| # | 기준 | sohee | jiho | 근거 |
|---|------|:-----:|:----:|------|
| 1 | 렌더링 성능 | 2 | 3 | **[실행]** 두 엔진 모두 바뀐 노드만 patch한다. 핵심 점검 항목은 둘 다 충족한다. jiho는 여기에 더해 key + LIS로 맨 앞 추가를 1건에 처리하고, 같은 참조면 diff를 건너뛰며(memo와 함께 쓴다), batching으로 렌더를 1번만 한다. sohee는 key가 없고(`diff.js:27` 한계 1), setState마다 렌더한다. 같은 참조 건너뛰기는 있다(`diff.js:43`). **[미검증]** 소요 시간, Reflow 횟수. 그래서 jiho의 3점은 측정 없이 매긴 점수다 |
| 2 | 사용성 | 2 | 2 | **[코드]** 둘 다 이력 끝에서 뒤로·앞으로 버튼을 비활성화한다. sohee에는 contenteditable 편집, HTML 코드 보기 스위치, 오류 상태 메시지(`main.js:94`), aria 속성이 있다. jiho에는 textarea 편집기, patch 로그, "patch 대 innerHTML" 변경 수 비교, 기록 n/m 표시, 다크 모드가 있다. 다만 잘못된 입력에 대한 피드백은 없다. **[미검증]** 브라우저에서의 반응 |
| 3 | 메모리·자원 관리 | 2 | 1 | **[실행]** 둘 다 effect를 다시 실행하기 전과 unmount할 때 cleanup을 부른다. sohee는 cleanup 하나가 실패해도 나머지를 실행하고 DOM을 비운다. effect가 갱신을 계속 예약하면 50번에서 멈춘다. jiho는 빠진 자식 컴포넌트의 cleanup도 부르지만, cleanup 하나가 throw하면 나머지 cleanup, DOM 비우기, 리스너 해제가 모두 멈춘다. effect가 계속 갱신을 예약해도 멈추지 않는다. history 크기 제한은 둘 다 없다. **[미검증]** Heap snapshot |
| 4 | 보안성 | 2 | 1 | **[실행]** 이 기준이 필요한 이유는 "테스트 영역이 사용자 HTML을 그대로 렌더링"하기 때문이고, 그래서 Phase 1 경로를 기준으로 매겼다. sohee는 `h()`가 모든 경로에서 `on*` 속성을 거부한다. 하지만 contenteditable 경로로는 `<script>`와 `javascript:`가 통과한다. HTML 코드 편집 경로에서는 둘 다 막는다. jiho의 Phase 1 경로는 `on*`, `javascript:`, `<script>`를 하나도 막지 않는다(`vdom.js:65`에 self-XSS로 알고 남겨 둔 주석이 있다). 반면 jiho Phase 2의 `h()`는 모범 수준이다. 문자열 `on*`, 제어문자가 섞인 `javascript:`, script를 막고, WeakSet으로 VNode 위조를 막으며, 테스트가 18개 있다. **[미검증]** 실제 브라우저에서 실행되는지 (jsdom은 인라인 핸들러와 script를 실행하지 않음) |
| 5 | 차별성 | 2 | 3 | **[코드]** sohee: HTML 코드 보기 전환, 실패 시 마지막 성공 화면으로 복구, effect 갱신 큐와 상한, JSDoc + `tsc` 타입 검사, 계약 문서. jiho: key + LIS 재조정, memo, batching, Hooks 인스펙터, MutationObserver로 patch와 innerHTML 비교, patch 로그, `h()` 보안, 개념 문서(CONCEPTS.md) |
| 9 | 설명 가능성·문서 | 1 | 2 | **[코드]** sohee README는 과제 설명이고, Reflow·MutationObserver·React와의 차이 같은 필수 설명 항목이 없다. 대신 `docs/architecture.md`에 설계 계약과 대안을 잘 정리했다. jiho README는 필수 항목을 모두 다루고 CONCEPTS.md도 있다. 하지만 존재하지 않는 `docs/PHASE1_PLAN.md`를 4곳에서 참조한다(`src/types.js:1`, `tests/edge.test.js:1`, `tests/integration.test.js:28`, `docs/SCHEDULE.md:19`). **[미검증]** 작성자 질의응답 |

### 3-2. 모듈별 기준 (6 정확성, 7 테스트, 8 구조)

칸은 `sohee / jiho` 순서다.

| 모듈 | 6 정확성 | 7 테스트 | 8 구조 | 근거 |
|------|:---:|:---:|:---:|------|
| VDOM 변환 | 2 / 3 | 2 / 3 | 3 / 2 | sohee는 네임스페이스와 태그를 엄격하게 검사하지만, 주석이 섞인 HTML은 아예 변환하지 못한다. jiho는 공백, `&nbsp;`, 이웃 텍스트 합치기, HTML 왕복을 처리한다. 테스트는 sohee 52개(vnode·from-dom·round-trip), jiho 98개(vdom·fixtures)다. 구조 면에서 sohee는 vnode와 from-dom을 나누었고 타입 검사도 한다. jiho의 `vdom.js`는 변환, 생성, 직렬화를 한 파일에 담았다 |
| diff | 3 / 3 | 3 / 3 | 3 / 3 | 5가지 케이스와 자식 재귀 모두 둘 다 맞다. key·MOVE·LIS는 속도에 관한 것이라 기준 1에서만 반영했다. 테스트는 sohee 37개, jiho 33개(diff·keyed)이고, 별도로 edge 16개가 있다. 둘 다 DOM을 건드리지 않는 순수 함수이고, 순서 규칙을 문서로 남겼다 |
| patch | 3 / 2 | 3 / 2 | 3 / 2 | sohee는 patch를 하나씩 적용하기 **직전에** path, 노드 종류, 값을 검사한다. 루트 교체와 빈 컨테이너도 처리한다. 다만 중간에 실패하면 이미 바꾼 DOM은 남는다(`patch.js:180`). 복구는 호출하는 쪽이 맡는다(`main.js` `recover`, 컴포넌트 `replaceDOMTree`). jiho는 검사가 없다. 주석으로 갈라진 텍스트는 path가 어긋난다는 한계를 `patch.js:6`에 적어 두었다. 대신 input의 `value`·`checked` 프로퍼티도 맞춘다. 테스트는 sohee 44개(patch·render), jiho 25개다. 구조 면에서 sohee는 events, render, patch를 나누었다. jiho는 component.js가 `kids`를 가져다 써서 두 모듈이 묶여 있다 |
| hooks | **1** / 2 | **1** / 3 | 3 / 2 | sohee에는 **useMemo가 구현에도 테스트에도 없다**(PLAN.md Stage 4 미완료). **두 엔진 모두 "hook은 루트에서만" 제약을 강제하지 않는다 [실행].** sohee는 자식 함수가 useState를 부르면 그 슬롯이 루트의 hooks 배열에 섞여 들어간다. jiho는 자식마다 인스턴스를 만들어 자식 상태를 정식으로 지원한다. 데모(App.js)는 루트에서만 hook을 쓴다. 엔진 테스트는 sohee 22개(useMemo 0개), jiho 42개(component·instance)다. 구조 면에서 sohee는 파일 하나(341줄, 클래스는 147~341행)로 단순하다. jiho의 `component.js`(523줄)는 `h`, 인스턴스, hook, 이벤트 위임이 한 파일에 섞여 있다 |
| 검증 페이지 | 3 / 2 | 3 / **1** | 3 / 2 | 두 구현 모두 Phase 1 흐름(로드, 편집, Patch, 뒤로·앞으로)을 구현했다. sohee는 실패하면 복구하고, 루트가 여러 개인 초안, 변경 없는 Patch, 미래 이력 분기를 처리한다. 이 동작은 `startDemo`를 직접 조작하는 테스트 15개로 확인했다. jiho의 테스트 33개(editor·integration·log)는 순수 함수와 엔진 조합만 검사하고, `phase1/main.js`의 버튼 연결은 테스트하지 않는다. 그래서 jiho의 정확성 점수는 코드만 보고 매겼다. 구조 면에서 sohee의 `startDemo(elements)`는 요소를 주입받고 해제 함수를 돌려준다. jiho의 `phase1/main.js`는 모듈 최상위에서 바로 실행된다. **[미검증]** 실제 브라우저 E2E는 둘 다 없다 |
| 데모 | 0 / 1 | 0 / 1 | - / 2 | 최종 데모는 둘 다 없다. jiho에는 Phase 2 확인용 임시 할 일 앱과 테스트 10개(`phase2.test.js`)가 있고, sohee에는 Phase 2 페이지가 없다. 이 모듈은 둘 중에서 고르지 않고 새로 만든다(6장 6단계) |

## 4. 고르는 순서를 문자 그대로 적용한 결과

EVALUATION.md의 순서를 그대로 따르면 이렇게 된다. 먼저 정확성과 테스트가 2점 이상인 후보만 남기고, 그중 구조 점수가 높은 쪽을 고른 뒤, 나머지 장점은 옮겨 붙인다.

| 모듈 | 관문 통과 | 뼈대 |
|------|-----------|------|
| VDOM 변환 | 둘 다 | sohee (구조 3 > 2) |
| diff | 둘 다 | 구조 동점(3 = 3). 성능으로 가르면 jiho (key) |
| patch | 둘 다 | sohee (구조 3 > 2) |
| hooks | **jiho만** (sohee는 정확성 1, 테스트 1) | jiho |
| 검증 페이지 | **sohee만** (jiho는 테스트 1) | sohee |
| 데모 | 둘 다 탈락 | 새로 만든다 |

결과는 "VDOM·patch·페이지는 sohee, diff·hooks는 jiho"로 갈린다. 그런데 2장에서 확인했듯이 이 조합은 실제로 붙지 않는다. jiho의 hooks도 `#root`, `kids()`, 이벤트 위임에 기대고 있다. 그래서 뼈대를 하나로 고르는 두 경로를 비교한다.

## 5. 경로 비교와 추천

### 경로 A: jiho 계약을 뼈대로 삼고 sohee 장점을 다시 구현한다

| sohee에서 옮길 것 | 다시 구현할 곳 | 비용 |
|-------------------|----------------|------|
| patch마다 적용 직전에 검사하고, 실패하면 마지막 성공 트리로 복구 (페이지, 컴포넌트 commit) | `src/patch.js`, `phase1/main.js`, `FunctionComponent.flush` | 중간 |
| cleanup·effect 오류를 모아서 전달하고 나머지는 계속 실행. unmount는 오류가 나도 끝까지 정리 | `runEffects`, `cleanupHooks`, `unmount` | 작음 |
| effect 무한 갱신 상한 (연속 N번을 넘으면 멈춤) | `scheduleUpdate`/`flush` | 작음 |
| 렌더 중 setState 금지, 버려진 hook의 setState 금지, 렌더가 실패하면 상태 되돌리기 | `useState`, `renderInstance` | 작음 |
| Phase 1 입력 차단 (`on*`, `javascript:`, script·iframe 등). jiho `h()`의 규칙을 공용 모듈로 빼서 함께 쓴다 | 페이지 입력 계층 또는 `domToVNode` (결정 D3) | 작음 |
| HTML 코드 보기 전환, 오류 상태 메시지 | `phase1/` | 중간 |
| `startDemo(elements)` 주입 구조와 페이지 테스트, JSDoc + `tsc` 검사 | `phase1/main.js`, `package.json` | 중간 |
| 설계 계약 문서 (`architecture.md`) | `docs/` | 작음 |

테스트는 jiho의 282개를 회귀 안전망으로 쓴다. 다만 `tests/vdom.test.js:99`와 `:153`은 `<script>`가 `htmlToVNode`를 거쳐 그대로 왕복된다고 단언한다. 그래서 `domToVNode`에서 script를 막으면 이 두 테스트가 깨진다. 막는 위치를 페이지 입력 계층으로 두면 테스트를 바꿀 필요가 없다(결정 D3). sohee 쪽에서는 시나리오만 jiho 형식으로 다시 쓴다. 대상은 demo 15개 중 복구·여러 루트·변경 없음·미래 이력 분기, cleanup 오류, effect 상한 시나리오다.

### 경로 B: sohee 계약을 뼈대로 삼고 jiho 장점을 다시 구현한다

| jiho에서 옮길 것 | 비용 |
|------------------|------|
| useMemo (과제 필수) | 작음 |
| VNode 계약에 key 추가, `MOVE` patch, LIS | **큼** (계약, diff, patch, 테스트가 모두 바뀜) |
| microtask batching, 같은 값이면 렌더하지 않기 | 중간 |
| memo (같은 참조 건너뛰기는 `diff.js:43`에 이미 있으니, props 비교와 이전 출력 재사용만 추가) | 작음~중간 |
| `h()`가 함수 컴포넌트, `onClick`, `key`를 받게 하기 (루트 전용 제약을 따르면 자식은 `fn(props)`로 부르기만 하면 됨) | 작음~중간 |
| `h()` 보안 강화 (제어문자가 섞인 `javascript:`, VNode 위조 차단) | 작음 |
| Hooks 인스펙터, patch 로그, MutationObserver 비교 | 중간 |
| README 필수 설명 항목, CONCEPTS.md | 작음 |

테스트는 sohee의 194개를 그대로 쓴다. jiho 테스트 중 keyed(14개), security(18개), component(29개) 시나리오는 `h` 시그니처가 달라 다시 써야 한다. 루트 전용 제약을 따르기로 하면 instance(13개)는 필요 없다.

### 추천: 경로 A. 다만 차이가 크지 않으니 팀이 정한다 (D1)

- hooks 관문을 통과한 구현은 jiho뿐이다. 그리고 옮기기 가장 비싼 기능인 key 재조정은 계약 자체를 바꿔야 한다. 경로 A는 이 둘을 그대로 둔다.
- sohee의 장점(직전 검사, 복구, 오류 모으기, 상한)은 대부분 기존 함수에 덧붙이는 계층이라 계약을 바꾸지 않아도 된다.
- 경로 B가 더 나은 점도 있다. sohee 계약은 이미 루트 전용 제약에 맞는 단순한 구조이고, 구조 점수도 높다. 루트 전용 제약을 엄격하게 따르기로 하면(D2), jiho의 자식 인스턴스 기능은 오히려 걷어내야 할 대상이 된다. 이 경우 경로 B의 비용은 key·MOVE와 batching 정도로 줄어든다.
- 경로 A를 택해도 sohee가 앞선 구조 점수(계층 분리, 타입 검사)는 7단계에서 폴더를 나눠 반영한다.

> 이 문서는 jiho 브랜치에서 작성했다. 검증에서 jiho에 유리한 점수 몇 개를 바로잡았지만(9장), 팀 검토에서 점수와 근거를 함께 확인하는 것이 좋다.

## 6. 병합 단계 (경로 A 기준)

각 단계는 같은 순서로 진행한다. 테스트를 먼저 쓰고 실패를 확인한 뒤 구현하고, `npm test`가 모두 통과하면 끝난다.

| 단계 | 작업 | 끝났다는 기준 |
|------|------|---------------|
| 0 | 작업 브랜치를 만들고 기준선을 기록한다 (결정 D4) | jiho 282개 통과 상태 기록 |
| 1 | **보안**: Phase 1 입력 경로를 막는다. 막는 위치와 방식은 D3을 따른다. jiho `h()`의 `on*`·`JS_URL`·script 규칙은 공용 모듈로 뺀다 | `<img onerror>`, `javascript:` href, `<script>`를 막는 Phase 1 테스트 통과. 기존 테스트는 지우거나 약화하지 않는다 |
| 2 | **patch 견고성**: patch를 적용하기 직전에 검사하고, 페이지와 컴포넌트는 실패하면 마지막 성공 트리로 복구한다 | sohee demo 시나리오(중간 실패 복구, Undo 실패 복구)를 옮긴 테스트 통과 |
| 3 | **hooks 견고성**: 오류를 모아서 전달하고, unmount를 끝까지 정리하고, effect 상한을 두고, 렌더 중 setState를 금지하고, 렌더 실패 시 롤백한다 | cleanup 하나가 throw해도 나머지 cleanup, DOM 비우기, 리스너 해제가 실행됨. 무한 갱신은 N번에서 멈춤 |
| 4 | **루트 전용 제약** (D2): 자식 컴포넌트가 hook을 부르면 에러를 낸다. 또는 이 편차를 README에 적는다 | 결정한 대로 테스트 또는 문서가 있음 |
| 5 | **검증 페이지**: HTML 코드 보기 전환과 오류 상태 메시지를 넣고, `startDemo(elements)` 형태로 바꾼 뒤 버튼 연결 테스트를 추가한다 | 페이지 조작 테스트 통과, 브라우저에서 확인 |
| 6 | **최종 데모**: 할 일 앱이 아닌 새 주제로 만든다 (별도 작업) | 입력·클릭에 따른 부분 업데이트, 기능 테스트 |
| 7 | **구조**: `src/core`·`src/dom`·`src/component`로 나눈다. `vdom.js`의 생성 함수는 dom으로, 이벤트 위임은 component에서 분리한다. JSDoc + `tsc` 검사를 추가한다 | `npm test`, `npm run typecheck` 통과 |
| 8 | **문서**: README에 병합 결과를 반영한다. sohee의 `architecture.md`를 jiho 계약 기준으로 다시 쓴다. `PHASE1_PLAN.md` 참조 4곳을 고친다 | README 필수 항목 완료, 계약 문서 작성, 깨진 참조 0개 |
| 9 | **검증**: 검증 에이전트 → 수정 → 리뷰 → 커밋. 브라우저 E2E와 미검증 항목도 확인한다 | 7장 목록이 비거나, 남은 이유가 기록됨 |

## 7. 아직 확인하지 못한 것

| 항목 | 기준 | 확인 방법 |
|------|------|-----------|
| 두 페이지의 실제 반응과 사용감 | 2 | 브라우저에서 직접 조작 |
| 소요 시간과 Reflow 횟수 | 1 | Performance 탭에서 같은 조작으로 비교 |
| 이전 VDOM 참조가 남는지 | 3 | Heap snapshot |
| Phase 1에서 `<img onerror>`·`<script>`가 실제로 실행되는지 (두 엔진 모두) | 4 | 실제 브라우저 (jsdom은 실행하지 않음) |
| 작성자가 hooks 배열과 인덱스 원리를 설명할 수 있는지 | 9 | 질의응답 |

## 8. 정해야 할 것

| # | 결정 | 선택지 | 추천 |
|---|------|--------|------|
| D1 | 뼈대 경로 | A (jiho 계약) / B (sohee 계약) | A. 차이가 크지 않아 D2에 따라 B도 현실적이다 (5장) |
| D2 | 두 엔진 모두 자식 hook을 막지 않는다 | 막는다 (과제 제약대로) / jiho 방식으로 정식 지원하고 README에 차이를 적는다 | 팀이 정한다. 막는 쪽은 4단계의 작은 수정으로 끝난다 |
| D3 | 위험한 입력을 막는 위치와 방식 | 페이지 입력 계층에서 거부 / `domToVNode`에서 거부 / 조용히 제거 | Phase 1은 페이지 입력 계층에서 거부한다. 사용자가 이유를 알 수 있고, `vdom.test.js`의 script 왕복 테스트도 유지된다. Phase 2 `h()`는 지금처럼 제거한다 |
| D4 | 병합 작업 브랜치 | `jiho-phase2`에서 새 브랜치 / `dev` / 기타 | 팀이 정한다 |
| D5 | 공백 텍스트 규칙 | 버림 (jiho) / 보존 (sohee) | 경로 A라면 버림. contenteditable을 들일 경우 이 규칙에 맞춰야 한다 |

## 9. 검증에서 고친 것

검증 에이전트가 두 브랜치를 새로 체크아웃해 문서의 주장을 다시 실행해 보고 찾은 문제다.

| 바뀐 곳 | 처음 쓴 내용 | 고친 내용 |
|---------|--------------|-----------|
| sohee patch | "DOM을 바꾸기 전에 전체 검사" | patch마다 적용 **직전**에 검사한다. 중간에 실패하면 이미 바꾼 DOM은 남고, 복구는 호출하는 쪽이 한다 (실행 확인) |
| hooks 제약 | "sohee는 루트 전용 제약을 지킨다" | 두 엔진 모두 강제하지 않는다. sohee는 자식의 hook이 루트 슬롯에 섞인다 (실행 확인). D2를 두 엔진 모두에 해당하는 결정으로 바꿨다 |
| 경로 A 테스트 | "282개를 그대로 쓴다" | `vdom.test.js:99`, `:153`이 script 왕복을 단언하므로 차단 위치를 정해야 한다 (D3) |
| 점수 | diff 정확성 2/3, 페이지 테스트 jiho 2, 기준 3 2/2, 기준 1 sohee 1, 기준 4 2/2, 데모 테스트 jiho 2, hooks 테스트 sohee 2 | diff 정확성 3/3(key는 성능 기준에서만 반영), 페이지 테스트 jiho 1(버튼 연결 미검증), 기준 3 2/1, 기준 1 2/3, 기준 4 2/1, 데모 테스트 jiho 1(hooks 수에서 데모 테스트 10개를 뺌), hooks 테스트 sohee 1(useMemo 0개) |
| 관문 결과 | 검증 페이지는 둘 다 통과 | sohee만 통과. 뼈대는 그대로 sohee |
| 경로 B 비용 | memo 중간, `h(fn)` 큼 | `diff.js:43`에 같은 참조 건너뛰기가 이미 있다. 루트 전용 제약을 따르면 `h(fn)`은 작음~중간이고, instance 테스트는 필요 없다. 추천은 A로 두되, 차이가 크지 않다고 명시했다 |
| jiho unmount | "cleanup 나머지가 실행되지 않음" | DOM 비우기와 리스너 해제도 멈추고, 다시 unmount하면 cleanup이 또 실행된다 |
| jiho effect 무한 갱신 | [미검증] | [실행] 300번 연속 갱신해도 멈추지 않는다. 7장에서는 뺐다 |
| Phase 1 `<script>` | 언급 없음 | 두 엔진 모두 contenteditable 또는 textarea 경로에서 통과한다고 추가했다 |
| 깨진 참조 | `types.js:1` 한 곳 | 4곳 |
| 사소한 것 | "클래스 341줄" | 파일이 341줄이고 클래스는 147~341행. jiho 위임 이벤트가 5종으로 한정된다는 점도 추가 |
