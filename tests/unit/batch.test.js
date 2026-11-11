// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent, useEffect, useState } from '../../src/component/function-component.js';
import { createTextVNode } from '../../src/core/vnode.js';

function mountCounter() {
  let setCount;
  const renders = [];
  const component = new FunctionComponent(() => {
    const [count, setter] = useState(0);
    setCount = setter;
    renders.push(count);
    return createTextVNode(count);
  }, {});
  const container = document.createElement('main');
  component.mount(container);
  return { component, container, renders, setCount };
}

test('중첩 배치는 바깥 배치에 합류하고 빈 배치는 렌더링하지 않는다', () => {
  const { component, container, renders, setCount } = mountCounter();
  const other = mountCounter();

  const result = component.batch(() => {
    setCount(2);
    component.batch(() => setCount((value) => value + 1));
    setCount((value) => value * 3);
    other.setCount(4);
    expect(other.container.textContent).toBe('4');
    expect(container.textContent).toBe('0');
    expect(() => component.update()).toThrow();
    expect(() => component.unmount()).toThrow();
    return 'done';
  });

  expect(result).toBe('done');
  component.batch(() => {});
  expect(container.textContent).toBe('9');
  expect(renders).toEqual([0, 9]);
});

test('비동기 콜백이 Promise를 반환하면 현재 배치를 끝내고 await 이후 갱신을 분리한다', async () => {
  const { component, container, renders, setCount } = mountCounter();
  let resume;
  const boundary = new Promise((resolve) => { resume = resolve; });

  const result = component.batch(async () => {
    setCount((value) => value + 1);
    setCount((value) => value + 1);
    await boundary;
    setCount((value) => value + 1);
    setCount((value) => value + 1);
    return 'done';
  });

  expect(container.textContent).toBe('2');
  expect(renders).toEqual([0, 2]);
  resume();
  await expect(result).resolves.toBe('done');
  expect(container.textContent).toBe('4');
  expect(renders).toEqual([0, 2, 3, 4]);
});

test('콜백의 동기 오류는 배치를 폐기하고 앞선 updater도 실행하지 않는다', () => {
  const { component, container, renders, setCount } = mountCounter();
  const failure = new Error('callback failed');
  const applied = [];

  expect(() => component.batch(() => {
    setCount((value) => { applied.push(value); return value + 5; });
    throw failure;
  })).toThrow(failure);

  expect(applied).toEqual([]);
  expect(renders).toEqual([0]);
  component.batch(() => setCount((value) => value + 1));
  expect(container.textContent).toBe('1');
});

test('중간 updater가 실패하면 앞서 같은 슬롯에 적용한 변경도 모두 되돌린다', () => {
  const { component, container, renders, setCount } = mountCounter();
  const failure = new Error('updater failed');

  expect(() => component.batch(() => {
    setCount(5);
    setCount((value) => value * 2);
    setCount(() => { throw failure; });
  })).toThrow(failure);

  expect(renders).toEqual([0]);
  setCount((value) => value + 1);
  expect(container.textContent).toBe('1');
});

test('배치 적용에 실패한 비동기 콜백은 적용 오류를 전달하고 후속 거부를 처리한다', async () => {
  const { component, container, setCount } = mountCounter();
  const failure = new Error('updater failed');
  let resume;
  const boundary = new Promise((resolve) => { resume = resolve; });

  expect(() => component.batch(async () => {
    setCount(() => { throw failure; });
    await boundary;
    throw new Error('async callback failed');
  })).toThrow(failure);

  resume();
  await boundary;
  expect(container.textContent).toBe('0');
});

test('Effect 안의 명시적 배치는 한 번의 후속 렌더링으로 반영한다', () => {
  const renders = [];
  const component = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    renders.push(count);
    useEffect(() => component.batch(() => {
      setCount((value) => value + 1);
      setCount((value) => value + 1);
    }), []);
    return createTextVNode(count);
  }, {});
  const container = document.createElement('main');

  component.mount(container);
  expect(container.textContent).toBe('2');
  expect(renders).toEqual([0, 2]);
});
