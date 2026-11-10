// 보안: React에서 실제로 문제가 됐던 입력을 h()가 막는지 확인한다
import { describe, it, expect } from 'vitest';
import { h, memo, FunctionComponent, useState } from '../src/component.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(fn) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const c = new FunctionComponent(fn);
  c.mount(container);
  return { c, container };
}

describe('JSON 객체를 VNode로 착각하지 않는다 (React $$typeof 사례)', () => {
  const fake = () => JSON.parse('{"type":"img","props":{"src":"x","onerror":"window.pwn=1"},"children":[]}');

  it('h()가 만들지 않은 객체를 자식으로 넣으면 에러', () => {
    expect(() => h('span', null, fake())).toThrow(/자식/);
  });

  it('배열 안에 섞여 있어도 에러', () => {
    expect(() => h('ul', null, [h('li', null, 'a'), fake()])).toThrow(/자식/);
  });

  it('컴포넌트가 h()가 만들지 않은 객체를 돌려줘도 에러', () => {
    const Bad = () => fake();
    expect(() => mount(() => h('div', null, h(Bad)))).toThrow(/자식/);
  });

  it('렌더 밖에서 key를 붙여 부른 컴포넌트도 JSON을 돌려주면 에러 (key 복사로 표시가 붙는 우회)', () => {
    const Bad = () => fake();
    expect(() => h(Bad, { key: 'x' })).toThrow(/자식/);
  });

  it('h()가 만든 VNode·key 붙은 컴포넌트 출력·memo 출력은 그대로 쓴다', async () => {
    let set;
    const Item = memo(({ t }) => h('li', null, t));
    const { container } = mount(() => {
      const [ts, s] = useState(['a', 'b']);
      set = s;
      return h('ul', null, ts.map((t) => h(Item, { key: t, t })));
    });
    set(['b', 'a']);
    await flush();
    expect(container.innerHTML).toBe('<ul><li>b</li><li>a</li></ul>');
    set(['b', 'a', 'c']); // b·a는 memo로 건너뛰어 지난 출력 객체를 다시 쓴다
    await flush();
    expect(container.innerHTML).toBe('<ul><li>b</li><li>a</li><li>c</li></ul>');
  });
});

describe('문자열 이벤트 핸들러를 속성으로 넣지 않는다', () => {
  it('onclick·onClick·ONERROR에 문자열이 오면 버린다', () => {
    const v = h('img', { onclick: 'x()', onClick: 'y()', ONERROR: 'z()', alt: 'a' });
    expect(v.props).toEqual({ alt: 'a' });
    expect(v.events).toEqual({});
  });

  it('함수 핸들러는 그대로 이벤트로 쓴다', () => {
    let n = 0;
    const { container } = mount(() => h('button', { onClick: () => n++ }, 'b'));
    container.querySelector('button').click();
    expect(n).toBe(1);
    expect(container.innerHTML).toBe('<button>b</button>');
  });
});

describe('javascript: URL을 막는다', () => {
  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['  javascript:alert(1)'],
    ['java\tscript:alert(1)'],
    ['\u0001javascript:alert(1)'],
  ])('href %j 는 버린다', (url) => {
    expect(h('a', { href: url }).props).toEqual({});
  });

  it('src·action·formaction·xlink:href·data도 대소문자 상관없이 막는다', () => {
    const v = h('form', { action: 'javascript:1', formAction: 'javascript:1', SRC: 'javascript:1', 'xlink:href': 'javascript:1', data: 'javascript:1' });
    expect(v.props).toEqual({});
  });

  it('보통 URL은 그대로 둔다', () => {
    expect(h('a', { href: 'https://example.com/javascript:x' }).props).toEqual({ href: 'https://example.com/javascript:x' });
    expect(h('a', { href: '/path' }).props).toEqual({ href: '/path' });
    expect(h('a', { title: 'javascript:는 글자일 뿐' }).props).toEqual({ title: 'javascript:는 글자일 뿐' });
  });
});

describe('잘못된 이름으로 patch 도중에 멈추지 않는다', () => {
  it('브라우저가 거부하는 속성 이름은 버린다', () => {
    expect(h('p', { 'bad name': '1', 'x"y': '1', 'data-ok': '1', 'aria-label': 'l' }).props).toEqual({ 'data-ok': '1', 'aria-label': 'l' });
  });

  it('잘못된 속성 이름이 들어와도 화면과 상태가 어긋나지 않는다', async () => {
    let set;
    const seen = [];
    const { container } = mount(() => {
      const [k, s] = useState('ok');
      set = s;
      return h('div', null, h('p', null, k), h('button', { [k]: '1', onClick: () => seen.push(k) }, 'b'));
    });
    set('bad name');
    await flush();
    expect(container.innerHTML).toBe('<div><p>bad name</p><button>b</button></div>');
    container.querySelector('button').click();
    expect(seen).toEqual(['bad name']);
  });

  it('잘못된 태그 이름은 patch 전에 에러를 내고 DOM은 그대로', async () => {
    expect(() => h('img src=x onerror=alert(1)', null)).toThrow(/태그/);
    let set;
    const { container } = mount(() => { const [t, s] = useState('p'); set = s; return h('div', null, h('span', null, t), h(t, null, 'x')); });
    const errors = [];
    const onError = (e) => errors.push(e.message); // flush는 microtask라 에러가 바깥으로 나간다
    process.on('uncaughtException', onError);
    try {
      set('img src=x');
      await flush();
    } finally {
      process.off('uncaughtException', onError);
    }
    expect(errors.some((m) => /태그/.test(m))).toBe(true);
    expect(container.innerHTML).toBe('<div><span>p</span><p>x</p></div>');
  });

  it('script 태그는 만들 수 없다 (createElement로 만든 script는 붙는 순간 실행됨)', () => {
    expect(() => h('script', null, 'alert(1)')).toThrow(/script/);
    expect(() => h('SCRIPT', null)).toThrow(/script/);
  });
});
