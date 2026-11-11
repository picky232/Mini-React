// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent, useState } from '../../src/component/function-component.js';
import { h } from '../../src/core/vnode.js';

test('자식에 전달한 핸들러로 상태를 갱신하고 기존 DOM 노드를 유지한다', () => {
  function CounterButton({ count, increment }) {
    return h('button', { attrs: {}, events: { click: increment } }, [count]);
  }

  function Counter() {
    const [count, setCount] = useState(0);
    return h('section', null, [
      CounterButton({ count, increment: () => setCount((value) => value + 1) }),
      h('p', null, ['고정 문구']),
    ]);
  }

  const container = document.createElement('main');
  const component = new FunctionComponent(Counter, {});
  component.mount(container);
  const root = container.firstChild;
  const button = container.querySelector('button');
  const countText = button.firstChild;
  const note = container.querySelector('p');

  button.click();
  expect(button.textContent).toBe('1');
  button.click();
  expect(button.textContent).toBe('2');
  expect(container.firstChild).toBe(root);
  expect(container.querySelector('button')).toBe(button);
  expect(button.firstChild).toBe(countText);
  expect(container.querySelector('p')).toBe(note);
  expect(note.textContent).toBe('고정 문구');
});

test('앞선 Patch가 적용된 뒤 실패하면 DOM과 VNode 및 상태를 복구한다', () => {
  let setCounter;
  const component = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    setCounter = setCount;
    return h('section', null, [
      h('button', { attrs: {}, events: { click: () => setCount((value) => value + 1) } }, [count]),
      // 두 번째 자식의 속성명은 DOM에서 거절한다. 첫 번째 자식의 TEXT Patch는 이미 적용된다.
      h('p', { attrs: count === 99 ? { 'bad name': 'invalid' } : {}, events: {} }, ['유지']),
    ]);
  }, {});

  const container = document.createElement('main');
  component.mount(container);
  const saved = component.previousVNode;
  const countText = container.querySelector('button').firstChild;
  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, characterData: true, characterDataOldValue: true });
  try {
    expect(() => setCounter(99)).toThrow(TypeError);
    expect(observer.takeRecords()).toContainEqual(expect.objectContaining({
      type: 'characterData', target: countText, oldValue: '0',
    }));
  } finally {
    observer.disconnect();
  }

  expect(component.previousVNode).toBe(saved);
  expect(container.innerHTML).toBe('<section><button>0</button><p>유지</p></section>');

  // 복구된 버튼의 이벤트와 함수형 updater로 복구된 상태에서 다시 갱신한다.
  const restoredButton = container.querySelector('button');
  restoredButton.click();
  expect(container.querySelector('button')).toBe(restoredButton);
  expect(container.innerHTML).toBe('<section><button>1</button><p>유지</p></section>');
  expect(component.previousVNode).not.toBe(saved);
});
