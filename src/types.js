// Phase 1 계약. 모든 모듈은 이 파일에만 의존한다. 바꾸려면 docs/PHASE1_PLAN.md 2장부터 고친다.

/**
 * 엘리먼트 VNode. type은 소문자 태그 이름, props는 속성 이름 → 문자열 값.
 * @typedef {{ type: string, props: Record<string, string>, children: VNode[] }} ElementVNode
 */

/**
 * 텍스트 VNode. 앞뒤 공백은 자르지 않는다(공백"만" 있는 노드만 버린다).
 * @typedef {{ type: '#text', text: string }} TextVNode
 */

/**
 * 루트 VNode. 영역 컨테이너 자체이며, 비교 대상은 children뿐이다.
 * @typedef {{ type: '#root', props: {}, children: VNode[] }} RootVNode
 */

/** @typedef {ElementVNode | TextVNode | RootVNode} VNode */

/**
 * DOM → VNode 정규화 규칙 (vdom.js와 patch.js의 노드 세기가 반드시 같아야 path가 맞는다):
 * 1. 엘리먼트와 텍스트만 VNode가 된다. 주석 등 나머지 노드는 버린다.
 * 2. HTML 공백 문자(/^[ \t\n\f\r]*$/)만 있는 텍스트는 버린다. String.trim은 &nbsp;까지 지우므로 쓰지 않는다.
 * 3. 이웃한 텍스트 VNode는 하나로 합친다. (주석이 빠지면 텍스트가 이웃하는데, HTML로 바꿨다 다시 읽으면 하나가 되기 때문)
 * 4. props는 Object.fromEntries로 만든다. props['__proto__'] = v 대입은 setter로 동작해 값이 사라진다. (diff의 set도 동일)
 * 5. path는 1·2번 규칙으로 남는 노드만 센다. patch.js는 이웃 텍스트를 합치지 않으므로,
 *    patch 대상 DOM은 createElement로 그린 것(이웃 텍스트가 없는 DOM)이어야 한다.
 *
 * VNode → HTML (vnodeToHTML) 규칙: 다시 htmlToVNode 하면 같은 VNode가 나와야 한다.
 * - 텍스트는 & < > 를, 속성값은 & " 를 이스케이프한다.
 * - void 엘리먼트(br, img, input 등)는 닫는 태그를 쓰지 않는다. </br>은 <br>로 하나 더 파싱된다.
 */

/**
 * path: #root에서 출발하는 자식 인덱스 배열. [] = 컨테이너. 모든 path는 이전(old) 트리 기준.
 * @typedef {number[]} Path
 */

/**
 * @typedef {{ type: 'CREATE', path: Path, index: number, node: VNode }} CreatePatch   path = 부모
 * @typedef {{ type: 'REMOVE', path: Path }} RemovePatch                             path = 대상
 * @typedef {{ type: 'REPLACE', path: Path, node: VNode }} ReplacePatch               path = 대상
 * @typedef {{ type: 'TEXT', path: Path, text: string }} TextPatch                    path = 대상(#text)
 * @typedef {{ type: 'PROPS', path: Path, set: Record<string, string>, remove: string[] }} PropsPatch
 *   set: 새로 생기거나 값이 바뀐 속성만. remove: 사라진 속성 이름. 둘 다 항상 존재(비어 있어도).
 * @typedef {CreatePatch | RemovePatch | ReplacePatch | TextPatch | PropsPatch} Patch
 */

/**
 * diff가 내보내는 순서 (patch는 이 배열을 앞에서부터 그대로 적용한다):
 * 1. 노드 자신의 patch (REPLACE면 하위는 비교하지 않음 / TEXT / PROPS)
 * 2. 겹치는 자식들을 인덱스 오름차순으로 재귀
 * 3. 남는 자식: 이전 쪽이 길면 REMOVE를 인덱스 내림차순, 새 쪽이 길면 CREATE를 인덱스 오름차순
 */

export const PATCH = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  TEXT: 'TEXT',
  PROPS: 'PROPS',
});

export const TEXT = '#text';
export const ROOT = '#root';
