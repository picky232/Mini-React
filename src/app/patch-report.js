import { createDOM } from '../dom/render.js';

/** @typedef {import('../core/contracts.js').Patch} Patch */
/** @typedef {import('../core/contracts.js').Tree} Tree */
/** @typedef {import('../core/contracts.js').VNode} VNode */

const MAX = 70;
/** @param {string} text */
const short = (text) => (text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text);

/** @param {VNode} node */
function label(node) {
  return node.kind === 'text' ? `"${short(node.value)}"` : `<${node.tag}>`;
}

/**
 * Patch 하나를 사람이 읽는 문장으로 바꾼다. 화면의 Patch 로그와 Hooks 인스펙터가 같이 쓴다.
 * @param {Patch} patch
 * @returns {{ type: string, target: string, detail: string }}
 */
export function describePatch(patch) {
  const target = patch.path.length === 0 ? '루트' : `[${patch.path.join(', ')}]`;
  switch (patch.type) {
    case 'TEXT':
      return { type: patch.type, target, detail: `→ "${short(patch.value)}"` };
    case 'PROPS': {
      const { setAttrs, removeAttrs, setEvents, removeEvents } = patch.changes;
      const parts = [
        ...Object.entries(setAttrs).map(([name, value]) => `${name}="${short(value)}" 설정`),
        ...removeAttrs.map((name) => `${name} 삭제`),
        ...Object.keys(setEvents).map((name) => `${name} 이벤트 연결`),
        ...removeEvents.map((name) => `${name} 이벤트 해제`),
      ];
      return { type: patch.type, target, detail: parts.join(' · ') };
    }
    case 'INSERT':
      return { type: patch.type, target, detail: `+ ${label(patch.node)}` };
    case 'REPLACE':
      return { type: patch.type, target, detail: `→ ${label(patch.node)}로 교체` };
    case 'REMOVE':
      return { type: patch.type, target, detail: '노드와 하위 노드 삭제' };
    case 'MOVE':
      return { type: patch.type, target: `${target}의 자식`, detail: `[${patch.from}]번을 [${patch.to}]번 앞으로 이동 (노드 재사용)` };
    default:
      return { type: 'UNKNOWN', target, detail: '' };
  }
}

/** @param {Node} node @returns {number} */
const countNodes = (node) => [...node.childNodes].reduce((sum, child) => sum + countNodes(child), 1);

/**
 * 바뀐 노드 수. 속성·텍스트 변경은 1개, 추가·삭제는 하위 노드까지 센다.
 * @param {readonly MutationRecord[]} records
 */
export function touchedNodes(records) {
  return records.reduce((sum, record) => record.type !== 'childList'
    ? sum + 1
    : sum + [...record.addedNodes, ...record.removedNodes].reduce((n, node) => n + countNodes(node), 0), 0);
}

/**
 * 같은 변경을 innerHTML처럼 통째로 바꿨을 때의 MutationRecord.
 * template 안은 스크립트·이미지 로드가 일어나지 않는 문서라 그 안에서 잰다.
 * @param {Document} document
 * @param {Tree} previous
 * @param {Tree} next
 */
export function measureFullReplace(document, previous, next) {
  const template = document.createElement('template');
  const { content } = template;
  const inert = /** @type {Document} */ (content.ownerDocument);
  content.replaceChildren(...(previous === null ? [] : [createDOM(previous, inert)]));
  const observer = new MutationObserver(() => {});
  observer.observe(content, { childList: true, attributes: true, characterData: true, subtree: true });
  content.replaceChildren(...(next === null ? [] : [createDOM(next, inert)]));
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}
