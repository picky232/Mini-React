import { createTextVNode, h } from '../core/vnode.js';

/** @typedef {import('../core/contracts.js').VNode} VNode */

// 공백 자체가 내용인 태그. 안쪽 공백은 손대지 않는다.
const PRESERVE_SPACE = new Set(['pre', 'textarea']);

/**
 * VNode로 옮기지 않는 노드인지 판단한다. from-dom과 normalizeDOM이 같은 규칙을 써야
 * 화면의 childNodes와 VNode의 children 순서가 맞는다.
 * - 주석은 화면에 보이지 않으므로 버린다.
 * - 줄바꿈이 들어간 공백만 있는 텍스트는 들여쓰기이므로 버린다. 띄어쓰기만 있는 텍스트는 화면에 보이므로 남긴다.
 * - 빈 텍스트는 보이지 않고 Node.normalize()도 지우므로 버린다.
 * @param {Node} node
 * @param {boolean} preserveSpace pre·textarea 안이면 true
 */
function isIgnored(node, preserveSpace) {
  if (node.nodeType === 8) return true;
  if (node.nodeType !== 3) return false;
  const { data } = /** @type {Text} */ (node);
  if (data === '') return true;
  return !preserveSpace && /^[ \t\n\f\r]*$/.test(data) && /[\r\n]/.test(data);
}

/**
 * @param {Node} node
 * @param {boolean} preserveSpace
 * @returns {VNode}
 */
function convert(node, preserveSpace) {
  // instanceof 대신 nodeType으로 구분해 다른 window의 노드도 처리한다.
  // 3은 Text 노드다. 자식 탐색 없이 값을 반환하므로 재귀가 여기서 끝난다.
  if (node?.nodeType === 3) {
    return createTextVNode(/** @type {Text} */ (node).data);
  }
  // 1은 Element 노드다. 루트로 들어온 주석(8) 등은 VNode로 만들 수 없으므로 거절한다.
  if (node?.nodeType !== 1) {
    throw new TypeError('Only Element and Text nodes are supported.');
  }

  const element = /** @type {Element} */ (node);
  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    throw new TypeError('Only HTML elements are supported.');
  }

  // DOM의 속성 목록을 이름 → 문자열 값 객체로 복사한다.
  // input.value 같은 현재 프로퍼티 값은 속성과 별개이므로 여기서 읽지 않는다.
  const attrs = Object.fromEntries(Array.from(element.attributes, ({ name, value }) => [name, value]));
  const keepSpace = preserveSpace || PRESERVE_SPACE.has(element.localName);
  /** @type {VNode[]} */
  const children = [];
  for (const child of element.childNodes) {
    if (isIgnored(child, keepSpace)) continue;
    const vnode = convert(child, keepSpace);
    const last = children.at(-1);
    // 주석이 빠지면 텍스트가 이웃할 수 있다. HTML로 다시 파싱하면 하나가 되므로 여기서 합친다.
    if (vnode.kind === 'text' && last?.kind === 'text') {
      children[children.length - 1] = createTextVNode(last.value + vnode.value);
    } else {
      children.push(vnode);
    }
  }
  // 등록된 이벤트 리스너는 DOM에서 열거할 수 없으므로 이벤트 목록은 빈 객체로 둔다.
  // h()가 위험한 태그·속성을 거절하므로 Phase 1 입력도 Phase 2와 같은 규칙으로 막힌다.
  return h(element.localName, { attrs, events: {} }, children);
}

/**
 * 실제 DOM을 읽어 VNode 트리로 변환한다. 원본 DOM은 변경하지 않는다.
 * @type {import('../core/contracts.js').DomToVNode}
 */
export function domToVNode(node) {
  return convert(node, false);
}

/**
 * domToVNode가 버리는 노드를 실제 DOM에서도 지우고 이웃한 텍스트를 합친다.
 * 이렇게 해 두면 화면의 childNodes 인덱스가 VNode의 children 인덱스와 같아져 Patch 경로가 맞는다.
 * @param {Element} element
 */
export function normalizeDOM(element) {
  /** @param {Element} parent @param {boolean} preserveSpace */
  const clean = (parent, preserveSpace) => {
    const keepSpace = preserveSpace || PRESERVE_SPACE.has(parent.localName);
    for (const child of [...parent.childNodes]) {
      if (isIgnored(child, keepSpace)) child.remove();
      else if (child.nodeType === 1) clean(/** @type {Element} */ (child), keepSpace);
    }
  };
  clean(element, false);
  element.normalize();
}
