// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';
import { FunctionComponent } from '../../src/component/function-component.js';
import { createTextVNode } from '../../src/core/vnode.js';

test('인스턴스마다 독립적인 빈 hooks 배열을 준비하고 생성 시 렌더링하지 않는다', () => {
  const render = vi.fn(() => createTextVNode('hello'));
  const first = new FunctionComponent(render, {});
  const second = new FunctionComponent(render, {});

  expect(first.hooks).toEqual([]);
  expect(second.hooks).toEqual([]);
  expect(first.hooks).not.toBe(second.hooks);
  expect(first.previousVNode).toBeNull();
  expect(render).not.toHaveBeenCalled();
});

test('마운트에 사용한 VNode 참조를 보관하고 두 번째 마운트를 거절한다', () => {
  const vnode = Object.freeze(createTextVNode(' \n'));
  const render = vi.fn(() => vnode);
  const component = new FunctionComponent(render, {});
  const container = document.createElement('main');
  const otherContainer = document.createElement('main');

  component.mount(container);
  const root = container.firstChild;
  expect(component.previousVNode).toBe(vnode);
  expect(root.nodeType).toBe(Node.TEXT_NODE);
  expect(root.data).toBe(' \n');

  expect(() => component.mount(otherContainer)).toThrow();
  expect(render).toHaveBeenCalledOnce();
  expect(container.firstChild).toBe(root);
  expect(otherContainer.firstChild).toBeNull();
});

test.each([null, undefined])('VNode 대신 %s를 반환하면 마운트를 거절한다', (invalidVNode) => {
  const component = new FunctionComponent(() => invalidVNode, {});
  const container = document.createElement('main');

  expect(() => component.mount(container)).toThrow(TypeError);
  expect(component.previousVNode).toBeNull();
  expect(container.firstChild).toBeNull();
});
