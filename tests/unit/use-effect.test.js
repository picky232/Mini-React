// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent, useEffect, useState } from '../../src/component/function-component.js';
import { createTextVNode } from '../../src/core/vnode.js';

test('빈 배열은 마운트마다 한 번 실행하고 의존성 생략은 DOM 변경이 없는 갱신에도 실행한다', () => {
  const calls = [];
  const component = new FunctionComponent(() => {
    useEffect(() => { calls.push('once'); }, []);
    useEffect(() => {
      calls.push('each');
      return () => { calls.push('cleanup'); };
    });
    return createTextVNode('same');
  }, {});
  const container = document.createElement('main');

  component.mount(container);
  component.update();
  expect(calls).toEqual(['once', 'each', 'cleanup', 'each']);

  component.unmount();
  component.unmount();
  expect(calls).toEqual(['once', 'each', 'cleanup', 'each', 'cleanup']);

  component.mount(container);
  expect(calls.slice(-2)).toEqual(['once', 'each']);
  component.unmount();
});

test('의존성 길이와 값을 Object.is로 비교하고 커밋 시점의 배열 값을 보관한다', () => {
  const calls = [];
  const props = { dependencies: [NaN, 0] };
  const component = new FunctionComponent(({ dependencies }) => {
    useEffect(() => { calls.push([...dependencies]); }, dependencies);
    return createTextVNode('same');
  }, props);

  expect(() => useEffect(() => {})).toThrow();
  component.mount(document.createElement('main'));
  props.dependencies = [NaN, 0];
  component.update();
  expect(calls).toEqual([[NaN, 0]]);

  props.dependencies[1] = -0;
  component.update();
  props.dependencies.pop();
  component.update();
  expect(calls).toEqual([[NaN, 0], [NaN, -0], [NaN]]);
});

test('Effect 오류를 전달해도 이미 반영된 DOM과 상태는 유지한다', () => {
  const failure = new Error('effect failed');
  const calls = [];
  let setCount;
  const component = new FunctionComponent(() => {
    const [count, setter] = useState(0);
    setCount = setter;
    useEffect(() => {
      if (count === 1) throw failure;
    }, [count]);
    useEffect(() => { calls.push(count); }, [count]);
    return createTextVNode(count);
  }, {});
  const container = document.createElement('main');
  component.mount(container);

  expect(() => setCount(1)).toThrow(failure);
  expect(container.textContent).toBe('1');
  expect(component.previousVNode.value).toBe('1');
  expect(calls).toEqual([0, 1]);

  setCount((count) => count + 1);
  expect(container.textContent).toBe('2');
});

test('해제 중 cleanup이 실패해도 나머지 cleanup을 실행하고 슬롯을 비운다', () => {
  const failure = new Error('cleanup failed');
  const calls = [];
  let setCount;
  const component = new FunctionComponent(() => {
    const [count, setter] = useState(0);
    setCount = setter;
    useEffect(() => () => { throw failure; }, []);
    useEffect(() => () => { calls.push('cleanup'); }, []);
    return createTextVNode(count);
  }, {});
  const container = document.createElement('main');
  component.mount(container);
  const previousSetter = setCount;

  expect(() => component.unmount()).toThrow(failure);
  expect(container.firstChild).toBeNull();
  expect(component.previousVNode).toBeNull();
  expect(component.hooks).toHaveLength(0);
  component.unmount();
  expect(calls).toEqual(['cleanup']);

  component.mount(container);
  expect(() => previousSetter(2)).toThrow();
  expect(container.textContent).toBe('0');
});
