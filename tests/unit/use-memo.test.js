// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import { FunctionComponent, useMemo } from '../../src/component/function-component.js';
import { createTextVNode } from '../../src/core/vnode.js';

test('같은 의존성은 결과 참조를 재사용하고 값이나 길이가 바뀌면 다시 계산한다', () => {
  const calculate = vi.fn((dependencies) => ({ total: dependencies.reduce((sum, value) => sum + value, 0) }));
  const props = { dependencies: [1] };
  const results = [];
  const component = new FunctionComponent(({ dependencies }) => {
    const result = useMemo(() => calculate(dependencies), dependencies);
    results.push(result);
    return createTextVNode(result.total);
  }, props);

  component.mount(document.createElement('main'));
  expect(calculate).toHaveBeenCalledTimes(1);
  props.dependencies = [1];
  component.update();
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(results[1]).toBe(results[0]);

  props.dependencies = [2];
  component.update();
  props.dependencies = [2, 3];
  component.update();
  expect(calculate).toHaveBeenCalledTimes(3);
  expect(results.map(({ total }) => total)).toEqual([1, 1, 2, 5]);
  expect(results[2]).not.toBe(results[1]);
  expect(results[3]).not.toBe(results[2]);
});

test('NaN은 재사용하고 +0에서 -0으로 바뀌면 같은 배열이어도 다시 계산한다', () => {
  const dependencies = [NaN, +0];
  const calculate = vi.fn(() => Object.is(dependencies[1], -0) ? 'negative' : 'positive');
  const component = new FunctionComponent(() => createTextVNode(useMemo(calculate, dependencies)), {});
  const container = document.createElement('main');

  component.mount(container);
  component.update();
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe('positive');

  dependencies[1] = -0;
  component.update();
  expect(calculate).toHaveBeenCalledTimes(2);
  expect(container.textContent).toBe('negative');
});

test('한 Memo 슬롯이 바뀌어도 다른 슬롯의 undefined 결과를 재사용한다', () => {
  const props = { count: 1 };
  const calculateCount = vi.fn((count) => count * 2);
  const calculateEmpty = vi.fn(() => undefined);
  const component = new FunctionComponent(({ count }) => {
    const doubled = useMemo(() => calculateCount(count), [count]);
    const empty = useMemo(calculateEmpty, []);
    return createTextVNode(`${doubled}:${empty}`);
  }, props);
  const container = document.createElement('main');

  component.mount(container);
  props.count = 2;
  component.update();
  expect(container.textContent).toBe('4:undefined');
  expect(calculateCount).toHaveBeenCalledTimes(2);
  expect(calculateEmpty).toHaveBeenCalledTimes(1);
});

test('루트 렌더 문맥과 의존성 배열을 요구한다', () => {
  expect(() => useMemo(() => 1, [])).toThrow('useMemo requires a rendering root component.');

  const component = new FunctionComponent(() => createTextVNode(useMemo(() => 1)), {});
  const container = document.createElement('main');
  expect(() => component.mount(container)).toThrow(TypeError);
  expect(container.firstChild).toBeNull();
});
