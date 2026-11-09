import { describe, it, expect, vi } from 'vitest';
import { h, memo, FunctionComponent, useState, useEffect, useMemo } from '../src/component.js';
import { containerToVNode, createElement } from '../src/vdom.js';

// 예약된 리렌더(queueMicrotask)가 끝날 때까지 기다린다
const flush = () => new Promise((r) => setTimeout(r, 0));

/** 컴포넌트를 새 div에 mount하고 [인스턴스, 컨테이너, commit 기록]을 돌려준다 */
function mount(fn, props) {
  const container = document.createElement('div');
  document.body.appendChild(container); // focus·이벤트 버블링 확인용으로 문서에 붙인다
  const c = new FunctionComponent(fn, props);
  const commits = [];
  c.onCommit = (info) => commits.push(info);
  c.mount(container);
  return { c, container, commits };
}

const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('h: VNode 만들기', () => {
  it('Phase 1 계약 모양의 VNode를 만든다 (props는 문자열)', () => {
    expect(h('p', { id: 'a', 'data-n': 3, hidden: true, title: null, disabled: false }, 'hi')).toEqual({
      type: 'p', props: { id: 'a', 'data-n': '3', hidden: '' }, children: [{ type: '#text', text: 'hi' }], events: {},
    });
  });

  it('on으로 시작하는 함수는 events로, key는 key로 뺀다', () => {
    const fn = () => {};
    const v = h('button', { onClick: fn, key: 7, class: 'x' });
    expect(v.props).toEqual({ class: 'x' });
    expect(v.events).toEqual({ click: fn });
    expect(v.key).toBe('7');
  });

  it('자식: 배열은 펼치고, null·boolean은 버리고, 이웃 텍스트는 합치고, 공백만 남은 텍스트는 버린다', () => {
    const v = h('p', null, [1, 2], ' 개', null, false, true, undefined, h('b', null, ' '), '  ');
    expect(v.children).toEqual([{ type: '#text', text: '12 개' }, h('b', null)]);
  });

  it('h로 만든 VNode를 그린 DOM을 다시 읽으면 같은 모양이다 (path가 어긋나지 않는다)', () => {
    const v = h('div', { class: 'a' }, 'x', 0, h('span', null, ''), [h('i', null, 'y'), ' ', 'z']);
    const container = document.createElement('div');
    container.appendChild(createElement({ type: '#root', props: {}, children: [v] }));
    const strip = (n) => (n.type === '#text' ? n : { type: n.type, props: n.props, children: n.children.map(strip) });
    expect(containerToVNode(container).children[0]).toEqual(strip(v));
  });

  it('함수 type은 props와 children을 넘겨 바로 호출한다 (자식 컴포넌트)', () => {
    const Item = ({ label, children }) => h('li', null, label, children);
    expect(h(Item, { label: 'a' }, '!')).toEqual(h('li', null, 'a', '!'));
  });

  it('컴포넌트에 준 key는 결과 VNode에 붙는다', () => {
    const Item = () => h('li', null, 'a');
    expect(h(Item, { key: 'k' }).key).toBe('k');
  });
});

describe('useState', () => {
  it('setState 후 다시 렌더하고, 바뀐 부분만 patch한다 (노드는 그대로)', async () => {
    let set;
    const { container, commits } = mount(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('div', null, h('h1', null, 'count'), h('p', null, n));
    });
    const p = container.querySelector('p');
    set(5);
    expect(container.textContent).toBe('count0'); // 아직: 리렌더는 예약만 됐다
    await flush();
    expect(container.textContent).toBe('count5');
    expect(container.querySelector('p')).toBe(p); // 같은 DOM 노드를 고쳤다
    expect(commits.at(-1).patches).toEqual([{ type: 'TEXT', path: [0, 1, 0], text: '5' }]);
  });

  it('여러 번 렌더해도 상태가 유지되고, setState 함수는 렌더마다 같다', async () => {
    const seen = [];
    const { c } = mount(() => {
      const [a, setA] = useState('a');
      const [b] = useState('b');
      seen.push(setA);
      return h('p', null, a, b);
    });
    seen[0]('A');
    await flush();
    expect(c.hooks.map((x) => x.value)).toEqual(['A', 'b']);
    expect(seen[1]).toBe(seen[0]);
  });

  it('초기값이 함수면 첫 렌더에 한 번만 호출한다', async () => {
    const init = vi.fn(() => 1);
    let set;
    mount(() => { const [v, s] = useState(init); set = s; return h('p', null, v); });
    set(2);
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('같은 값(Object.is)이면 리렌더하지 않는다', async () => {
    let set;
    const { c } = mount(() => { const [v, s] = useState(NaN); set = s; return h('p', null, v); });
    set(NaN);
    await flush();
    expect(c.renderCount).toBe(1);
  });

  it('batching: 핸들러 안의 setState 3번은 렌더 1번으로 묶인다', async () => {
    const { c, container, commits } = mount(() => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => { setN((x) => x + 1); setN((x) => x + 1); setN((x) => x + 1); } }, n);
    });
    click(container.querySelector('button'));
    await flush();
    expect(container.textContent).toBe('3'); // 함수형 업데이트라 세 번 모두 반영
    expect(c.renderCount).toBe(2); // mount 1 + 리렌더 1
    expect(commits.at(-1).batched).toBe(3);
  });

  it('값으로 setState하면 같은 렌더의 오래된 값을 쓴다 (React와 같음)', async () => {
    const { container } = mount(() => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => { setN(n + 1); setN(n + 1); } }, n);
    });
    click(container.querySelector('button'));
    await flush();
    expect(container.textContent).toBe('1');
  });
});

describe('이벤트 위임', () => {
  it('두 번째 클릭은 새 렌더의 핸들러를 쓴다 (오래된 클로저 없음)', async () => {
    const { container } = mount(() => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => setN(n + 1) }, n);
    });
    const btn = container.querySelector('button');
    click(btn);
    await flush();
    click(btn);
    await flush();
    expect(container.textContent).toBe('2');
  });

  it('안쪽 → 바깥 순서로 버블링하고, stopPropagation이면 멈춘다', () => {
    const log = [];
    const { container } = mount(() => h('div', { onClick: () => log.push('div') },
      h('button', { id: 'a', onClick: () => log.push('a') }, h('span', null, 'A')),
      h('button', { id: 'b', onClick: (e) => { log.push('b'); e.stopPropagation(); } }, 'B')));
    click(container.querySelector('span'));
    click(container.querySelector('#b'));
    expect(log).toEqual(['a', 'div', 'b']);
  });

  it('submit 핸들러에서 preventDefault할 수 있다', () => {
    let prevented;
    const { container } = mount(() => h('form', { onSubmit: (e) => { e.preventDefault(); prevented = e.defaultPrevented; } }, h('button', null, 'go')));
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(prevented).toBe(true);
  });

  it('입력할 때마다 리렌더해도 input은 같은 노드라 focus가 유지되고, value를 비우면 화면도 비워진다', async () => {
    const { container } = mount(() => {
      const [text, setText] = useState('');
      return h('form', { onSubmit: (e) => { e.preventDefault(); setText(''); } },
        h('input', { value: text, onInput: (e) => setText(e.target.value) }),
        h('p', null, `${text.length}자`));
    });
    const input = container.querySelector('input');
    input.focus();
    input.value = '안녕';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(container.querySelector('p').textContent).toBe('2자');
    expect(container.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);

    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(input.value).toBe(''); // 속성만 바꾸면 이미 입력된 화면 값은 안 바뀐다 → 프로퍼티도 써야 함
  });

  it('checked도 프로퍼티까지 맞춘다 (사용자가 한 번 클릭한 체크박스)', async () => {
    let set;
    const { container } = mount(() => { const [on, s] = useState(false); set = s; return h('input', { type: 'checkbox', checked: on }); });
    const box = container.querySelector('input');
    box.click(); // 사용자가 켬 → 이후 checked 속성은 화면에 영향 없음
    set(true);
    await flush();
    set(false);
    await flush();
    expect(box.checked).toBe(false);
  });
});

describe('useEffect', () => {
  it('patch가 끝난 뒤 실행된다 (화면이 이미 새 값)', async () => {
    const seen = [];
    let set;
    mount(() => {
      const [n, s] = useState(0);
      set = s;
      // mount 중에도 실행되므로 mount의 반환값 대신 문서에서 찾는다
      useEffect(() => { seen.push(document.getElementById('fx').textContent); });
      return h('p', { id: 'fx' }, n);
    });
    set(1);
    await flush();
    expect(seen).toEqual(['0', '1']);
  });

  it('deps가 같으면 건너뛰고, 바뀌면 이전 cleanup을 먼저 부른 뒤 다시 실행한다', async () => {
    const log = [];
    let setA;
    let setB;
    mount(() => {
      const [a, sa] = useState(0);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      useEffect(() => { log.push(`run ${a}`); return () => log.push(`cleanup ${a}`); }, [a]);
      return h('p', null, a, b);
    });
    setB(1); // a는 그대로 → 실행 안 함
    await flush();
    setA(1);
    await flush();
    expect(log).toEqual(['run 0', 'cleanup 0', 'run 1']);
  });

  it('deps가 []면 처음 한 번만 실행하고, cleanup은 unmount에서 실행한다', async () => {
    const log = [];
    let set;
    const { c, container } = mount(() => {
      const [n, s] = useState(0);
      set = s;
      useEffect(() => { log.push('mount'); return () => log.push('unmount'); }, []);
      return h('p', null, n);
    });
    set(1);
    await flush();
    c.unmount();
    expect(log).toEqual(['mount', 'unmount']);
    expect(container.childNodes.length).toBe(0);
  });

  it('effect 안의 setState는 다음 렌더를 다시 예약한다', async () => {
    const { container } = mount(() => {
      const [n, setN] = useState(0);
      useEffect(() => { if (n < 3) setN(n + 1); }, [n]);
      return h('p', null, n);
    });
    for (let i = 0; i < 4; i++) await flush();
    expect(container.textContent).toBe('3');
  });
});

describe('useMemo', () => {
  it('deps가 같으면 다시 계산하지 않고 같은 값을 돌려준다', async () => {
    const compute = vi.fn((list) => list.filter((x) => x > 1));
    const results = [];
    let setOther;
    let setList;
    mount(() => {
      const [list, sl] = useState([1, 2, 3]);
      const [other, so] = useState(0);
      setOther = so;
      setList = sl;
      results.push(useMemo(() => compute(list), [list]));
      return h('p', null, other);
    });
    setOther(1);
    await flush();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(results[1]).toBe(results[0]);
    setList([5]);
    await flush();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(results[2]).toEqual([5]);
  });
});

describe('memo: props가 같으면 자식을 다시 부르지도, 비교하지도 않는다', () => {
  it('입력만 바뀌면 목록 항목은 한 번도 다시 호출되지 않는다', async () => {
    const calls = vi.fn();
    const Item = memo(({ text: t }) => { calls(t); return h('li', null, t); });
    let setText;
    const { container, commits } = mount(() => {
      const [text, st] = useState('');
      setText = st;
      const items = useMemo(() => ['a', 'b', 'c'], []);
      return h('div', null, h('input', { value: text }), h('ul', null, items.map((t) => h(Item, { key: t, text: t }))));
    });
    expect(calls).toHaveBeenCalledTimes(3);
    setText('x');
    await flush();
    expect(calls).toHaveBeenCalledTimes(3); // 다시 안 불림
    expect(commits.at(-1).memoHits).toBe(3);
    expect(commits.at(-1).patches.map((p) => p.type)).toEqual(['PROPS']); // input value만
    expect(container.querySelectorAll('li').length).toBe(3);
  });

  it('props가 바뀐 항목만 다시 호출한다', async () => {
    const calls = vi.fn();
    const Item = memo(({ t, done }) => { calls(t); return h('li', { class: done ? 'done' : null }, t); });
    let set;
    const { container } = mount(() => {
      const [todos, s] = useState([{ t: 'a', done: false }, { t: 'b', done: false }]);
      set = s;
      return h('ul', null, todos.map((x) => h(Item, { key: x.t, t: x.t, done: x.done })));
    });
    calls.mockClear();
    set((ts) => [ts[0], { ...ts[1], done: true }]);
    await flush();
    expect(calls.mock.calls).toEqual([['b']]);
    expect(container.innerHTML).toBe('<ul><li>a</li><li class="done">b</li></ul>');
  });
});

describe('hook 규칙을 코드로 강제한다', () => {
  it('자식 컴포넌트에서 hook을 부르면 에러', () => {
    const Child = () => { useState(0); return h('p', null); };
    expect(() => mount(() => h(Child))).toThrow(/루트 컴포넌트에서만/);
  });

  it('렌더 밖(이벤트 핸들러 등)에서 hook을 부르면 에러', () => {
    expect(() => useState(0)).toThrow(/렌더하는 중에만/);
  });

  it('조건문 때문에 hook 개수가 바뀌면 에러', async () => {
    const { c } = mount(({ on }) => { if (on) useState(1); return h('p', null); }, { on: true });
    c.props = { on: false };
    expect(() => c.update()).toThrow(/hook 개수가 바뀌었습니다/);
  });

  it('같은 칸에 다른 종류의 hook을 부르면 에러', () => {
    const { c } = mount(({ first }) => { if (first) useState(0); else useMemo(() => 0, []); return h('p', null); }, { first: true });
    c.props = { first: false };
    expect(() => c.update()).toThrow(/hook 순서가 바뀌었습니다/);
  });
});

describe('unmount', () => {
  it('이벤트 리스너를 떼고, 그 뒤의 setState는 무시한다', async () => {
    const onClick = vi.fn();
    let set;
    const { c, container } = mount(() => { const [n, s] = useState(0); set = s; return h('button', { onClick }, n); });
    const btn = container.querySelector('button');
    c.unmount();
    container.appendChild(btn);
    click(btn);
    set(1);
    await flush();
    expect(onClick).not.toHaveBeenCalled();
    expect(c.renderCount).toBe(1);
  });
});
