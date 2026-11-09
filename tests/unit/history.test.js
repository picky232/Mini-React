import { describe, expect, test } from 'vitest';
import { createHistory, getCurrent, pushHistory, redo, undo } from '../../src/core/history.js';
import { createTextVNode, h } from '../../src/core/vnode.js';

const text = createTextVNode;

describe('스냅샷 저장', () => {
  test('초기 스냅샷을 0번에 저장한다', () => {
    const initial = text('A');
    const history = createHistory(initial);
    expect(history).toEqual({ entries: [text('A')], index: 0 });
    expect(getCurrent(history)).toBe(history.entries[0]);
    expect(getCurrent(history)).not.toBe(initial);
  });

  test.each([
    { name: 'createHistory', save: createHistory },
    { name: 'pushHistory', save: (node) => pushHistory(createHistory(null), node) },
  ])('$name은 원본 트리와 스냅샷을 분리하고 이벤트 함수 참조는 유지한다', ({ save }) => {
    const click = () => {};
    const button = h('button', { attrs: { title: 'before' }, events: { click } }, ['A']);
    const original = h('section', null, [button]);
    const snapshot = getCurrent(save(original));
    const storedButton = snapshot.children[0];

    expect(snapshot).not.toBe(original);
    expect(snapshot.children).not.toBe(original.children);
    expect(storedButton.props).not.toBe(button.props);
    expect(storedButton.props.attrs).not.toBe(button.props.attrs);
    expect(storedButton.props.events).not.toBe(button.props.events);
    expect(storedButton.props.events.click).toBe(click);

    button.props.attrs.title = 'after';
    button.props.events.click = () => {};
    button.children[0].value = 'B';
    original.children.push(text('new child'));

    expect(snapshot).toEqual(h('section', null, [
      h('button', { attrs: { title: 'before' }, events: { click } }, ['A']),
    ]));
    expect(storedButton.props.events.click).toBe(click);
  });

  test('새 배열을 만들며 동결된 이력과 입력 VNode를 수정하지 않는다', () => {
    const first = Object.freeze(text('A'));
    const original = Object.freeze({ entries: Object.freeze([first]), index: 0 });
    const next = Object.freeze(text('B'));
    const saved = pushHistory(original, next);

    expect(original).toEqual({ entries: [text('A')], index: 0 });
    expect(saved).toEqual({ entries: [text('A'), text('B')], index: 1 });
    expect(saved.entries).not.toBe(original.entries);
    expect(saved.entries[0]).toBe(first);
    expect(saved.entries[1]).not.toBe(next);
  });
});

describe('이력 이동과 분기', () => {
  test('Undo·Redo는 같은 스냅샷 배열에서 위치만 옮긴다', () => {
    const first = createHistory(text('A'));
    const latest = pushHistory(pushHistory(first, text('B')), text('C'));
    const middle = undo(latest);
    const start = undo(middle);
    const end = redo(redo(start));

    expect(getCurrent(latest)).toEqual(text('C'));
    expect(getCurrent(middle)).toEqual(text('B'));
    expect(getCurrent(start)).toEqual(text('A'));
    expect(getCurrent(end)).toEqual(text('C'));
    expect(start.entries).toBe(latest.entries);
    expect(end.entries).toBe(latest.entries);
    expect(middle.index).toBe(1);
    expect(latest.index).toBe(2);
  });

  test('시작과 끝에서는 받은 이력을 그대로 반환한다', () => {
    const initial = createHistory(text('A'));
    const latest = pushHistory(initial, text('B'));
    const start = undo(latest);
    expect(undo(initial)).toBe(initial);
    expect(redo(initial)).toBe(initial);
    expect(undo(start)).toBe(start);
    expect(redo(latest)).toBe(latest);
  });

  test('A → B → C에서 B로 돌아가 D를 저장하면 C를 다시 선택할 수 없다', () => {
    const latest = pushHistory(pushHistory(createHistory(text('A')), text('B')), text('C'));
    const middle = undo(latest);
    const branch = pushHistory(middle, text('D'));

    expect(branch).toEqual({ entries: [text('A'), text('B'), text('D')], index: 2 });
    expect(redo(branch)).toBe(branch);
    expect(getCurrent(redo(undo(branch)))).toEqual(text('D'));
    expect(getCurrent(redo(middle))).toEqual(text('C'));
    expect(latest.entries).toEqual([text('A'), text('B'), text('C')]);
  });

  test('빈 화면인 null도 이력의 가운데 저장하고 다시 선택할 수 있다', () => {
    expect(getCurrent(createHistory(null))).toBeNull();
    const latest = pushHistory(pushHistory(createHistory(text('A')), null), text('B'));
    const empty = undo(latest);
    expect(latest.entries).toEqual([text('A'), null, text('B')]);
    expect(getCurrent(empty)).toBeNull();
    expect(getCurrent(undo(empty))).toEqual(text('A'));
    expect(getCurrent(redo(empty))).toEqual(text('B'));
  });
});

describe('이력 입력 확인', () => {
  test.each([-1, 1, 0.5, NaN])('범위를 벗어난 현재 위치 %s를 거절한다', (index) => {
    const invalid = { entries: [null], index };
    expect(() => getCurrent(invalid)).toThrow(RangeError);
    expect(() => undo(invalid)).toThrow(RangeError);
    expect(() => redo(invalid)).toThrow(RangeError);
    expect(() => pushHistory(invalid, null)).toThrow(RangeError);
  });

  test('빈 이력과 스냅샷이 빠진 이력을 구분해 거절한다', () => {
    expect(() => getCurrent({ entries: [], index: 0 })).toThrow(RangeError);
    expect(() => getCurrent({ entries: [undefined], index: 0 })).toThrow(TypeError);
    expect(() => getCurrent({ entries: [null], index: '0' })).toThrow(TypeError);
  });
});
