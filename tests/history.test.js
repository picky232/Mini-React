import { describe, it, expect } from 'vitest';
import { createHistory } from '../src/history.js';

const v = (n) => ({ type: '#root', props: {}, children: [{ type: '#text', text: String(n) }] });

describe('createHistory', () => {
  it('처음에는 initial이 current이고 양쪽 다 이동 불가', () => {
    const a = v(0);
    const h = createHistory(a);
    expect(h.current()).toBe(a);
    expect(h.canBack()).toBe(false);
    expect(h.canForward()).toBe(false);
  });

  it('push하면 새 VNode가 current가 되고 뒤로 갈 수 있다', () => {
    const h = createHistory(v(0));
    const b = v(1);
    h.push(b);
    expect(h.current()).toBe(b);
    expect(h.canBack()).toBe(true);
    expect(h.canForward()).toBe(false);
  });

  it('back/forward는 이동한 뒤의 current를 반환한다', () => {
    const [a, b, c] = [v(0), v(1), v(2)];
    const h = createHistory(a);
    h.push(b);
    h.push(c);
    expect(h.back()).toBe(b);
    expect(h.back()).toBe(a);
    expect(h.canForward()).toBe(true);
    expect(h.forward()).toBe(b);
    expect(h.forward()).toBe(c);
    expect(h.current()).toBe(c);
  });

  it('처음에서 back하면 움직이지 않고 같은 참조를 반환한다', () => {
    const a = v(0);
    const h = createHistory(a);
    expect(h.back()).toBe(a);
    h.push(v(1));
    h.back();
    expect(h.back()).toBe(a);
    expect(h.current()).toBe(a);
    expect(h.canBack()).toBe(false);
  });

  it('끝에서 forward하면 움직이지 않고 같은 참조를 반환한다', () => {
    const h = createHistory(v(0));
    const b = v(1);
    h.push(b);
    expect(h.forward()).toBe(b);
    expect(h.forward()).toBe(b);
    expect(h.canForward()).toBe(false);
  });

  it('뒤로 간 상태에서 push하면 앞쪽 기록이 잘린다', () => {
    const [a, b, c, d] = [v(0), v(1), v(2), v(3)];
    const h = createHistory(a);
    h.push(b);
    h.push(c);
    h.back(); // b
    h.back(); // a
    h.push(d);
    expect(h.current()).toBe(d);
    expect(h.canForward()).toBe(false);
    expect(h.forward()).toBe(d); // 잘린 b, c가 되살아나지 않는다
    expect(h.back()).toBe(a);
    expect(h.canBack()).toBe(false);
  });

  it('canBack/canForward가 위치에 따라 바뀐다', () => {
    const h = createHistory(v(0));
    h.push(v(1));
    h.push(v(2));
    h.back(); // 가운데
    expect(h.canBack()).toBe(true);
    expect(h.canForward()).toBe(true);
  });
});
