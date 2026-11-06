import { describe, it, expect } from 'vitest';
import { createElement } from '../src/vdom.js';
import { CASES } from './fixtures.js';

// Stage 0: 손으로 쓴 oldV/newV 정답이 실제 HTML 파싱 결과와 같은지 검증한다.
function parse(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const walker = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  const drop = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === Node.COMMENT_NODE || n.nodeValue.trim() === '') drop.push(n);
  }
  drop.forEach((n) => n.remove());
  const box = document.createElement('div');
  box.appendChild(t.content);
  return box;
}

function render(vnode) {
  const box = document.createElement('div');
  box.appendChild(createElement(vnode));
  return box;
}

describe('fixtures 정답 검증', () => {
  for (const c of CASES) {
    it(`${c.name}: oldV = before, newV = after`, () => {
      expect(render(c.oldV).isEqualNode(parse(c.before))).toBe(true);
      expect(render(c.newV).isEqualNode(parse(c.after))).toBe(true);
    });
  }
});
