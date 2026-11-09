import { describe, it, expect } from 'vitest';
import { patch } from '../src/patch.js';
import { CASES, el, text } from './fixtures.js';

// 비교용 사본에서 공백만 있는 텍스트와 주석을 지운다 (patch는 원본에 그대로 적용).
function clean(node) {
  const copy = node.cloneNode(true);
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 8 || (c.nodeType === 3 && c.nodeValue.trim() === '')) c.remove();
      else walk(c);
    }
  };
  walk(copy);
  return copy;
}

function fromHTML(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

/** before를 넣고 patches를 적용한 뒤, 결과 컨테이너와 MutationObserver 기록 수를 돌려준다. */
function run(before, patches) {
  const container = fromHTML(before);
  const observer = new MutationObserver(() => {});
  observer.observe(container, { childList: true, attributes: true, characterData: true, subtree: true });
  patch(container, patches);
  const mutations = observer.takeRecords().length;
  observer.disconnect();
  return { container, mutations };
}

const expectSameDOM = (container, after) =>
  expect(clean(container).isEqualNode(clean(fromHTML(after)))).toBe(true);

describe('patch: 픽스처 CASES', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const { container, mutations } = run(c.before, c.patches);
      expectSameDOM(container, c.after);
      expect(mutations).toBeLessThanOrEqual(c.maxMutations);
    });
  }
});

describe('patch: 손으로 만든 patch', () => {
  it('빈 배열은 DOM을 전혀 바꾸지 않는다', () => {
    const before = '<ul>\n  <li class="a">x</li>\n</ul>';
    const { container, mutations } = run(before, []);
    expect(mutations).toBe(0);
    expect(container.innerHTML).toBe(before);
  });

  it('맨 앞 CREATE (index 0)는 첫 자식 앞에 넣는다', () => {
    const { container, mutations } = run('<ul><li>a</li></ul>', [
      { type: 'CREATE', path: [0], index: 0, node: el('li', {}, text('new')) },
    ]);
    expect(container.innerHTML).toBe('<ul><li>new</li><li>a</li></ul>');
    expect(mutations).toBe(1);
  });

  it('공백·주석이 섞여 있어도 VNode 인덱스로 TEXT 대상을 찾는다', () => {
    const { container, mutations } = run('<ul>\n  <li>a</li>\n  <!-- c -->\n  <li>b</li>\n</ul>', [
      { type: 'TEXT', path: [0, 1, 0], text: 'B' },
    ]);
    expectSameDOM(container, '<ul><li>a</li><li>B</li></ul>');
    expect(mutations).toBe(1);
  });

  it('공백이 섞인 형제 사이에서 REMOVE는 VNode 인덱스의 노드를 지운다', () => {
    const { container, mutations } = run('<ul>\n  <li>a</li>\n  <li>b</li>\n  <li>c</li>\n</ul>', [
      { type: 'REMOVE', path: [0, 1] },
    ]);
    expectSameDOM(container, '<ul><li>a</li><li>c</li></ul>');
    expect(mutations).toBe(1);
  });

  it('공백이 섞인 부모에서 CREATE index는 공백을 세지 않는다', () => {
    const { container } = run('<ul>\n  <li>a</li>\n  <li>c</li>\n</ul>', [
      { type: 'CREATE', path: [0], index: 1, node: el('li', {}, text('b')) },
    ]);
    expectSameDOM(container, '<ul><li>a</li><li>b</li><li>c</li></ul>');
  });

  it('연속 REMOVE를 내림차순으로 적용하면 인덱스가 밀리지 않는다', () => {
    const { container, mutations } = run('<p>0</p><p>1</p><p>2</p><p>3</p><p>4</p>', [
      { type: 'REMOVE', path: [4] },
      { type: 'REMOVE', path: [3] },
      { type: 'REMOVE', path: [2] },
    ]);
    expect(container.innerHTML).toBe('<p>0</p><p>1</p>');
    expect(mutations).toBe(3);
  });

  it('REPLACE는 대상 노드를 통째로 바꾸고 형제는 그대로 둔다', () => {
    const { container, mutations } = run('<p>a</p><p>b</p>', [
      { type: 'REPLACE', path: [1], node: el('h2', { id: 'z' }, text('b')) },
    ]);
    expect(container.innerHTML).toBe('<p>a</p><h2 id="z">b</h2>');
    expect(mutations).toBe(1);
  });

  it('PROPS는 set의 속성만 쓰고 remove의 속성만 지운다', () => {
    const { container, mutations } = run('<a href="x" class="k" id="i">t</a>', [
      { type: 'PROPS', path: [0], set: { href: 'y', title: 'new' }, remove: ['id'] },
    ]);
    const a = container.firstChild;
    expect(a.getAttribute('href')).toBe('y');
    expect(a.getAttribute('title')).toBe('new');
    expect(a.getAttribute('class')).toBe('k');
    expect(a.hasAttribute('id')).toBe(false);
    expect(mutations).toBe(3);
  });

  it('TEXT는 텍스트 노드 자체를 바꿔서 형제 엘리먼트를 건드리지 않는다', () => {
    const container = fromHTML('<p>hi <b>x</b></p>');
    const b = container.querySelector('b');
    patch(container, [{ type: 'TEXT', path: [0, 0], text: 'bye ' }]);
    expect(container.innerHTML).toBe('<p>bye <b>x</b></p>');
    expect(container.querySelector('b')).toBe(b);
  });

  it('알 수 없는 patch 타입은 에러를 던진다', () => {
    expect(() => run('<p>a</p>', [{ type: 'MOVE', path: [0] }])).toThrow();
  });
});
