// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent, useState } from '../../src/component/function-component.js';
import { createTextVNode } from '../../src/core/vnode.js';

test('여러 슬롯의 값과 setter를 유지하고 함수형 updater는 최신 값을 읽는다', () => {
  let state;
  const props = { initialCount: 1 };
  const component = new FunctionComponent(({ initialCount }) => {
    const [count, setCount] = useState(initialCount);
    const [label, setLabel] = useState(undefined);
    state = { count, label, setCount, setLabel };
    return createTextVNode(count);
  }, props);
  component.mount(document.createElement('main'));
  const { setCount, setLabel } = state;

  props.initialCount = 100;
  setLabel('ready');
  setCount(5);
  setCount((count) => count + 2);
  setCount((count) => count * 3);
  component.update();

  expect(state).toEqual({ count: 21, label: 'ready', setCount, setLabel });
  expect(component.hooks).toHaveLength(2);
});

test('루트 인스턴스마다 같은 위치에 별도의 상태를 저장한다', () => {
  const setters = new Map();
  function render({ id, initialValue }) {
    const [value, setValue] = useState(initialValue);
    setters.set(id, setValue);
    return createTextVNode(value);
  }

  const first = new FunctionComponent(render, { id: 'first', initialValue: 1 });
  const second = new FunctionComponent(render, { id: 'second', initialValue: 10 });
  first.mount(document.createElement('main'));
  second.mount(document.createElement('main'));

  setters.get('first')((value) => value + 1);
  expect(first.previousVNode.value).toBe('2');
  expect(second.previousVNode.value).toBe('10');
  setters.get('second')(20);
  expect(first.previousVNode.value).toBe('2');
  expect(second.previousVNode.value).toBe('20');
});

test('실패한 첫 렌더의 슬롯과 문맥을 정리해 마운트를 다시 시도할 수 있다', () => {
  const error = new Error('render failed');
  const props = { initialValue: 'first', shouldThrow: true };
  const component = new FunctionComponent(({ initialValue, shouldThrow }) => {
    const [value] = useState(initialValue);
    if (shouldThrow) throw error;
    return createTextVNode(value);
  }, props);
  const container = document.createElement('main');

  expect(() => component.update()).toThrow();
  expect(() => component.mount(container)).toThrow(error);
  expect(component.hooks).toHaveLength(0);
  expect(() => useState(0)).toThrow();

  props.initialValue = 'retry';
  props.shouldThrow = false;
  component.mount(container);
  expect(container.textContent).toBe('retry');
  expect(() => useState(0)).toThrow();
});

test('갱신 중 루트 함수에서 오류가 나면 DOM을 유지하고 상태값을 되돌린다', () => {
  const error = new Error('render failed');
  let setCount;
  const component = new FunctionComponent(() => {
    const [count, setter] = useState(0);
    setCount = setter;
    if (count === 10) throw error;
    return createTextVNode(count);
  }, {});
  const container = document.createElement('main');
  component.mount(container);
  const node = container.firstChild;
  const saved = component.previousVNode;

  expect(() => setCount(10)).toThrow(error);
  expect(component.previousVNode).toBe(saved);
  expect(container.firstChild).toBe(node);
  expect(container.textContent).toBe('0');

  setCount((count) => count + 1);
  expect(container.firstChild).toBe(node);
  expect(container.textContent).toBe('1');
});
