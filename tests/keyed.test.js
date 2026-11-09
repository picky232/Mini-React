import { describe, it, expect } from 'vitest';
import { diff, longestIncreasing } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { createElement, vnodeToHTML } from '../src/vdom.js';
import { root, el, text } from './fixtures.js';

// key 있는 li 목록. key = 글자
const item = (k) => ({ ...el('li', {}, text(k)), key: k });
const list = (keys) => root(el('ul', {}, ...keys.map(item)));
const noKey = (keys) => root(el('ul', {}, ...keys.map((k) => el('li', {}, text(k)))));

/** oldKeys로 그린 DOM에 diff를 적용하고, 결과·patch·전후 li 노드를 돌려준다 */
function run(oldV, newV) {
  const container = document.createElement('div');
  container.appendChild(createElement(oldV));
  const before = [...container.querySelectorAll('li')];
  const patches = diff(oldV, newV);
  patch(container, patches);
  return { container, patches, before, after: [...container.querySelectorAll('li')] };
}

const types = (patches) => patches.map((p) => p.type);

describe('key 재조정: 위치 비교보다 patch가 적다', () => {
  it('맨 앞 삽입: 위치 비교는 TEXT 3 + CREATE 1, key 비교는 CREATE 1', () => {
    expect(types(diff(noKey(['a', 'b', 'c']), noKey(['x', 'a', 'b', 'c'])))).toEqual(['TEXT', 'TEXT', 'TEXT', 'CREATE']);

    const { container, patches, before, after } = run(list(['a', 'b', 'c']), list(['x', 'a', 'b', 'c']));
    expect(types(patches)).toEqual(['CREATE']);
    expect(container.innerHTML).toBe(vnodeToHTML(list(['x', 'a', 'b', 'c'])));
    expect(after.slice(1)).toEqual(before); // 기존 li 세 개는 같은 DOM 객체 그대로
  });

  it('가운데 삭제: REMOVE 1개, 나머지 노드는 그대로', () => {
    const { patches, before, after } = run(list(['a', 'b', 'c']), list(['a', 'c']));
    expect(patches).toEqual([{ type: 'REMOVE', path: [0, 1] }]);
    expect(after).toEqual([before[0], before[2]]);
  });

  it('맨 앞을 맨 뒤로: MOVE 1개', () => {
    const { container, patches, before, after } = run(list(['a', 'b', 'c', 'd']), list(['b', 'c', 'd', 'a']));
    expect(patches).toEqual([{ type: 'MOVE', path: [0], from: 0, to: 4 }]);
    expect(container.textContent).toBe('bcda');
    expect(after).toEqual([before[1], before[2], before[3], before[0]]);
  });

  it('맨 뒤를 맨 앞으로: MOVE 1개', () => {
    const { container, patches } = run(list(['a', 'b', 'c', 'd']), list(['d', 'a', 'b', 'c']));
    expect(types(patches)).toEqual(['MOVE']);
    expect(container.textContent).toBe('dabc');
  });

  it('뒤집기: n-1번 MOVE, 새로 만드는 노드 없음', () => {
    const { container, patches, before, after } = run(list(['a', 'b', 'c', 'd', 'e']), list(['e', 'd', 'c', 'b', 'a']));
    expect(types(patches)).toEqual(['MOVE', 'MOVE', 'MOVE', 'MOVE']);
    expect(container.textContent).toBe('edcba');
    expect(new Set(after)).toEqual(new Set(before));
  });

  it('같은 key의 내용이 바뀌면 옮긴 뒤에도 그 노드만 고친다', () => {
    const oldV = list(['a', 'b']);
    const newV = root(el('ul', {}, item('b'), { ...el('li', { class: 'on' }, text('a!')), key: 'a' }));
    const { container, patches, before, after } = run(oldV, newV);
    expect(types(patches)).toEqual(['PROPS', 'TEXT', 'MOVE']);
    expect(container.innerHTML).toBe('<ul><li>b</li><li class="on">a!</li></ul>');
    expect(after).toEqual([before[1], before[0]]);
  });

  it('key가 겹치거나 빠지면 위치 비교로 돌아간다', () => {
    const dup = root(el('ul', {}, item('a'), item('a')));
    expect(types(diff(list(['a']), dup))).toEqual(['CREATE']);
    const mixed = root(el('ul', {}, item('a'), el('li', {}, text('b'))));
    expect(types(diff(list(['b', 'a']), mixed))).toEqual(['TEXT', 'TEXT']);
  });
});

describe('key 재조정: 무작위 변경 fuzz', () => {
  // 시드 고정 난수 (실패하면 같은 입력으로 재현된다)
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = rand(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  it('삽입·삭제·재정렬을 섞어도 결과가 정답과 같고, 남은 key의 노드는 재사용된다', () => {
    for (let round = 0; round < 300; round++) {
      const pool = 'abcdefghijklmnop'.split('');
      const oldKeys = shuffle([...pool]).slice(0, rand(10));
      const newKeys = shuffle([...pool]).slice(0, rand(10));
      const { container, before, after } = run(list(oldKeys), list(newKeys));
      expect(container.innerHTML).toBe(vnodeToHTML(list(newKeys)));
      // 양쪽에 다 있는 key는 같은 DOM 노드여야 한다 (지우고 새로 만들지 않음)
      const byText = (nodes) => new Map(nodes.map((n) => [n.textContent, n]));
      const b = byText(before);
      for (const [k, node] of byText(after)) if (b.has(k)) expect(node).toBe(b.get(k));
    }
  });
});

describe('longestIncreasing', () => {
  it.each([
    [[], []],
    [[0, 1, 2], [0, 1, 2]],
    [[2, 1, 0], [2]],
    [[1, 2, 3, 0], [0, 1, 2]],
    [[3, 0, 1, 2], [1, 2, 3]],
  ])('%j → 인덱스 %j', (seq, expected) => {
    expect([...longestIncreasing(seq)].sort()).toEqual(expected);
  });
});

describe('같은 참조 건너뛰기', () => {
  it('같은 VNode 객체면 하위가 달라 보여도 비교하지 않는다', () => {
    const shared = el('p', {}, text('x'));
    expect(diff(root(shared), root(shared))).toEqual([]);
  });
});
