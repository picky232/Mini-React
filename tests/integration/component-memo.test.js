// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import { FunctionComponent, useEffect, useMemo, useState } from '../../src/component/function-component.js';
import { h } from '../../src/core/vnode.js';

test('State 갱신 중 Memo 결과를 재사용하면 그 결과에 의존하는 Effect도 건너뛴다', () => {
  const calculate = vi.fn((value) => ({ doubled: value * 2 }));
  const observed = [];
  const container = document.createElement('main');
  const component = new FunctionComponent(() => {
    const [value, setValue] = useState(2);
    const memo = useMemo(() => calculate(value), [value]);
    const [tick, setTick] = useState(0);
    useEffect(() => { observed.push(container.querySelector('output').textContent); }, [memo]);
    return h('section', null, [
      h('button', { attrs: { id: 'tick' }, events: { click: () => setTick(tick + 1) } }, [tick]),
      h('button', { attrs: { id: 'value' }, events: { click: () => setValue(value + 1) } }, [value]),
      h('output', null, [memo.doubled]),
    ]);
  }, {});

  component.mount(container);
  const tickButton = container.querySelector('#tick');
  const output = container.querySelector('output');
  tickButton.click();
  expect(tickButton.textContent).toBe('1');
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(observed).toEqual(['4']);

  container.querySelector('#value').click();
  expect(calculate).toHaveBeenCalledTimes(2);
  expect(observed).toEqual(['4', '6']);
  expect(container.querySelector('#tick')).toBe(tickButton);
  expect(container.querySelector('output')).toBe(output);
  expect(output.textContent).toBe('6');
});

test('Patch가 실패하면 마지막으로 반영된 렌더의 Memo 결과를 유지한다', () => {
  const calculate = vi.fn((value) => value * 2);
  let setValue;
  const component = new FunctionComponent(() => {
    const [value, setter] = useState(1);
    setValue = setter;
    const doubled = useMemo(() => calculate(value), [value]);
    return h('section', null, [
      h('output', null, [doubled]),
      h('span', { attrs: value === 2 ? { 'bad name': 'invalid' } : {}, events: {} }),
    ]);
  }, {});
  const container = document.createElement('main');
  component.mount(container);

  expect(() => setValue(2)).toThrow(TypeError);
  expect(container.textContent).toBe('2');
  expect(calculate.mock.calls).toEqual([[1], [2]]);

  component.update();
  expect(calculate.mock.calls).toEqual([[1], [2]]);
  setValue(3);
  expect(container.textContent).toBe('6');
  expect(calculate.mock.calls).toEqual([[1], [2], [3]]);
});
