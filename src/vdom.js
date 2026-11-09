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
  // 자식은 childVNodes가 다시 domToVNode를 부르며 처리 (재귀로 트리 아래까지 내려감)
  return { type: node.localName, props, children: childVNodes(node) };
}

// 시작(^)부터 끝($)까지 [공백·탭·줄바꿈 중 하나]가 0번 이상(*) 반복 = "공백류만 있는 문자열". &nbsp;(U+00A0)는 목록에 없어서 남는다
// patch.js의 counts와 같은 규칙이어야 path 번호가 맞는다
const HTML_SPACE = /^[ \t\n\f\r]*$/;

// 주석이 빠지면 텍스트가 이웃할 수 있다. vnodeToHTML → 재파싱하면 하나가 되므로 여기서 합친다
function childVNodes(parent) {
  const out = [];
  // children은 엘리먼트만 주므로 텍스트까지 주는 childNodes를 순회한다 (바로 아래 자식만)
  for (const v of [...parent.childNodes].map(domToVNode)) {
    if (v === null) continue; // 주석·공백 텍스트는 버림
    const last = out[out.length - 1];
    // 지금 것도 텍스트, 바로 앞에 넣은 것도 텍스트면 하나로 이어 붙여 덮어씀
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
  // 컨테이너 자신(div#real 등)은 빼고 안쪽만 담는다. #root는 HTML에 없는, 컨테이너 자리를 표시하는 값
  return { type: ROOT, props: {}, children: childVNodes(el) };
}

/**
 * HTML 문자열 → #root VNode (template 엘리먼트로 파싱).
 * @param {string} html
 * @returns {VNode}
 */
export function htmlToVNode(html) {
  // template은 파싱만 하고 스크립트·이미지 로드를 실행하지 않는다 (div면 <img onerror>가 실행됨)
  const t = document.createElement('template');
  t.innerHTML = html; // 문자열 → DOM: 브라우저 파서가 처리
  return containerToVNode(t.content); // DOM → VNode. content(DocumentFragment)를 컨테이너로 삼음
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

  // '#root'는 태그 이름이 아니라 만들 수 없으므로, 자식을 담을 태그 없는 묶음(Fragment)으로 대신한다
  // Fragment는 컨테이너에 붙이는 순간 사라지고 자식만 들어간다
  const node = vnode.type === ROOT
    ? document.createDocumentFragment()
    : document.createElement(vnode.type);

  if (vnode.type !== ROOT) {
    for (const [name, value] of Object.entries(vnode.props)) node.setAttribute(name, value);
  }
  // 자식마다 자기 자신을 다시 호출해서 만들고 붙인다. 화면에 붙기 전에 메모리에서 다 조립됨
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
  // style·script 등은 안의 &gt;를 >로 되돌려 읽지 않으므로 텍스트를 그대로 쓴다
  const inner = RAW_TEXT.has(vnode.type)
    ? vnode.children.map((c) => c.text ?? vnodeToHTML(c)).join('')
    : vnode.children.map(vnodeToHTML).join('');
  if (vnode.type === ROOT) return inner;
  // void 엘리먼트에 </br>을 붙이면 다시 파싱할 때 <br>이 하나 더 생긴다
  if (VOID.has(vnode.type)) return openTag(vnode);
  // 파서는 pre·textarea·listing 여는 태그 바로 뒤 줄바꿈 하나를 버리므로 하나 더 붙인다
  const lead = LEADING_NEWLINE.has(vnode.type) && inner.startsWith('\n') ? '\n' : '';
  return `${openTag(vnode)}${lead}${inner}</${vnode.type}>`;
}

const openTag = (v) => `<${v.type}${Object.entries(v.props).map(([k, val]) => ` ${k}="${escapeAttr(val)}"`).join('')}>`;

/**
 * VNode → 들여쓴 HTML 문자열 (테스트 영역 표시용). 다시 htmlToVNode 하면 같은 VNode가 나온다.
 * 자식이 전부 엘리먼트일 때만 줄을 바꾼다. 그 사이에 생기는 줄바꿈·공백은 "공백만 있는 텍스트"라 VNode에서 버려지기 때문.
 * 텍스트 자식이 하나라도 있으면 한 줄로 둔다. <p>링크: <a>…에서 줄을 바꾸면 "링크: "가 "링크: \n  "으로 바뀌어 가짜 TEXT patch가 생긴다.
 * @param {VNode} vnode
 * @param {number} [depth]
 * @returns {string}
 */
export function vnodeToPrettyHTML(vnode, depth = 0) {
  const block = vnode.type !== TEXT && vnode.children.length > 0
    && vnode.children.every((c) => c.type !== TEXT)
    && !RAW_TEXT.has(vnode.type) && !LEADING_NEWLINE.has(vnode.type);
  if (!block) return vnodeToHTML(vnode);
  if (vnode.type === ROOT) return vnode.children.map((c) => vnodeToPrettyHTML(c, depth)).join('\n');
  const pad = '  '.repeat(depth);
  const inner = vnode.children.map((c) => `${pad}  ${vnodeToPrettyHTML(c, depth + 1)}`).join('\n');
  return `${openTag(vnode)}\n${inner}\n${pad}</${vnode.type}>`;
}

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
const LEADING_NEWLINE = new Set(['pre', 'textarea', 'listing']);
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
