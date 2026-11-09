import { describe, it, expect } from 'vitest';
import { containerToVNode, htmlToVNode, vnodeToHTML } from '../src/vdom.js';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { createHistory } from '../src/history.js';
import { CASES } from './fixtures.js';

const OBSERVE = { childList: true, attributes: true, characterData: true, subtree: true };

function makeContainer(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

/** patches를 적용하고 그 사이의 MutationObserver 기록 수를 돌려준다 (takeRecords로 동기 수집). */
function patchCounting(container, patches) {
  const observer = new MutationObserver(() => {});
  observer.observe(container, OBSERVE);
  patch(container, patches);
  const count = observer.takeRecords().length;
  observer.disconnect();
  return count;
}

const html = (container) => vnodeToHTML(containerToVNode(container));

describe('통합: vdom → diff → patch (PHASE1_PLAN 4장 성질)', () => {
  it.each(CASES)('$name', (c) => {
    const container = makeContainer(c.before);
    const oldV = containerToVNode(container);
    const newV = htmlToVNode(c.after);
    expect(oldV).toEqual(c.oldV);
    expect(newV).toEqual(c.newV);

    const mutations = patchCounting(container, diff(oldV, newV));

    expect(html(container)).toBe(vnodeToHTML(newV));
    expect(mutations).toBeLessThanOrEqual(c.maxMutations);
  });
});

describe('통합: history와 결합 (검증 페이지 흐름)', () => {
  it('Patch 두 번 → back → forward 에서 컨테이너가 각 기록과 일치한다', () => {
    const container = makeContainer('<ul class="a"><li>1</li></ul>');
    const history = createHistory(containerToVNode(container));
    const v0 = history.current();

    // 검증 페이지 6장의 Patch 동작: diff(current, newV) → patch → push
    const doPatch = (after) => {
      const newV = htmlToVNode(after);
      patch(container, diff(history.current(), newV));
      history.push(newV);
      return newV;
    };
    // 뒤로/앞으로: 이전 current와 목표를 diff → patch
    const move = (dir) => {
      const prev = history.current();
      const target = history[dir]();
      patch(container, diff(prev, target));
      return target;
    };

    const v1 = doPatch('<ul class="b"><li>1</li><li>2</li></ul>');
    expect(html(container)).toBe(vnodeToHTML(v1));
    const v2 = doPatch('<ol><li>x</li></ol><p>tail</p>');
    expect(html(container)).toBe(vnodeToHTML(v2));

    expect(move('back')).toBe(v1);
    expect(html(container)).toBe(vnodeToHTML(v1));
    expect(move('back')).toBe(v0);
    expect(html(container)).toBe(vnodeToHTML(v0));
    expect(move('forward')).toBe(v1);
    expect(html(container)).toBe(vnodeToHTML(v1));
    expect(move('forward')).toBe(v2);
    expect(html(container)).toBe(vnodeToHTML(v2));
    expect(history.canForward()).toBe(false);
  });
});
