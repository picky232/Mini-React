# Phase 1 기획안: Virtual DOM + Diff + Patch

[CLAUDE.md](CLAUDE.md)의 Phase 1 요구사항을 구현 가능한 수준으로 확정하고, 에이전트 병렬 구현과 테스트 파이프라인을 정의한다.
프롬프트 작성법은 [PROMPT_GUIDE.md](PROMPT_GUIDE.md), 개념 설명은 [CONCEPTS.md](CONCEPTS.md)를 본다.

---

## 1. 요구사항 확정

### 과제 원문 요약

1. 로드하면 실제 영역의 샘플 HTML을 VDOM으로 바꾸고, 그 VDOM으로 테스트 영역을 렌더링한다.
2. 사용자가 테스트 영역의 HTML을 수정한다.
3. Patch를 누르면 테스트 영역으로 새 VDOM을 만들고, 이전 VDOM과 diff해서 **바뀐 부분만** 실제 영역에 반영한다. 새 VDOM은 history에 저장한다.
4. 뒤로/앞으로 가기를 누르면 history의 VDOM으로 이동하고, 두 영역이 함께 바뀐다.

### 애매한 부분과 결정

| # | 애매한 부분 | 결정 |
|---|---|---|
| 1 | 테스트 영역을 "렌더링"하는 방법 | textarea를 쓴다. VDOM을 HTML 문자열로 바꾸는 `vnodeToHTML`로 채운다 |
| 2 | "바뀐 부분만"을 증명하는 방법 | 테스트에서 MutationObserver로 DOM 변경 기록 수를 센다. 페이지에도 숫자를 보여 준다(차별점) |
| 3 | 뒤로/앞으로 가기 반영 | 실제 영역을 다시 그리지 않는다. **현재 VDOM과 목표 VDOM을 diff → patch**한다 |
| 4 | 비교할 루트 | 영역 컨테이너는 고정한다. 컨테이너의 **자식들만** 비교한다. 루트는 `#root` 가상 노드다 |
| 5 | 입력 정규화 | 공백만 있는 텍스트 노드는 버린다. 주석은 무시한다. 속성은 문자열로만 다룬다. Phase 1에서 이벤트는 다루지 않는다 |
| 6 | 변경 없는 Patch | patch 목록이 비면 history에 넣지 않는다 |
| 7 | 뒤로 간 상태에서 Patch | 현재 위치 뒤쪽 기록을 잘라내고 새 기록을 넣는다 |

### 다루지 않는 것 (범위 밖)

- key 기반 재정렬 (차별점 후보 3번, 마무리 단계에서 검토)
- 이벤트 리스너, `value`/`checked` 같은 DOM 프로퍼티 동기화
- `<script>`, `<style>` 내용 해석

---

## 2. 계약 (Stage 0에서 `src/types.js`에 JSDoc으로 고정)

병렬 구현이 가능한 이유는 모듈들이 **서로의 코드가 아니라 이 계약에만 의존**하기 때문이다. 계약을 바꾸려면 모든 에이전트를 멈추고 이 문서부터 고친다.

### VNode

```js
// 엘리먼트
{ type: 'li', props: { class: 'item' }, children: [VNode, ...] }
// 텍스트
{ type: '#text', text: 'hello' }
// 루트 (영역 컨테이너 자체, 비교 대상은 children)
{ type: '#root', props: {}, children: [VNode, ...] }
```

- `type`은 소문자 태그 이름이다.
- `props`는 속성 이름에서 문자열 값으로 가는 평범한 객체다. 속성이 없으면 `{}`다.

### 정규화 규칙 (Stage 3 엣지 케이스에서 발견해 추가)

| # | 규칙 | 지키지 않으면 |
|---|---|---|
| 1 | 엘리먼트와 텍스트만 VNode가 된다. 주석 등은 버린다 | — |
| 2 | HTML 공백 문자(`/^[ \t\n\f\r]*$/`)만 있는 텍스트를 버린다. `trim()`은 쓰지 않는다 | `&nbsp;`만 있는 텍스트가 사라진다 |
| 3 | 이웃한 텍스트 VNode는 하나로 합친다 | `a<!-- -->c`가 텍스트 2개로 남는다. 그러면 아무것도 안 바꾸고 Patch해도 가짜 patch가 생긴다 |
| 4 | props와 diff의 `set`은 `Object.fromEntries`로 만든다 | `__proto__` 속성이 사라진다 |
| 5 | path는 1·2번 규칙으로 남는 노드만 센다. vdom.js와 patch.js가 같은 규칙을 써야 한다 | patch가 엉뚱한 노드를 고친다 |
| 6 | `vnodeToHTML`은 텍스트의 `& < >`와 속성값의 `& "`를 이스케이프한다. void 엘리먼트는 닫는 태그를 쓰지 않는다 | 다시 파싱하면 다른 VNode가 된다 (`</br>`은 `<br>`이 하나 더 생김) |

- patch.js는 이웃 텍스트를 합치지 않는다. 그래서 patch 대상 DOM은 `createElement`로 그린 DOM이어야 한다. 페이지는 로드할 때 실제 영역을 한 번 다시 그려서 이 조건을 맞춘다.
- 속성은 거르지 않는다(`on*`, `javascript:`, `<script>`). 입력이 사용자 자신의 textarea뿐이라 자기 자신을 공격하는 경우(self-XSS)만 가능하다. 외부 입력을 받게 되면 `domToVNode`에서 걸러야 한다.

### Patch

`path`는 `#root`에서 출발하는 자식 인덱스 배열이다. `[]`는 컨테이너, `[1, 0]`은 "두 번째 자식의 첫 번째 자식"이다.

| type | 필드 | 뜻 | DOM API |
|---|---|---|---|
| `CREATE` | `path`(부모), `index`, `node` | 부모의 `index` 위치에 새 노드 삽입 | `insertBefore` / `appendChild` |
| `REMOVE` | `path`(대상) | 노드 삭제 | `removeChild` / `remove` |
| `REPLACE` | `path`(대상), `node` | 다른 노드로 교체 | `replaceWith` |
| `TEXT` | `path`(대상), `text` | 텍스트 변경 | `textContent` / `nodeValue` |
| `PROPS` | `path`(대상), `set`, `remove` | 속성 설정·삭제 | `setAttribute` / `removeAttribute` |

**순서 규칙 (인덱스 밀림 방지):**
- 모든 `path`는 **이전(old) 트리 기준**이다.
- 한 부모에서는 지울 노드가 많거나 추가할 노드가 많거나 둘 중 하나만 생긴다. 둘이 동시에 생기지 않는다.
- diff는 한 부모의 `REMOVE`를 **인덱스 내림차순**으로 내보낸다. patch는 배열 순서대로 적용한다.
- 그래서 patch는 정렬을 신경 쓰지 않아도 된다.
- 내보내는 순서는 **노드 자신의 patch → 겹치는 자식 재귀(오름차순) → 남는 자식 REMOVE(내림차순) 또는 CREATE(오름차순)** 이다. 테스트가 순서까지 비교하므로 고정한다.
- `PROPS`의 `set`에는 새로 생기거나 값이 바뀐 속성만 넣는다. `set`과 `remove`는 비어 있어도 항상 둔다.
- 텍스트의 앞뒤 공백은 자르지 않는다. 공백**만** 있는 텍스트 노드만 버린다.
- 정답 예시는 `tests/fixtures.js`의 `CASES`가 기준이다.

### 모듈과 함수

| 파일 | 함수 | 설명 |
|---|---|---|
| `src/vdom.js` | `domToVNode(node)` | DOM 노드 하나를 VNode로 바꾼다. 무시할 노드면 `null`을 반환한다 |
| | `containerToVNode(el)` | 컨테이너의 자식들로 `#root` VNode를 만든다 |
| | `htmlToVNode(html)` | HTML 문자열로 `#root` VNode를 만든다 (임시 `template` 사용) |
| | `createElement(vnode)` | VNode로 실제 DOM 노드를 만든다 |
| | `vnodeToHTML(vnode)` | VNode를 HTML 문자열로 바꾼다. `#root`면 자식들만 이어 붙인다. 텍스트와 속성값을 이스케이프한다 |
| `src/diff.js` | `diff(oldV, newV)` | Patch 배열을 반환한다. DOM을 쓰지 않는 순수 함수다 |
| `src/patch.js` | `patch(container, patches)` | 컨테이너에 patch를 적용한다. `createElement`만 import한다 |
| `src/history.js` | `createHistory(initial)` | `{ current, push, back, forward, canBack, canForward }`를 제공하는 순수 모듈이다 |
| `phase1/index.html` + `phase1/main.js` | — | 검증 페이지 |

---

## 3. 폴더 구조

```
package.json            # type: module, scripts: test
vitest.config.js        # environment: jsdom
src/
  types.js              # 계약 (JSDoc typedef, Stage 0)
  vdom.js  diff.js  patch.js  history.js
phase1/
  index.html  main.js  style.css
tests/
  fixtures.js           # 공용 HTML 쌍, VNode 정답(oldV/newV), 예상 patch (Stage 0)
  fixtures.test.js      # 픽스처 정답이 실제 HTML 파싱과 같은지 검증 (Stage 0)
  vdom.test.js  diff.test.js  patch.test.js  history.test.js
  integration.test.js   # Stage 2
  edge.test.js          # Stage 3 엣지 케이스 사냥꾼
```

- 버전은 설치할 때 최신 안정판을 확인해서 쓴다. 이 문서에는 고정하지 않는다.
- 페이지는 ES Module을 쓰므로 로컬 서버로 연다 (`npx serve .` → `/phase1/`).

---

## 4. 모듈별 완료 조건

| 모듈 | 반드시 통과할 테스트 | 실행 명령 |
|---|---|---|
| vdom | 공백 텍스트 제거, 주석 무시, 속성 보존, 중첩, `createElement` 왕복(DOM → VNode → DOM이 같음), `vnodeToHTML` 이스케이프 | `npx vitest run tests/vdom.test.js` |
| diff | 5가지 케이스 각각, 변경 없음 → `[]`, 여러 개 삭제 시 내림차순, 텍스트↔엘리먼트는 `REPLACE`, 속성 삭제, 깊은 중첩 경로 | `npx vitest run tests/diff.test.js` |
| patch | 손으로 만든 patch 픽스처로 5가지 타입 각각, 연속 `REMOVE`, 맨 앞 `CREATE`, 빈 배열은 DOM 변화 없음 | `npx vitest run tests/patch.test.js` |
| history | push, back, forward, 경계(처음/끝)에서 이동 안 함, 뒤로 간 뒤 push하면 앞쪽 기록 잘림 | `npx vitest run tests/history.test.js` |
| 통합 | 아래 성질 검사 | `npx vitest run tests/integration.test.js` |
| 전체 | 모두 통과 | `npx vitest run` |

### 통합 테스트의 성질

모든 HTML 쌍 (A, B)에 대해 다음이 성립해야 한다.

```js
container.innerHTML = A
const oldV = containerToVNode(container)
const newV = htmlToVNode(B)
expect(oldV).toEqual(c.oldV)                                                  // vdom 출력이 픽스처 정답과 같다
expect(newV).toEqual(c.newV)
patch(container, diff(oldV, newV))
expect(vnodeToHTML(containerToVNode(container))).toBe(vnodeToHTML(newV))   // 결과가 같다
expect(mutationCount).toBeLessThanOrEqual(expected)                           // 최소한만 바꿨다
```

MutationObserver 기록은 비동기로 전달되므로 테스트에서는 `observer.takeRecords()`로 바로 꺼낸다.

### 엣지 케이스 목록 (`tests/fixtures.js`)

빈 입력 ↔ 내용 있음, 텍스트 ↔ 엘리먼트 교체, 같은 태그 속성만 삭제, 맨 앞에 노드 삽입(인덱스 비교의 한계를 기록), 마지막 세 개 연속 삭제, 3단계 이상 중첩, 특수문자(`<`, `&`, `"`)가 든 텍스트·속성, 형제 사이 공백만 다른 경우

---

## 5. 오케스트레이션 파이프라인

에이전트는 총 8개다. 이 세션 권장 규모(10개 미만) 안에 든다.

```
Stage 0  계약 확정 ─ 메인 세션(순차) ─ 사람 승인
   │  src/types.js, package.json, vitest.config.js, tests/fixtures.js, 빈 모듈 파일
   │  + vdom.js의 createElement만 먼저 구현 (patch가 vdom 구현을 기다리지 않게)
   ▼
Stage 1  병렬 구현 ─ 에이전트 4개
   │  A vdom    B diff    C patch    D history + phase1 페이지
   │  각자: 구현 → 자기 테스트 실행 → 실패 시 최대 3회 수정 → 보고
   ▼
Stage 2  통합 테스트 ─ 에이전트 1개
   │  integration.test.js 작성·실행. 실패는 원인 모듈과 함께 보고하고 구현은 고치지 않는다
   ▼
Stage 3  검증 ─ 에이전트 2개 병렬 (sonnet)
   │  엣지 케이스 사냥꾼: 실패하는 테스트만 추가한다
   │  계약 검토자: 계약 위반, 외부 프레임워크, 테스트 약화, 담당 외 파일 수정을 찾는다
   ▼
Fix      수정 ─ 에이전트 1개
   │  Stage 2·3에서 나온 실패를 원인 모듈에서 고친다. 테스트는 고치지 않는다
   ▼
Stage 4  마무리 ─ 메인 세션
      npx vitest run 결과 보고 + 모듈별 핵심 원리·체크포인트 정리
```

### 단계별 규칙

| 규칙 | 이유 |
|---|---|
| 에이전트마다 **수정 가능한 파일을 명시**한다 | 병렬 작업 중 서로 덮어쓰지 않게 하기 위해 |
| patch 테스트는 diff를 쓰지 않는다 | B와 C가 서로를 기다리지 않게 하기 위해 |
| 테스트를 쓰는 에이전트와 구현을 고치는 에이전트를 나눈다 | 테스트를 통과시키려고 테스트를 약화하는 것을 막기 위해 |
| Stage 1의 수정은 최대 3회, 그래도 실패하면 원인을 보고하고 멈춘다 | 무한 반복과 비용 폭주를 막기 위해 |
| 모든 에이전트는 정해진 JSON 형식으로 보고한다 | 다음 단계가 결과를 기계적으로 받기 위해 |
| Stage 0과 Stage 4는 메인 세션이 한다 | 계약과 최종 판정은 사람이 확인하는 지점이기 때문에 |

### 학습 장치

- 모든 구현 에이전트는 보고에 **핵심 원리 3줄**과 **예측 질문 1개**를 넣는다. 예: "이 두 VNode를 diff하면 patch가 몇 개 나올까?"
- Stage 4 뒤에 체크포인트를 통과해야 Phase 2로 넘어간다.
- 직접 써 보고 싶은 부분(예: diff의 자식 재귀)은 Stage 1에서 그 함수만 빈칸으로 두게 지시할 수 있다.

---

## 6. 검증 페이지 동작 (`phase1/main.js`)

| 동작 | 처리 |
|---|---|
| 로드 | `v0 = containerToVNode(실제영역)` → `textarea.value = vnodeToHTML(v0)` → `history = createHistory(v0)` |
| Patch | `newV = htmlToVNode(textarea.value)` → `ps = diff(history.current(), newV)` → `ps`가 비면 종료 → `patch(실제영역, ps)` → `history.push(newV)` |
| 뒤로/앞으로 | `target = history.back()`(또는 `forward()`) → `patch(실제영역, diff(이전 current, target))` → `textarea.value = vnodeToHTML(target)` |
| 버튼 상태 | `canBack()`, `canForward()`로 비활성화 |
| 차별점 표시 | 마지막 patch 목록과 MutationObserver 변경 횟수, 같은 변경을 `innerHTML`로 했을 때의 횟수를 나란히 보여 준다 |

---

## 7. 체크포인트 (SCHEDULE.md와 동일 + 추가)

- [ ] 5가지 케이스가 각각 어떤 patch가 되는지 설명할 수 있다
- [ ] 각 patch가 어떤 DOM API로 반영되는지 설명할 수 있다
- [ ] 실제 DOM 조작이 왜 느린지 Reflow/Repaint로 설명할 수 있다
- [ ] REMOVE를 왜 내림차순으로 내보내는지 그림으로 설명할 수 있다
- [ ] 맨 앞에 노드를 끼우면 왜 patch가 많이 나오는지, key가 이걸 어떻게 푸는지 설명할 수 있다
- [ ] 뒤로 가기를 다시 그리기가 아니라 diff로 처리한 이유를 설명할 수 있다
