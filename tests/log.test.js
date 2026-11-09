import { describe, it, expect } from 'vitest';
import { describePatch } from '../phase1/log.js';
import { htmlToVNode } from '../src/vdom.js';
import { diff } from '../src/diff.js';

// before → after 의 diff 결과를 DOM 형태 설명으로 바꾼다
const run = (before, after) => {
  const prev = htmlToVNode(before);
  return diff(prev, htmlToVNode(after)).map((p) => ({ type: p.type, ...describePatch(p, prev) }));
};

describe('describePatch', () => {
  it('TEXT: 텍스트 노드 경로와 이전 → 새 글자', () => {
    expect(run('<ul><li>a</li><li>운동</li></ul>', '<ul><li>a</li><li>수영</li></ul>')).toEqual([
      { type: 'TEXT', target: 'ul[0] > li[1] > #text[0]', detail: '"운동" → "수영"' },
    ]);
  });

  it('PROPS: 설정·삭제한 속성', () => {
    expect(run('<p class="a" title="t">x</p>', '<p class="b" id="i">x</p>')).toEqual([
      { type: 'PROPS', target: 'p[0]', detail: 'class="b" 설정 · id="i" 설정 · title 삭제' },
    ]);
  });

  it('CREATE: 부모 경로·자리와 추가한 HTML', () => {
    expect(run('<ul><li>a</li></ul>', '<ul><li>a</li><li class="n">b</li></ul>')).toEqual([
      { type: 'CREATE', target: 'ul[0] 의 [1] 자리', detail: '+ <li class="n">b</li>' },
    ]);
  });

  it('REMOVE: 지운 노드의 HTML (이스케이프 유지)', () => {
    expect(run('<ul><li>a</li><li>a &lt; b</li></ul>', '<ul><li>a</li></ul>')).toEqual([
      { type: 'REMOVE', target: 'ul[0] > li[1]', detail: '− <li>a &lt; b</li>' },
    ]);
  });

  it('REPLACE: 이전 HTML → 새 HTML, 루트 바로 아래', () => {
    expect(run('<ul><li>a</li></ul>', '<ol><li>a</li></ol>')).toEqual([
      { type: 'REPLACE', target: 'ul[0]', detail: '<ul><li>a</li></ul> → <ol><li>a</li></ol>' },
    ]);
  });

  it('긴 HTML은 90자에서 자른다', () => {
    const [r] = run('<p>x</p>', `<p>x</p><p>${'가'.repeat(200)}</p>`);
    expect(r.detail.length).toBe(92); // "+ " + 90자
    expect(r.detail.endsWith('…')).toBe(true);
  });
});
