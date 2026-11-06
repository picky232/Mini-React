import { TEXT, ROOT } from './types.js';

/** @typedef {import('./types.js').VNode} VNode */

/**
 * DOM 노드 하나 → VNode. 공백만 있는 텍스트·주석 등 무시할 노드는 null.
 * @param {Node} node
 * @returns {VNode | null}
 */
export function domToVNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    // String.trim은 &nbsp;(U+00A0)까지 지우므로 HTML 공백 문자만 본다
    return HTML_SPACE.test(node.nodeValue) ? null : { type: TEXT, text: node.nodeValue };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null; // 주석 등
  // props[name] = value 대입은 name이 '__proto__'일 때 setter로 동작해 사라진다
  const props = Object.fromEntries([...node.attributes].map((a) => [a.name, a.value]));
  return { type: node.localName, props, children: childVNodes(node) };
}

const HTML_SPACE = /^[ \t\n\f\r]*$/;

// 주석이 빠지면 텍스트가 이웃할 수 있다. vnodeToHTML → 재파싱하면 하나가 되므로 여기서 합친다
function childVNodes(parent) {
  const out = [];
  for (const v of [...parent.childNodes].map(domToVNode)) {
    if (v === null) continue;
    const last = out[out.length - 1];
    if (v.type === TEXT && last?.type === TEXT) out[out.length - 1] = { type: TEXT, text: last.text + v.text };
    else out.push(v);
  }
  return out;
}

/**
 * 컨테이너의 자식들 → #root VNode.
 * @param {Element} el
 * @returns {VNode}
 */
export function containerToVNode(el) {
  return { type: ROOT, props: {}, children: childVNodes(el) };
}

/**
 * HTML 문자열 → #root VNode (template 엘리먼트로 파싱).
 * @param {string} html
 * @returns {VNode}
 */
export function htmlToVNode(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  return containerToVNode(t.content);
}

/**
 * VNode → 실제 DOM 노드. #root는 DocumentFragment로 만든다. (Stage 0 구현)
 * shortcut: HTML 네임스페이스만 지원한다. SVG가 필요해지면 createElementNS로 바꾼다.
 * shortcut: 속성을 거르지 않는다(on*, javascript: href, <script> 그대로). 입력이 사용자 자신의 textarea뿐이라 self-XSS만 가능. 외부 입력을 받게 되면 on*·script를 domToVNode에서 걸러야 한다.
 * @param {VNode} vnode
 * @returns {Node}
 */
export function createElement(vnode) {
  if (vnode.type === TEXT) return document.createTextNode(vnode.text);

  const node = vnode.type === ROOT
    ? document.createDocumentFragment()
    : document.createElement(vnode.type);

  if (vnode.type !== ROOT) {
    for (const [name, value] of Object.entries(vnode.props)) node.setAttribute(name, value);
  }
  for (const child of vnode.children) node.appendChild(createElement(child));
  return node;
}

/**
 * VNode → HTML 문자열. #root는 자식만 이어 붙인다. 텍스트와 속성값을 이스케이프한다.
 * @param {VNode} vnode
 * @returns {string}
 */
export function vnodeToHTML(vnode) {
  if (vnode.type === TEXT) return escapeText(vnode.text);
  const inner = vnode.children.map(vnodeToHTML).join('');
  if (vnode.type === ROOT) return inner;
  const attrs = Object.entries(vnode.props).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  // void 엘리먼트에 </br>을 붙이면 다시 파싱할 때 <br>이 하나 더 생긴다
  return VOID.has(vnode.type) ? `<${vnode.type}${attrs}>` : `<${vnode.type}${attrs}>${inner}</${vnode.type}>`;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
