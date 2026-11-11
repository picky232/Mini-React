// @vitest-environment jsdom

import { afterEach, expect, test } from 'vitest';
import page from '../../index.html?raw';
import { startVote } from '../../src/app/vote.js';
import { changedNodes, toLines } from '../../src/app/devtools.js';

let stop;
afterEach(() => {
  stop?.();
  stop = undefined;
});

function mountVote() {
  const template = new DOMParser().parseFromString(page, 'text/html');
  document.title = template.title;
  document.body.innerHTML = template.body.innerHTML;
  const app = document.getElementById('vote-app');
  const panel = document.getElementById('devtools');
  stop = startVote(app, panel);
  const byLabel = (label) => app.querySelector(`[aria-label="${label}"]`);
  return {
    app, panel, byLabel,
    names: () => Array.from(app.querySelectorAll('.menu-name'), (n) => n.textContent),
    row: (name) => byLabel(`${name}에 투표`)?.closest('li') ?? null,
    add(name) {
      app.querySelector('input[name="menu"]').value = name;
      app.querySelector('button[type="submit"]').click();
    },
    notice: () => app.querySelector('#vote-notice'),
    patchTypes: () => Array.from(panel.querySelectorAll('.dt-patch em'), (em) => em.textContent),
    action: () => panel.querySelector('.dt-action').textContent,
  };
}

test('첫 렌더는 순위대로 그리고 패널에 첫 렌더라고 알린다', () => {
  const { names, panel } = mountVote();
  expect(names()).toEqual(['짜장면', '김치찌개', '돈까스', '마라탕', '쌀국수']);
  expect(panel.textContent).toContain('RENDER #1');
  expect(panel.textContent).toContain('첫 렌더');
  expect(document.title).toBe('1위 짜장면 · Mini React');
});

test('투표 한 번은 표 수 텍스트만 고치고, 같은 줄의 DOM 노드를 그대로 쓴다', () => {
  const { byLabel, row, patchTypes, action, panel } = mountVote();
  const before = row('김치찌개');
  byLabel('김치찌개에 투표').click();
  expect(row('김치찌개')).toBe(before);
  expect(before.querySelector('.menu-votes').textContent).toBe('10표');
  // 핸들러를 같은 함수로 유지하므로 이벤트 PROPS patch 없이 TEXT만 나온다(표 수, 합계).
  expect(patchTypes()).toEqual(['TEXT', 'TEXT']);
  expect(action()).toBe('투표 · setState 1번 → 렌더 1번');
  expect(panel.textContent).toContain('memo로 건너뛴 줄 4개');
});

test('표가 앞서면 key로 같은 줄을 위로 옮긴다', () => {
  const { byLabel, row, names, patchTypes } = mountVote();
  const before = row('김치찌개');
  for (let i = 0; i < 4; i += 1) byLabel('김치찌개에 투표').click();
  expect(names()[0]).toBe('김치찌개');
  expect(row('김치찌개')).toBe(before);
  expect(patchTypes()).toContain('MOVE');
  expect(document.title).toBe('1위 김치찌개 · Mini React');
});

test('메뉴를 추가하면 목록과 알림을 setState 2번·렌더 1번으로 바꾸고 INSERT로 줄을 넣는다', () => {
  const { add, names, notice, patchTypes, action, app } = mountVote();
  add('  비빔밥  ');
  expect(names().at(-1)).toBe('비빔밥');
  expect(notice().textContent).toBe("'비빔밥'을(를) 추가했어요.");
  expect(patchTypes()).toContain('INSERT');
  expect(action()).toBe('메뉴 추가 · setState 2번 → 렌더 1번');
  expect(app.querySelector('input[name="menu"]').value).toBe('');
});

test('빈 이름·긴 이름·이미 있는 이름은 추가하지 않고 이유를 보여 준다', () => {
  const { add, names, notice, app } = mountVote();
  add('   ');
  expect(notice().textContent).toBe('메뉴 이름을 입력해 주세요.');
  add('가'.repeat(21));
  expect(notice().textContent).toBe('메뉴 이름은 20자까지 쓸 수 있어요.');
  add('짜장면');
  expect(notice().textContent).toBe("'짜장면'은(는) 이미 있어요.");
  expect(notice().classList.contains('error')).toBe(true);
  expect(names()).toHaveLength(5);
  // 실패하면 고칠 수 있게 입력을 지우지 않는다.
  expect(app.querySelector('input[name="menu"]').value).toBe('짜장면');
});

test('메뉴를 지우면 REMOVE로 그 줄만 빼고 나머지 줄의 DOM은 그대로 쓴다', () => {
  const { byLabel, row, names, patchTypes } = mountVote();
  const others = ['짜장면', '돈까스', '마라탕', '쌀국수'].map(row);
  byLabel('김치찌개 삭제').click();
  expect(names()).toEqual(['짜장면', '돈까스', '마라탕', '쌀국수']);
  expect(['짜장면', '돈까스', '마라탕', '쌀국수'].map(row)).toEqual(others);
  expect(patchTypes()).toContain('REMOVE');
});

test('모두 지우면 안내를 보여 주고, 초기화하면 샘플로 돌아간다', () => {
  const { byLabel, names, app } = mountVote();
  for (const name of ['짜장면', '김치찌개', '돈까스', '마라탕', '쌀국수']) byLabel(`${name} 삭제`).click();
  expect(app.querySelector('.menu-empty').textContent).toBe('메뉴를 추가해 주세요.');
  expect(document.title).toBe('메뉴를 추가해 주세요 · Mini React');
  Array.from(app.querySelectorAll('button')).find((b) => b.textContent === '초기화').click();
  expect(names()).toHaveLength(5);
});

test('해제하면 앱·패널·강조 레이어를 지우고 제목을 되돌린다', () => {
  const { app, panel } = mountVote();
  stop();
  stop = undefined;
  expect(app.childNodes).toHaveLength(0);
  expect(panel.childNodes).toHaveLength(0);
  expect(document.querySelector('.flash-layer')).toBeNull();
  expect(document.title).toBe('Mini React · 점심 투표');
});

test('바뀐 노드 수는 MOVE로 옮긴 줄을 새로 만든 것처럼 하위 노드까지 세지 않는다', () => {
  const list = document.createElement('ul');
  list.innerHTML = '<li><b>a</b> 1</li><li><b>b</b> 2</li>';
  const observer = new MutationObserver(() => {});
  observer.observe(list, { childList: true, characterData: true, subtree: true });
  list.insertBefore(list.lastChild, list.firstChild);
  list.firstChild.lastChild.data = ' 3';
  const records = observer.takeRecords();
  observer.disconnect();
  expect(changedNodes(records)).toBe(2); // 옮긴 li 1개 + 텍스트 1개
});

test('Hooks 값은 자르지 않고 배열은 항목마다, 객체는 속성마다 한 줄로 보여 준다', () => {
  expect(toLines([{ id: 1, name: '짜장면' }, { id: 2, name: '김치찌개' }])).toEqual(['{ id: 1, name: "짜장면" }', '{ id: 2, name: "김치찌개" }']);
  expect(toLines({ text: '추가했어요.', error: false })).toEqual(['text: "추가했어요."', 'error: false']);
  expect(toLines([[1, 2], () => {}])).toEqual(['  1', '  2', 'ƒ']);
  expect(toLines([])).toEqual(['[]']);
  expect(toLines(null)).toEqual(['null']);
  const cycle = {};
  cycle.self = cycle;
  expect(toLines(cycle)[0]).toContain('…');
  const selfArray = [];
  selfArray.push(selfArray);
  expect(toLines(selfArray).at(-1)).toContain('…');
  expect(toLines({})).toEqual(['{}']);
});

test('패널의 Hooks 목록에 상태 값이 잘리지 않고 메뉴마다 한 줄씩 나온다', () => {
  const { panel } = mountVote();
  const firstHook = panel.querySelector('.dt-hook .dt-lines');
  expect(Array.from(firstHook.children, (line) => line.textContent)).toEqual([
    '{ id: 1, name: "짜장면", votes: 12 }',
    '{ id: 2, name: "김치찌개", votes: 9 }',
    '{ id: 3, name: "돈까스", votes: 7 }',
    '{ id: 4, name: "마라탕", votes: 5 }',
    '{ id: 5, name: "쌀국수", votes: 3 }',
  ]);
});
