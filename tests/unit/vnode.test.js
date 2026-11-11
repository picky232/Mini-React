import { describe, expect, test } from 'vitest';
import { createTextVNode, h } from '../../src/core/vnode.js';

describe('createTextVNode', () => {
  test.each(['hello', '', ' \n\t ', 0, -3.5])('%j를 문자열 텍스트로 생성한다', (value) => {
    expect(createTextVNode(value)).toEqual({ kind: 'text', value: String(value) });
  });

  test.each([null, undefined, true, {}, []])('지원하지 않는 값 %j를 거절한다', (value) => {
    expect(() => createTextVNode(value)).toThrow(TypeError);
  });
});

describe('h', () => {
  test('빈 요소의 기본 props와 children을 생성한다', () => {
    expect(h('div', null)).toEqual({
      kind: 'element', tag: 'div', props: { attrs: {}, events: {} }, children: [],
    });
  });

  test('자식을 순서대로 정규화하고 공백·0·빈 문자열을 보존한다', () => {
    const span = h('span', null, ['nested']);
    expect(h('div', null, [' ', 0, '', false, null, span, true, undefined]).children).toEqual([
      { kind: 'text', value: ' ' },
      { kind: 'text', value: '0' },
      { kind: 'text', value: '' },
      span,
    ]);
  });

  test('동결된 입력을 수정하지 않고 props와 자식 배열을 복사한다', () => {
    const click = () => {};
    const attrs = Object.freeze({ class: 'primary', disabled: '' });
    const events = Object.freeze({ click });
    const props = Object.freeze({ attrs, events });
    const child = Object.freeze(createTextVNode('hello'));
    const children = Object.freeze([child]);
    const vnode = h('button', props, children);

    expect(vnode.props).toEqual(props);
    expect(vnode.props).not.toBe(props);
    expect(vnode.props.attrs).not.toBe(attrs);
    expect(vnode.props.events).not.toBe(events);
    expect(vnode.props.events.click).toBe(click);
    expect(vnode.children).not.toBe(children);
    expect(vnode.children[0]).toBe(child);
  });

  test('호출 후 원본 props·배열을 변경해도 생성 결과에 전파하지 않는다', () => {
    const click = () => {};
    const props = { attrs: { title: 'before' }, events: { click } };
    const children = ['before'];
    const vnode = h('button', props, children);
    props.attrs.title = 'after';
    props.events.click = () => {};
    children.push('after');

    expect(vnode.props.attrs.title).toBe('before');
    expect(vnode.props.events.click).toBe(click);
    expect(vnode.children).toEqual([{ kind: 'text', value: 'before' }]);
  });

  test.each(['', 'DIV', 'template', 'svg', 'math', 'bad tag'])('지원하지 않는 태그 %j를 거절한다', (tag) => {
    expect(() => h(tag, null)).toThrow(TypeError);
  });

  test.each([
    { attrs: { disabled: true }, events: {} },
    { attrs: { onclick: 'run()' }, events: {} },
    { attrs: {}, events: { click: 'run()' } },
    { attrs: null, events: {} },
    { attrs: {}, events: null },
  ])('잘못된 props %j를 거절한다', (props) => {
    expect(() => h('div', props)).toThrow(TypeError);
  });

  test.each([
    { children: [['nested']] },
    { children: [{}] },
    { children: [{ kind: 'text', value: 3 }] },
    { children: [{ kind: 'comment', value: 'note' }] },
  ])(
    '지원하지 않는 자식 $children을 거절한다', ({ children }) => {
      expect(() => h('div', null, children)).toThrow(TypeError);
    },
  );
});
