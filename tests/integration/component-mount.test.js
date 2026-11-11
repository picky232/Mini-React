// @vitest-environment jsdom

import { expect, test } from 'vitest';
import { FunctionComponent } from '../../src/component/function-component.js';
import { h } from '../../src/core/vnode.js';

test('부모와 자식 props로 만든 트리를 기존 엔진으로 렌더링한다', () => {
  function Child({ label }) {
    return h('p', { attrs: { class: 'child' }, events: {} }, [label]);
  }

  function Parent({ title, message }) {
    return h('section', null, [h('h1', null, [title]), '\n ', Child({ label: message })]);
  }

  const props = Object.freeze({ title: 'Mini React', message: '첫 렌더링' });
  const component = new FunctionComponent(Parent, props);
  const container = document.createElement('main');
  document.body.append(container);

  component.mount(container);

  expect(container.childNodes).toHaveLength(1);
  expect(container.innerHTML).toBe('<section><h1>Mini React</h1>\n <p class="child">첫 렌더링</p></section>');
});

test('기존 루트를 보존하고 빈 컨테이너에서 같은 인스턴스를 다시 마운트할 수 있다', () => {
  const vnode = h('p', null, ['new']);
  const component = new FunctionComponent(() => vnode, {});
  const occupied = document.createElement('main');
  const existing = document.createElement('p');
  existing.textContent = 'existing';
  occupied.append(existing);

  expect(() => component.mount(occupied)).toThrow(RangeError);
  expect(occupied.childNodes).toHaveLength(1);
  expect(occupied.firstChild).toBe(existing);
  expect(existing.textContent).toBe('existing');
  expect(component.previousVNode).toBeNull();

  const empty = document.createElement('main');
  component.mount(empty);
  expect(empty.innerHTML).toBe('<p>new</p>');
  expect(component.previousVNode).toBe(vnode);
});
