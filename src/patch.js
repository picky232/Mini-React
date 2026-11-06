import { createElement } from './vdom.js';

/** @typedef {import('./types.js').Patch} Patch */

// VNode에 들어가는 노드만 센다: 엘리먼트, 공백만이 아닌 텍스트. (domToVNode의 무시 규칙과 같아야 한다. trim은 &nbsp;까지 지워서 안 된다)
// shortcut: 주석으로 갈라진 텍스트는 VNode에선 하나로 합쳐지지만 여기선 따로 센다. 실제 영역은 로드 때 createElement로 다시 그려 그런 DOM이 없다. 임의 DOM에 patch하게 되면 여기도 맞춰야 한다
const counts = (n) => n.nodeType === 1 || (n.nodeType === 3 && !/^[ \t\n\f\r]*$/.test(n.nodeValue));
const kids = (node) => [...node.childNodes].filter(counts);

/** VNode 기준 path를 따라 실제 DOM 노드를 찾는다. DOM에 공백·주석이 섞여 있어도 VNode 인덱스와 맞춘다. */
function find(container, path) {
  let node = container;
  for (const i of path) node = kids(node)[i];
  return node;
}

/**
 * Patch 배열을 컨테이너에 앞에서부터 그대로 적용한다. path [] = 컨테이너.
 * @param {Element} container
 * @param {Patch[]} patches
 */
export function patch(container, patches) {
  for (const p of patches) {
    const target = find(container, p.path);
    switch (p.type) {
      case 'CREATE':
        target.insertBefore(createElement(p.node), kids(target)[p.index] ?? null);
        break;
      case 'REMOVE':
        target.remove();
        break;
      case 'REPLACE':
        target.replaceWith(createElement(p.node));
        break;
      case 'TEXT':
        target.nodeValue = p.text;
        break;
      case 'PROPS':
        for (const [name, value] of Object.entries(p.set)) target.setAttribute(name, value);
        for (const name of p.remove) target.removeAttribute(name);
        break;
      default:
        throw new Error(`알 수 없는 patch 타입: ${p.type}`);
    }
  }
}
