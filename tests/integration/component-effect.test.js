// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent, useEffect, useState } from '../../src/component/function-component.js';
import { h } from '../../src/core/vnode.js';

test('빈 의존성 Effect가 한 번만 실행되고 예약한 갱신이 DOM을 0에서 1로 바꾼다', () => {
  const calls = [];
  const container = document.createElement('main');
  const component = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    useEffect(() => {
      calls.push(['effect', container.textContent]);
      setCount((value) => value + 1);
      calls.push(['after setter', container.textContent]);
      return () => { calls.push(['cleanup']); };
    }, []);
    return h('p', null, [count]);
  }, {});

  component.mount(container);
  expect(container.textContent).toBe('1');
  expect(calls).toEqual([['effect', '0'], ['after setter', '0']]);

  component.unmount();
  expect(calls).toEqual([['effect', '0'], ['after setter', '0'], ['cleanup']]);
});

test('같은 Effect 실행에서 예약한 함수형 갱신을 최신 상태로 하나씩 반영한다', () => {
  const values = [];
  const container = document.createElement('main');
  const component = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    useEffect(() => {
      setCount((value) => value + 1);
      setCount((value) => value * 2);
    }, []);
    useEffect(() => {
      values.push(container.textContent);
      if (count === 1) setCount((value) => value + 3);
    }, [count]);
    return h('p', null, [count]);
  }, {});

  component.mount(container);
  expect(values).toEqual(['0', '1', '2', '5']);
  expect(container.textContent).toBe('5');
  component.unmount();
});

test('마운트와 갱신 뒤 DOM을 읽고 의존성 변경과 해제에서 cleanup을 실행한다', () => {
  const calls = [];
  const container = document.createElement('main');
  document.body.append(container);

  function Counter() {
    const [count, setCount] = useState(0);
    calls.push(['render', count, container.textContent]);
    useEffect(() => {
      calls.push(['effect', count, container.textContent]);
      return () => { calls.push(['cleanup', count, container.textContent]); };
    }, [count]);
    return h('button', { attrs: {}, events: { click: () => setCount((value) => value + 1) } }, [count]);
  }

  const component = new FunctionComponent(Counter, {});
  component.mount(container);
  component.update();
  const button = container.querySelector('button');
  button.click();
  expect(container.firstChild).toBe(button);

  component.unmount();
  component.unmount();
  expect(container.firstChild).toBeNull();
  expect(calls).toEqual([
    ['render', 0, ''],
    ['effect', 0, '0'],
    ['render', 0, '0'],
    ['render', 1, '0'],
    ['cleanup', 0, '1'],
    ['effect', 1, '1'],
    ['cleanup', 1, ''],
  ]);
});

test('Patch가 실패한 렌더에서는 Effect를 실행하지 않고 기존 cleanup을 유지한다', () => {
  const calls = [];
  let setCount;
  const component = new FunctionComponent(() => {
    const [count, setter] = useState(0);
    setCount = setter;
    useEffect(() => {
      calls.push(['effect', count]);
      return () => { calls.push(['cleanup', count]); };
    }, [count]);
    return h('section', null, [
      h('p', null, [count]),
      h('span', { attrs: count === 99 ? { 'bad name': 'invalid' } : {}, events: {} }),
    ]);
  }, {});

  const container = document.createElement('main');
  component.mount(container);
  expect(() => setCount(99)).toThrow(TypeError);
  expect(container.textContent).toBe('0');
  expect(calls).toEqual([['effect', 0]]);

  setCount((count) => count + 1);
  expect(container.textContent).toBe('1');
  expect(calls).toEqual([['effect', 0], ['cleanup', 0], ['effect', 1]]);
  component.unmount();
  expect(calls.at(-1)).toEqual(['cleanup', 1]);
});
