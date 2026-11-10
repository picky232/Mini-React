// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import page from '../../index.html?raw';
import { startDemo } from '../../src/app/main.js';
import { diff } from '../../src/core/diff.js';
import { UnsafeInputError } from '../../src/core/security.js';
import { h } from '../../src/core/vnode.js';
import { domToVNode } from '../../src/dom/from-dom.js';
import { applyPatches } from '../../src/dom/patch.js';
import { replaceDOMTree } from '../../src/dom/render.js';
import { FunctionComponent, child, memo, useEffect, useMemo, useState } from '../../src/component/function-component.js';

const P = { attrs: {}, events: {} };
const list = (keys) => h('ul', P, keys.map((key) => h('li', { ...P, key }, [key])));

describe('key 재조정', () => {
  test('맨 앞에 하나를 넣으면 INSERT 1건이고 기존 li 노드를 그대로 쓴다', () => {
    const container = document.createElement('div');
    const before = list(['a', 'b', 'c']);
    replaceDOMTree(container, before);
    const [a, b, c] = container.firstChild.childNodes;
    const patches = diff(before, list(['x', 'a', 'b', 'c']));
    expect(patches.map((patch) => patch.type)).toEqual(['INSERT']);
    applyPatches(container, patches);
    expect(container.textContent).toBe('xabc');
    expect([...container.firstChild.childNodes].slice(1)).toEqual([a, b, c]);
  });

  test('순서를 바꾸면 MOVE로 옮기고 노드를 다시 만들지 않는다', () => {
    const container = document.createElement('div');
    const before = list(['a', 'b', 'c', 'd']);
    replaceDOMTree(container, before);
    const nodes = [...container.firstChild.childNodes];
    const patches = diff(before, list(['d', 'b', 'a', 'c']));
    expect(patches.every((patch) => patch.type === 'MOVE')).toBe(true);
    applyPatches(container, patches);
    expect(container.textContent).toBe('dbac');
    expect(new Set(container.firstChild.childNodes)).toEqual(new Set(nodes));
  });
});

describe('위험한 입력은 Phase 1과 Phase 2 모두 h()에서 막힌다', () => {
  test.each([
    ['<script>alert(1)</script>'],
    ['<img src="x" onerror="alert(1)">'],
    ['<a href=" java\tscript:alert(1)">x</a>'],
    ['<iframe src="https://example.com"></iframe>'],
  ])('DOM → VNode: %s', (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(() => domToVNode(div)).toThrow(UnsafeInputError);
  });

  test('컴포넌트의 h()도 같은 규칙으로 막는다', () => {
    expect(() => h('a', { attrs: { href: 'JavaScript:alert(1)' }, events: {} })).toThrow(UnsafeInputError);
    expect(() => h('div', { attrs: { ONCLICK: 'alert(1)' }, events: {} })).toThrow(UnsafeInputError);
    expect(() => h('script', P)).toThrow(UnsafeInputError);
    expect(h('a', { attrs: { href: 'https://example.com' }, events: {} }).props.attrs.href).toBe('https://example.com');
  });
});

describe('Hook은 루트 컴포넌트에서만 쓴다', () => {
  test('child()로 실행한 자식이 useState를 부르면 오류가 난다', () => {
    const Child = () => { useState(0); return h('span', P, ['c']); };
    const root = new FunctionComponent(() => h('div', P, [child(Child, {})]), {});
    expect(() => root.mount(document.createElement('div'))).toThrow(/루트 컴포넌트에서만/);
  });

  test('자식은 props만 받아 그리고, 루트의 상태 변경이 자식까지 반영된다', () => {
    let setCount;
    const Count = ({ count }) => h('span', P, [count]);
    const container = document.createElement('div');
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('div', P, [child(Count, { count })]);
    }, {});
    root.mount(container);
    setCount(1);
    expect(container.textContent).toBe('1');
  });
});

describe('Phase 1 페이지', () => {
  function mount() {
    document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
    const $ = (id) => document.getElementById(id);
    startDemo({ actual: $('actual'), test: $('test'), patchButton: $('patch'), undoButton: $('undo'), redoButton: $('redo'), status: $('status') });
    return { actual: $('actual'), draft: $('test'), patch: $('patch'), status: $('status') };
  }

  test('주석이 든 초안도 주석만 빼고 반영한다', () => {
    const { actual, draft, patch } = mount();
    const title = draft.querySelector('h3');
    title.textContent = '새 제목';
    title.append(document.createComment('memo'));
    patch.click();
    expect(actual.querySelector('h3').innerHTML).toBe('새 제목');
  });

  test('막힌 입력은 이유를 상태 메시지로 보여 준다', () => {
    const { draft, patch, status } = mount();
    draft.querySelector('a, p').setAttribute('onmouseover', 'alert(1)');
    patch.click();
    expect(status.textContent).toContain('막힌 입력: onmouseover');
  });
});

describe('onCommit', () => {
  test('Effect가 끝난 뒤 불리고, 여기서 난 오류는 커밋을 깨뜨리지 않는다', () => {
    const order = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    const root = new FunctionComponent(() => {
      useEffect(() => { order.push('effect'); }, []);
      return h('p', P, ['x']);
    }, {});
    root.onCommit = () => { order.push('commit'); throw new Error('도구 오류'); };
    root.mount(container);
    expect(order).toEqual(['effect', 'commit']);
    expect(container.innerHTML).toBe('<p>x</p>');
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('memo와 같은 값 건너뛰기', () => {
  test('props가 그대로인 줄은 다시 실행하지 않고, 바뀐 줄만 다시 실행한다', () => {
    const calls = [];
    const Row = memo(({ key, done, onToggle }) => { calls.push(key); return h('li', { ...P, key }, [done ? 'v' : 'o']); });
    let toggle;
    const container = document.createElement('div');
    const root = new FunctionComponent(() => {
      const [done, setDone] = useState(/** @type {string[]} */ ([]));
      const onToggle = useMemo(() => (key) => setDone((list) => [...list, key]), []);
      toggle = onToggle;
      return h('ul', P, ['a', 'b', 'c'].map((key) => child(Row, { key, done: done.includes(key), onToggle })));
    }, {});
    root.mount(container);
    const before = [...container.firstChild.childNodes];
    calls.length = 0;
    toggle('b');
    expect(calls).toEqual(['b']);
    expect(container.textContent).toBe('ovo');
    expect([...container.firstChild.childNodes]).toEqual(before);
  });

  test('setState에 지금과 같은 값을 넣으면 렌더하지 않는다', () => {
    let renders = 0;
    let set;
    const root = new FunctionComponent(() => {
      renders += 1;
      const [value, setValue] = useState('all');
      set = setValue;
      return h('p', P, [value]);
    }, {});
    root.mount(document.createElement('div'));
    set('all');
    set((value) => value);
    expect(renders).toBe(1);
    set('done');
    expect(renders).toBe(2);
  });
});
