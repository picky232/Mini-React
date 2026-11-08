import { createTextVNode, h } from '../core/vnode.js';

/**
 * 실제 DOM을 읽어 VNode 트리로 변환한다. 원본 DOM은 변경하지 않는다.
 * @type {import('../core/contracts.js').DomToVNode}
 */
export function domToVNode(node) {
  // instanceof 대신 nodeType으로 구분해 다른 window의 노드도 처리한다.
  // 3은 Text 노드다. 자식 탐색 없이 값을 반환하므로 재귀가 여기서 끝난다.
  if (node?.nodeType === 3) {
    return createTextVNode(/** @type {Text} */ (node).data);
  }
  // 1은 Element 노드다. 주석(8) 등은 기존 VNode 계약에 없으므로 거절한다.
  if (node?.nodeType !== 1) {
    throw new TypeError('Only Element and Text nodes are supported, including in children.');
  }

  // 위에서 확인한 노드 종류를 JSDoc 타입 검사기에도 알려 준다.
  const element = /** @type {Element} */ (node);
  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    throw new TypeError('Only HTML elements are supported.');
  }

  // DOM의 속성 목록을 이름 → 문자열 값 객체로 복사한다.
  // input.value 같은 현재 프로퍼티 값은 속성과 별개이므로 여기서 읽지 않는다.
  const attrs = Object.fromEntries(Array.from(element.attributes, ({ name, value }) => [name, value]));
  // children은 요소만 포함하지만 childNodes는 공백·빈 텍스트도 포함한다.
  // 모든 자식을 같은 함수로 변환해 순서와 중첩 구조를 보존한다.
  const children = Array.from(element.childNodes, (child) => (
    // 재귀 호출에서도 종류를 검사하므로 주석을 생략하지 않고 거절한다.
    domToVNode(/** @type {Element | Text} */ (child))
  ));
  // localName으로 태그 이름을 읽는다. 등록된 이벤트 리스너는 DOM에서
  // 열거할 수 없으므로 이벤트 목록은 빈 객체로 둔다.
  return h(element.localName, { attrs, events: {} }, children);
}
