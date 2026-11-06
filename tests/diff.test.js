import { describe, it, expect } from 'vitest';
import { diff } from '../src/diff.js';
import { CASES, el, text, root } from './fixtures.js';

describe('diff: 픽스처 CASES (순서까지 일치)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      expect(diff(c.oldV, c.newV)).toEqual(c.patches);
    });
  }
});

describe('diff: 추가 케이스', () => {
  it('입력 VNode를 바꾸지 않는다 (순수 함수)', () => {
    for (const c of CASES) {
      const oldCopy = structuredClone(c.oldV);
      const newCopy = structuredClone(c.newV);
      diff(c.oldV, c.newV);
      expect(c.oldV).toEqual(oldCopy);
      expect(c.newV).toEqual(newCopy);
    }
  });

  it('겹치는 자식 재귀가 끝난 뒤에 남는 자식 REMOVE가 내림차순으로 나온다', () => {
    const oldV = root(el('ul', {}, el('li', {}, text('a')), el('li', {}, text('b')), el('li', {}, text('c'))));
    const newV = root(el('ul', { class: 'x' }, el('li', {}, text('z'))));
    expect(diff(oldV, newV)).toEqual([
      { type: 'PROPS', path: [0], set: { class: 'x' }, remove: [] },
      { type: 'TEXT', path: [0, 0, 0], text: 'z' },
      { type: 'REMOVE', path: [0, 2] },
      { type: 'REMOVE', path: [0, 1] },
    ]);
  });

  it('속성만 삭제하면 set은 빈 객체로 남는다', () => {
    const oldV = root(el('p', { id: 'a', class: 'b' }));
    const newV = root(el('p', {}));
    expect(diff(oldV, newV)).toEqual([{ type: 'PROPS', path: [0], set: {}, remove: ['id', 'class'] }]);
  });

  it('텍스트 앞뒤 공백 차이도 TEXT로 잡는다', () => {
    expect(diff(root(text('a')), root(text(' a ')))).toEqual([{ type: 'TEXT', path: [0], text: ' a ' }]);
  });
});
