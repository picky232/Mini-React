# 구현 계획

현재: **Stage 3 — Patch와 엔진 통합 구현·검증 완료**. 다음 단계는 사용자가 요청할 때 진행한다.

각 단계의 시간은 **이론 30% → AI 코딩 40% → 생성 코드 분석 30%**로 배분한다. 체크 표시는 해당 완료 조건과 검증을 만족했을 때만 갱신한다.

## Stage 0 — 설계 및 초기화

- [x] 기존 README·저장소 상태 확인
- [x] 최소 모듈 구조, 데이터 계약, 함수 인터페이스·의존성 정의
- [x] Vitest/Node/jsdom 환경과 JavaScript JSDoc 타입 검사 구성
- [x] AGENTS.md와 이후 단계 계획 작성
- [x] npm run check로 정적 계약·환경 확인 (JSDoc 검사 통과, 환경 확인 테스트 2파일·3개 통과)

Stage 0에서는 설계·초기화와 테스트 환경 확인을 수행했다.

## Stage 1 — VNode 생성과 DOM 왕복

**범위:** core/vnode.js, dom/from-dom.js, dom/render.js 및 대응 단위·통합 테스트.

- [x] `h`, `createTextVNode`, `domToVNode`, `createDOM` 구현
- [x] 단위: 문자열·숫자 정규화, null/boolean 생략, 속성·이벤트, 입력 소유권, 미지원 입력의 명시적 거절
- [x] 통합: DOM → VNode → DOM → VNode 결과 동등성. 공백·빈 텍스트·중첩·빈 요소 보존
- [x] `createDOM`이 새 노드를 만들고 원본 DOM을 변경하지 않는지 확인

이론: DOM childNodes와 children의 차이, HTML 속성과 DOM property의 차이, VNode가 필요한 이유.
코드 분석: 어떤 값이 정규화되는지, DOM 읽기/생성 경계, 입력 배열·props의 변경이 결과에 전파되지 않는 이유를 설명한다.

## Stage 2 — 순수 Diff

**범위:** core/diff.js, tests/unit/diff.test.js. DOM 코드 변경 없이 계약과 수동 VNode fixture로 검증한다.

- [x] 동일 트리 → 빈 Patch, 생성·삭제·교체·텍스트·속성/이벤트 변경의 다섯 종류 구현
- [x] null ↔ 루트, element ↔ text, 태그 변경, 속성 삭제, 이벤트 함수 교체 검증
- [x] 자식 추가·연속 삭제·중간 삽입·재배열과 적용 순서 검증
- [x] 이전/다음 입력을 동결한 테스트로 비변경 계약 검증

이론: 재귀 비교, 형제 인덱스 대응의 한계, 순차 Patch의 주소 기준.
코드 분석: 예제 두 트리를 직접 비교해 Patch를 예측하고, 인덱스 이동이 생기는 사례를 손으로 추적한다. 아직 없는 Patch 구현을 테스트 안에서 복제하지 않는다.

## Stage 3 — Patch와 엔진 통합

**범위:** dom/patch.js, 이벤트 등록 기록을 공유하는 dom/events.js와 dom/render.js, tests/unit/patch.test.js, tests/integration/engine.test.js.

- [x] 다섯 Patch 적용, 잘못된 경로·노드 종류·루트 소유권의 오류 처리
- [x] 속성 삭제·boolean 속성, 이벤트 교체/해제 후 중복 호출 없음 검증
- [x] 통합: old DOM → old VNode, next VNode → Diff → Patch → 목표 VNode 동등성
- [x] 빈 루트 생성/삭제, 연속 자식 삭제, 중간 삽입 후 하위 변경, 텍스트/공백 포함 조합 검증
- [x] 변경하지 않은 형제 DOM 참조 유지, TEXT는 기존 Text 노드 유지, 무변경 Patch는 DOM을 건드리지 않음 검증

이론: DOM 노드 정체성, 전체 재렌더와 부분 갱신, Reflow/Repaint와 측정의 구분.
코드 분석: Diff가 만든 각 명령의 실제 대상과 순서를 확인하고 전체 innerHTML 교체가 없는지 검토한다.

## Stage 4 — State History

**범위:** core/history.js, tests/unit/history.test.js, tests/integration/history.test.js.

- [ ] 생성, 저장, 현재값, Undo/Redo, 경계 동작 구현
- [ ] 입력 VNode·이력 배열과 스냅샷의 독립성, null 스냅샷, 이벤트 함수 참조 보존 검증
- [ ] A → B → C → Undo(B) → D 이후 C로 Redo할 수 없음 검증
- [ ] 실제 엔진을 연결해 A → B → Undo(A) → Redo(B)의 DOM 결과와 참조 유지 검증

이론: 스냅샷과 역 Patch의 차이, 불변성, 이력 커서와 분기.
코드 분석: 새로운 이력과 기존 이력이 공유하는 값·복사하는 값을 설명하고 메모리 비용을 추정한다.

## Stage 5 — Phase 1 데모

**범위:** index.html, src/app/main.js, src/app/style.css, tests/integration/demo.test.js. 이때 개발 서버 도구를 필요한 만큼 추가한다.

- [ ] 실제 영역·루트 내부를 편집하는 테스트 영역·Patch/Undo/Redo 버튼 연결
- [ ] 초기 왕복, Patch 성공 후 저장, 변경 없음 시 이력 추가 없음
- [ ] Undo/Redo가 두 영역을 동기화하고 미반영 편집을 버리는 동작 검증
- [ ] Undo 후 편집·Patch의 미래 이력 제거, 경계 버튼 상태, 이벤트 해제 검증
- [ ] 잘못된 편집·적용 실패 시 이력 유지와 현재 스냅샷 복구 검증
- [ ] 실제 모듈과 DOM 이벤트로 초기화 → 편집 → Patch → Undo → Redo → 분기 통합 시나리오 실행
- [ ] 실제 브라우저에서 공백·중첩 요소·연속 추가/삭제·버튼 동작 수동 확인

이론: app의 조합 책임과 엔진 책임, 편집 DOM과 저장 트리의 차이.
코드 분석: 버튼 한 번이 호출하는 함수·저장 시점·오류 시 상태를 추적한다. jsdom 테스트로 레이아웃·커서 동작까지 검증했다고 주장하지 않는다.

## Phase 2 — 재사용 원칙과 후속 순서

세부 계획은 Phase 1 완료 후 확정하며 지금 구현하지 않는다.

1. `FunctionComponent` 클래스: hooks 배열, mount/update, 이전 VNode 보관. 자식은 props만 받는 순수 함수.
2. 루트 `useState`: 상태 슬롯, 함수형 갱신, 상태 변경 → 기존 Diff/Patch 경로의 부분 갱신.
3. `useEffect`: 렌더 후 실행, 의존성 비교, 재실행 전·해제 시 cleanup.
4. `useMemo`: 의존성 비교와 계산값 재사용. 각 Hook 단위 테스트 및 Component → Hooks → 엔진 통합 테스트.
5. 입력·클릭으로 갱신되는 데모. 배칭·key 최적화는 별도 선택 과제로 둔다.

## AI 작업 단위와 완료 조건

다음 요청에는 다음 항목만 전달해 문맥을 좁힌다.

```text
목표: PLAN.md Stage N의 기능 X
읽기: AGENTS.md, 관련 계약, 대상 모듈과 기존 테스트
수정 범위: 담당 소스 파일과 대응 테스트
제약: 공개 계약·기존 테스트 유지, 다른 단계 구현 금지
검증: 관련 테스트 실행 후 npm run check
보고: 변경 파일 / 테스트 결과 / 설계 이유 / 남은 문제
```

Subagent 실습을 명시적으로 요청하면 Stage 1에서 순수 VNode 모듈과 DOM 모듈, 또는 Stage 2와 Stage 4를 분리할 수 있다. 먼저 계약을 고정하고 파일 소유권을 나눈다. Multi-Agent 실습은 구현 담당과 읽기 전용 리뷰 담당으로 시작하고, 주 담당자가 통합 테스트와 충돌 해결을 책임진다. 학습 비율의 코드 분석 시간은 리뷰에만 맡기지 않고 사용자가 직접 흐름을 설명하는 데 쓴다.

각 구현 단계 완료 조건: 대응 단위·실제 모듈 통합 검증, npm run check 통과, 계약·문서와 구현 일치, 사용자가 핵심 흐름·엣지 케이스를 설명할 수 있음. 순수 모듈의 독립 개발 단계에서는 단위 검증으로 먼저 마무리하고 예정된 다음 통합 단계에서 실제 연결을 검증한다. 미검증 사항은 체크하지 않는다.
