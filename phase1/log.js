import { vnodeToHTML } from '../src/vdom.js';

const MAX = 90;
const short = (s) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);

/**
 * path를 이전 VNode에서 따라가며 "ul[1] > li[0]" 같은 DOM 경로 이름을 만든다. [] = 컨테이너(#root)
 * @param {import('../src/types.js').VNode} root
 * @param {number[]} path
 */
function walk(root, path) {
  let node = root;
  const names = [];
  for (const i of path) {
    node = node.children[i];
    names.push(`${node.type}[${i}]`);
  }
  return { node, label: names.join(' > ') || '#root' };
}

/**
 * Patch 하나를 사람이 읽는 DOM 형태로 바꾼다. path는 이전 트리 기준이라 prev에서 찾는다.
 * @param {import('../src/types.js').Patch} p
 * @param {import('../src/types.js').VNode} prev
 * @returns {{ target: string, detail: string }}
 */
export function describePatch(p, prev) {
  const { node, label } = walk(prev, p.path);
  switch (p.type) {
    case 'TEXT':
      return { target: label, detail: `"${short(node.text)}" → "${short(p.text)}"` };
    case 'PROPS': {
      const set = Object.entries(p.set).map(([k, v]) => `${k}="${v}" 설정`);
      const removed = p.remove.map((k) => `${k} 삭제`);
      return { target: label, detail: [...set, ...removed].join(' · ') };
    }
    case 'CREATE':
      return { target: `${label} 의 [${p.index}] 자리`, detail: `+ ${short(vnodeToHTML(p.node))}` };
    case 'REMOVE':
      return { target: label, detail: `− ${short(vnodeToHTML(node))}` };
    case 'REPLACE':
      return { target: label, detail: `${short(vnodeToHTML(node))} → ${short(vnodeToHTML(p.node))}` };
    default:
      return { target: label, detail: JSON.stringify(p) };
  }
}
