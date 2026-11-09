import { VOID } from '../src/vdom.js';

/**
 * 테스트 영역 키 입력 하나에 대해 넣을 글자를 정한다. DOM을 쓰지 않는 순수 함수라 단위 테스트한다.
 * null이면 가로채지 않고 브라우저 기본 동작에 맡긴다.
 * @param {string} key  KeyboardEvent.key
 * @param {string} value  textarea 전체 글자
 * @param {number} start  선택 시작
 * @param {number} end  선택 끝
 * @returns {{ from: number, to: number, text: string, selStart: number, selEnd: number } | null}
 *   value의 [from, to)를 text로 바꾸고, 커서를 [selStart, selEnd]로 둔다
 */
export function edit(key, value, start, end) {
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (key === 'Tab') {
    if (start === end) return { from: start, to: end, text: '  ', selStart: start + 2, selEnd: start + 2 };
    // 여러 줄을 선택했으면 지우지 않고 각 줄 앞에 두 칸씩 넣는다 (빈 줄은 건너뜀)
    const lineStart = before.lastIndexOf('\n') + 1;
    const text = value.slice(lineStart, end).replace(/^(?=.)/gm, '  ');
    return { from: lineStart, to: end, text, selStart: start + 2, selEnd: lineStart + text.length };
  }

  if (key === 'Enter') {
    const indent = before.slice(before.lastIndexOf('\n') + 1).match(/^[ \t]*/)[0];
    // <li>|</li> 사이에서 Enter: 닫는 태그를 다음 줄로 내리고, 커서가 놓인 가운데 줄은 한 단계 더 들여쓴다
    if (/<[a-zA-Z][^<>]*>$/.test(before) && !before.endsWith('/>') && after.startsWith('</')) {
      const text = `\n${indent}  \n${indent}`;
      const caret = start + indent.length + 3;
      return { from: start, to: end, text, selStart: caret, selEnd: caret };
    }
    const caret = start + indent.length + 1;
    return { from: start, to: end, text: `\n${indent}`, selStart: caret, selEnd: caret };
  }

  if (key === '>') {
    // 커서 앞이 여는 태그(<li, <a href="x")면 >와 닫는 태그를 함께 넣고 커서는 그 사이에 둔다
    const m = /<([a-zA-Z][\w-]*)(?:\s[^<>]*)?$/.exec(before);
    if (!m || before.endsWith('/')) return null; // 태그가 아니거나 <br/ 같은 자기 닫힘
    const name = m[1].toLowerCase();
    if (VOID.has(name) || after.startsWith(`</${name}>`)) return null; // 닫는 태그가 없는 태그, 이미 닫혀 있음
    return { from: start, to: end, text: `></${name}>`, selStart: start + 1, selEnd: start + 1 };
  }

  return null;
}

/**
 * textarea에 edit를 연결한다. Esc를 누른 다음 Tab은 가로채지 않아 키보드로 다음 요소로 나갈 수 있다.
 * @param {HTMLTextAreaElement} textarea
 */
export function attachEditor(textarea) {
  let tabLeaves = false;

  const run = (e, key) => {
    const r = edit(key, textarea.value, textarea.selectionStart, textarea.selectionEnd);
    if (!r) return;
    e.preventDefault();
    textarea.setSelectionRange(r.from, r.to);
    // execCommand는 Ctrl+Z 되돌리기 기록을 남긴다. 지원하지 않는 브라우저면 setRangeText로 넣는다(이때는 되돌리기 불가)
    if (!document.execCommand('insertText', false, r.text)) textarea.setRangeText(r.text, r.from, r.to, 'end');
    textarea.setSelectionRange(r.selStart, r.selEnd);
  };

  textarea.addEventListener('keydown', (e) => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return; // 한글 조합 중이거나 단축키
    if (e.key === 'Escape') { tabLeaves = true; return; }
    if (e.key === 'Tab' && (tabLeaves || e.shiftKey)) return;
    tabLeaves = false;
    if (e.key === 'Tab' || e.key === 'Enter') run(e, e.key);
  });

  // >는 글자 입력이라 beforeinput에서 잡는다. 모바일 키보드처럼 keydown의 key가 '>'로 오지 않는 경우에도 동작한다
  textarea.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && e.data === '>') run(e, '>');
  });
}
