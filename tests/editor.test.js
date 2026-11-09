import { describe, it, expect } from 'vitest';
import { edit } from '../phase1/editor.js';

// edit 결과를 실제로 적용한 글자와 커서 위치
function apply(value, start, end, key) {
  const r = edit(key, value, start, end);
  if (!r) return null;
  return { value: value.slice(0, r.from) + r.text + value.slice(r.to), sel: [r.selStart, r.selEnd] };
}

describe('> 닫는 태그 자동 추가', () => {
  it('여는 태그 뒤에 닫는 태그를 넣고 커서는 그 사이에 둔다', () => {
    expect(apply('<li', 3, 3, '>')).toEqual({ value: '<li></li>', sel: [4, 4] });
  });

  it('속성이 있어도 태그 이름으로 닫는다', () => {
    expect(apply('<a href="x"', 11, 11, '>')).toEqual({ value: '<a href="x"></a>', sel: [12, 12] });
  });

  it('대문자 태그는 소문자로 닫는다', () => {
    expect(apply('<LI', 3, 3, '>').value).toBe('<LI></li>');
  });

  it('void 태그, 닫는 태그, 자기 닫힘, 태그가 아닌 곳, 이미 닫힌 곳은 건드리지 않는다', () => {
    for (const [v, at] of [['<br', 3], ['<img src="x"', 12], ['</li', 4], ['<br/', 4], ['a ', 2], ['<!--', 4], ['<li</li>', 3]]) {
      expect(edit('>', v, at, at)).toBeNull();
    }
  });
});

describe('Enter 들여쓰기 유지', () => {
  it('현재 줄의 들여쓰기를 다음 줄에 이어 준다', () => {
    expect(apply('  <li>a</li>', 12, 12, 'Enter')).toEqual({ value: '  <li>a</li>\n  ', sel: [15, 15] });
  });

  it('여는 태그와 닫는 태그 사이면 닫는 태그를 내리고 가운데 줄을 한 단계 더 들여쓴다', () => {
    expect(apply('  <ul></ul>', 6, 6, 'Enter')).toEqual({ value: '  <ul>\n    \n  </ul>', sel: [11, 11] });
  });

  it('한 글자 태그 사이에서도 동작한다', () => {
    expect(apply('<a></a>', 3, 3, 'Enter').value).toBe('<a>\n  \n</a>');
  });
});

describe('Tab 들여쓰기', () => {
  it('선택이 없으면 두 칸을 넣는다', () => {
    expect(apply('ab', 1, 1, 'Tab')).toEqual({ value: 'a  b', sel: [3, 3] });
  });

  it('여러 줄을 선택하면 지우지 않고 각 줄 앞에 두 칸씩 넣는다', () => {
    expect(apply('a\nb\n\nc', 0, 6, 'Tab')).toEqual({ value: '  a\n  b\n\n  c', sel: [2, 12] });
  });

  it('줄 중간부터 선택해도 그 줄 맨 앞에 넣는다', () => {
    expect(apply('x\nabc\nd', 3, 7, 'Tab').value).toBe('x\n  abc\n  d');
  });
});

it('다른 키는 가로채지 않는다', () => {
  expect(edit('a', '', 0, 0)).toBeNull();
});
