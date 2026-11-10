// 컴포넌트마다 상태를 갖고, 바뀐 컴포넌트만 다시 실행하는지 확인한다
import { describe, it, expect, vi } from 'vitest';
import { h, memo, FunctionComponent, useState, useEffect } from '../src/component.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(fn, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const c = new FunctionComponent(fn, props);
  const commits = [];
  c.onCommit = (info) => commits.push(info);
  c.mount(container);
  return { c, container, commits };
}

const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('컴포넌트별 상태', () => {
  it('같은 컴포넌트를 두 번 쓰면 상태가 따로 있다', async () => {
    const Toggle = ({ name }) => {
      const [on, setOn] = useState(false);
      return h('button', { onClick: () => setOn(!on) }, `${name}:${on ? 'on' : 'off'}`);
    };
    const { container } = mount(() => h('div', null, h(Toggle, { name: 'a' }), h(Toggle, { name: 'b' })));
    click(container.querySelectorAll('button')[0]);
    await flush();
    expect(container.textContent).toBe('a:onb:off');
  });

  it('자식이 setState하면 그 자식만 다시 실행한다', async () => {
    const calls = { app: 0, sibling: 0, child: 0 };
    const Sibling = () => { calls.sibling++; return h('p', null, 'sib'); };
    const Child = () => {
      calls.child++;
      const [n, setN] = useState(0);
      return h('button', { onClick: () => setN(n + 1) }, n);
    };
    const { container, commits } = mount(() => { calls.app++; return h('div', null, h(Sibling), h(Child)); });
    click(container.querySelector('button'));
    await flush();
    expect(container.innerHTML).toBe('<div><p>sib</p><button>1</button></div>');
    expect(calls).toEqual({ app: 1, sibling: 1, child: 2 });
    expect(commits.at(-1).patches.map((p) => p.type)).toEqual(['TEXT']);
  });

  it('자식 출력이 null ↔ 요소로 바뀌어도 형제 사이 제자리에 들어간다', async () => {
    let setShow;
    const Badge = () => { const [show, s] = useState(false); setShow = s; return show ? h('span', null, 'NEW') : null; };
    const { container } = mount(() => h('ul', null, h('li', null, '우유'), h(Badge), h('li', null, '빵')));
    setShow(true);
    await flush();
    expect(container.innerHTML).toBe('<ul><li>우유</li><span>NEW</span><li>빵</li></ul>');
    setShow(false);
    await flush();
    expect(container.innerHTML).toBe('<ul><li>우유</li><li>빵</li></ul>');
    setShow(true);
    await flush();
    expect(container.innerHTML).toBe('<ul><li>우유</li><span>NEW</span><li>빵</li></ul>');
  });

  it('자식이 여러 노드(배열)를 돌려줘도 제자리에 들어간다', async () => {
    let setItems;
    const Group = () => { const [items, s] = useState(['A', 'B']); setItems = s; return items.map((t) => h('li', null, t)); };
    const { container } = mount(() => h('ul', null, h('li', null, '우유'), h(Group), h('li', null, '빵')));
    setItems(['A', 'B', 'C']);
    await flush();
    expect(container.innerHTML).toBe('<ul><li>우유</li><li>A</li><li>B</li><li>C</li><li>빵</li></ul>');
    setItems(['A']);
    await flush();
    expect(container.innerHTML).toBe('<ul><li>우유</li><li>A</li><li>빵</li></ul>');
  });

  it('부모가 자식 출력을 그대로 돌려줘도 연속 업데이트가 맞다', async () => {
    let setN;
    const Inner = () => { const [n, s] = useState(0); setN = s; return h('p', { class: `n${n}` }, n); };
    const Wrapper = () => h(Inner);
    const { container } = mount(() => h('div', null, h(Wrapper)));
    setN(1);
    await flush();
    expect(container.innerHTML).toBe('<div><p class="n1">1</p></div>');
    setN(2);
    await flush();
    expect(container.innerHTML).toBe('<div><p class="n2">2</p></div>');
  });

  it('부모와 자식이 한 번에 바뀌면 렌더 1번, 자식 실행 1번', async () => {
    let setLabel;
    let setN;
    const calls = { child: 0 };
    const Child = ({ label }) => { calls.child++; const [n, s] = useState(0); setN = s; return h('p', null, `${label}${n}`); };
    const { container, commits } = mount(() => { const [label, s] = useState('a'); setLabel = s; return h('div', null, h(Child, { label })); });
    const before = commits.length;
    setN(1);
    setLabel('b');
    await flush();
    expect(container.textContent).toBe('b1');
    expect(commits.length).toBe(before + 1);
    expect(calls.child).toBe(2);
  });
});

describe('트리 모양이 복잡할 때', () => {
  it('memo로 건너뛴 부모 아래 자식이 루트와 함께 바뀌어도 반영된다', async () => {
    let setRoot;
    let setLeaf;
    const Leaf = () => { const [n, s] = useState(0); setLeaf = s; return h('b', null, n); };
    const Middle = memo(() => h('section', null, h(Leaf)));
    const { container } = mount(() => { const [x, s] = useState(0); setRoot = s; return h('div', null, h('i', null, x), h(Middle)); });
    setRoot(1);
    setLeaf(7);
    await flush();
    expect(container.innerHTML).toBe('<div><i>1</i><section><b>7</b></section></div>');
  });

  it('children으로 넘긴 자식이 다른 컴포넌트 출력 안에 있어도 연속 업데이트가 맞다', async () => {
    let setN;
    const Item = () => { const [n, s] = useState(0); setN = s; return h('p', null, n); };
    const Layout = ({ children }) => h('main', null, h('h1', null, 'T'), children);
    const { container } = mount(() => h(Layout, null, h(Item)));
    setN(1);
    await flush();
    setN(2);
    await flush();
    expect(container.innerHTML).toBe('<main><h1>T</h1><p>2</p></main>');
  });
});

describe('상자 지우기와 memo', () => {
  it('목록에서 빠진 항목은 effect cleanup이 실행되고, 그 뒤 setState는 무시된다', async () => {
    const cleanup = vi.fn();
    const setters = {};
    const Item = ({ id }) => {
      const [n, s] = useState(0);
      setters[id] = s;
      useEffect(() => () => cleanup(id), []);
      return h('li', null, `${id}${n}`);
    };
    let setIds;
    const { container, c } = mount(() => { const [ids, s] = useState(['a', 'b']); setIds = s; return h('ul', null, ids.map((id) => h(Item, { key: id, id }))); });
    setIds(['b']);
    await flush();
    expect(cleanup.mock.calls).toEqual([['a']]);
    expect(container.innerHTML).toBe('<ul><li>b0</li></ul>');
    const renders = c.renderCount;
    setters.a(5);
    await flush();
    expect(c.renderCount).toBe(renders);
  });

  it('memo로 건너뛴 자식도 자기 상태를 유지하고, 자기 상태가 바뀌면 다시 실행된다', async () => {
    let setN;
    let setOuter;
    const calls = vi.fn();
    const Counter = memo(() => { calls(); const [n, s] = useState(0); setN = s; return h('b', null, n); });
    const { container, commits } = mount(() => { const [x, s] = useState(0); setOuter = s; return h('div', null, h('i', null, x), h(Counter)); });
    setN(3);
    await flush();
    setOuter(1);
    await flush();
    expect(container.innerHTML).toBe('<div><i>1</i><b>3</b></div>');
    expect(commits.at(-1).memoHits).toBe(1);
    expect(calls).toHaveBeenCalledTimes(2); // mount 1 + 자기 setState 1. 부모 리렌더 때는 건너뜀
  });

  it('key 순서를 바꿔도 상태가 항목을 따라간다', async () => {
    const Toggle = ({ id }) => {
      const [on, setOn] = useState(false);
      return h('li', null, h('button', { onClick: () => setOn(true) }, `${id}${on ? '!' : ''}`));
    };
    let setIds;
    const { container } = mount(() => { const [ids, s] = useState(['a', 'b', 'c']); setIds = s; return h('ul', null, ids.map((id) => h(Toggle, { key: id, id }))); });
    click(container.querySelectorAll('button')[0]);
    await flush();
    setIds(['c', 'b', 'a']);
    await flush();
    expect(container.textContent).toBe('cba!');
  });
});

describe('effect와 이벤트', () => {
  it('effect는 자식 → 부모 순서로 실행된다', () => {
    const log = [];
    const Child = () => { useEffect(() => { log.push('child'); }); return h('p', null); };
    mount(() => { useEffect(() => { log.push('parent'); }); return h('div', null, h(Child)); });
    expect(log).toEqual(['child', 'parent']);
  });

  it('자식만 다시 그린 뒤에도 클릭하면 최신 핸들러가 불린다', async () => {
    const Child = () => { const [n, setN] = useState(0); return h('button', { onClick: () => setN(n + 1) }, n); };
    const { container } = mount(() => h('div', null, h(Child)));
    for (let i = 0; i < 3; i++) {
      click(container.querySelector('button'));
      await flush();
    }
    expect(container.textContent).toBe('3');
  });
});
