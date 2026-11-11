// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent, useEffect, useState } from '../../src/component/function-component.js';
import { h } from '../../src/core/vnode.js';

test('같은 클릭의 setter 세 번을 배치하면 렌더링이 세 번에서 한 번으로 줄어든다', () => {
  const renders = [];
  const effects = [];
  const container = document.createElement('main');
  const component = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    renders.push(count);
    useEffect(() => { effects.push(container.querySelector('output').textContent); }, [count]);
    const incrementThreeTimes = () => {
      setCount((value) => value + 1);
      setCount((value) => value + 1);
      setCount((value) => value + 1);
    };
    return h('section', null, [
      h('button', { attrs: {}, events: { click: incrementThreeTimes } }, ['일반 갱신']),
      h('button', { attrs: {}, events: { click: () => component.batch(incrementThreeTimes) } }, ['배치 갱신']),
      h('output', null, [count]),
    ]);
  }, {});
  component.mount(container);
  const [normal, batched] = container.querySelectorAll('button');
  const output = container.querySelector('output');

  normal.click();
  expect(renders).toEqual([0, 1, 2, 3]);
  batched.click();
  expect(renders).toEqual([0, 1, 2, 3, 6]);
  expect(effects).toEqual(['0', '1', '2', '3', '6']);
  expect(container.querySelector('output')).toBe(output);
  expect(output.textContent).toBe('6');
});

test('배치의 Patch가 실패하면 DOM과 여러 상태 슬롯을 복구한다', () => {
  let setters;
  const component = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    const [label, setLabel] = useState('ready');
    setters = { setCount, setLabel };
    return h('section', null, [
      h('output', null, [`${count}:${label}`]),
      h('p', { attrs: label === 'invalid' ? { 'bad name': 'invalid' } : {}, events: {} }),
    ]);
  }, {});
  const container = document.createElement('main');
  component.mount(container);
  const committed = component.previousVNode;
  const { setCount, setLabel } = setters;

  expect(() => component.batch(() => {
    setCount((value) => value + 1);
    setCount((value) => value + 1);
    setLabel('invalid');
  })).toThrow(TypeError);

  expect(component.previousVNode).toBe(committed);
  expect(container.textContent).toBe('0:ready');
  component.batch(() => {
    setCount((value) => value + 1);
    setLabel((value) => `${value}!`);
  });
  expect(container.textContent).toBe('1:ready!');
});
