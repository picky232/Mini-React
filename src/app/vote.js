import { FunctionComponent, child, memo, useEffect, useMemo, useState } from '../component/function-component.js';
import { h } from '../core/vnode.js';
import { syncDocumentTitle } from '../dom/todo-controls.js';
import { attachDevtools } from './devtools.js';

/** @typedef {{ id: number, name: string, votes: number }} Menu */
/** @typedef {{ text: string, error: boolean } | null} Notice */

/** @type {readonly Menu[]} */
export const SAMPLE_MENUS = [
  { id: 1, name: '짜장면', votes: 12 },
  { id: 2, name: '김치찌개', votes: 9 },
  { id: 3, name: '돈까스', votes: 7 },
  { id: 4, name: '마라탕', votes: 5 },
  { id: 5, name: '쌀국수', votes: 3 },
];
export const MAX_NAME_LENGTH = 20;

/** 표가 같으면 먼저 등록한 메뉴가 위로 간다. */
const byVotes = (/** @type {Menu} */ a, /** @type {Menu} */ b) => b.votes - a.votes || a.id - b.id;
/** 클릭한 버튼의 data-id에서 메뉴 id를 읽는다. 줄마다 새 함수를 만들지 않으려고 id를 함수가 아닌 속성에 둔다. */
const idOf = (/** @type {Event} */ event) => Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.id);

/** @param {string} name 앞뒤 공백을 지운 이름 */
function nameProblem(name) {
  if (name === '') return '메뉴 이름을 입력해 주세요.';
  if (name.length > MAX_NAME_LENGTH) return `메뉴 이름은 ${MAX_NAME_LENGTH}자까지 쓸 수 있어요.`;
  return null;
}

/**
 * 메뉴 한 줄. memo라서 순위·표·이름이 그대로면 다시 실행하지 않고, key로 순위가 바뀌어도 같은 DOM을 옮겨 쓴다.
 * 핸들러는 모든 줄이 같은 함수를 쓴다. 줄마다 새 화살표 함수를 만들면 다시 그릴 때마다 이벤트 PROPS patch가 생긴다.
 * @type {(props: { key: number, rank: number, name: string, votes: number, onVote: EventListener, onRemove: EventListener }) => import('../core/contracts.js').VNode}
 */
const MenuRow = memo(({ key: id, rank, name, votes, onVote, onRemove }) => h('li', { attrs: { class: rank === 1 ? 'menu-row first' : 'menu-row' }, events: {}, key: id }, [
  h('span', { attrs: { class: 'menu-rank' }, events: {} }, [rank]),
  h('b', { attrs: { class: 'menu-name' }, events: {} }, [name]),
  h('span', { attrs: { class: 'menu-votes' }, events: {} }, [`${votes}표`]),
  h('button', { attrs: { type: 'button', class: 'menu-vote', 'data-id': String(id), 'aria-label': `${name}에 투표` }, events: { click: onVote } }, ['투표']),
  h('button', { attrs: { type: 'button', class: 'menu-remove', 'data-id': String(id), 'aria-label': `${name} 삭제` }, events: { click: onRemove } }, ['×']),
]));

/**
 * 루트 컴포넌트. 상태와 hook은 여기에만 두고, 줄(MenuRow)은 props만 받는다.
 * @param {{ setTitle: (title: string) => () => void, batch: (callback: () => void) => void, onAction: (label: string, setStates: number) => void }} props
 */
function VoteApp({ setTitle, batch, onAction }) {
  const [menus, setMenus] = useState(/** @type {readonly Menu[]} */ (SAMPLE_MENUS));
  const [notice, setNotice] = useState(/** @type {Notice} */ (null));
  // 정렬은 표가 바뀔 때만 다시 계산한다.
  const ranking = useMemo(() => [...menus].sort(byVotes), [menus]);
  const leaderName = ranking[0]?.name ?? null;
  useEffect(() => setTitle(leaderName === null ? '메뉴를 추가해 주세요 · Mini React' : `1위 ${leaderName} · Mini React`), [leaderName, setTitle]);

  // 핸들러는 useMemo로 같은 함수를 유지한다. 함수형 업데이트라 menus를 deps에 넣지 않아도 최신 목록으로 계산한다.
  const handlers = useMemo(() => ({
    vote: (/** @type {Event} */ event) => {
      const id = idOf(event);
      onAction('투표', 1);
      setMenus((list) => list.map((menu) => (menu.id === id ? { ...menu, votes: menu.votes + 1 } : menu)));
    },
    remove: (/** @type {Event} */ event) => {
      const id = idOf(event);
      onAction('메뉴 삭제', 2);
      // 목록과 알림을 한 번에 바꾼다. batch가 없으면 setState마다 렌더가 따로 돈다.
      batch(() => {
        setMenus((list) => list.filter((menu) => menu.id !== id));
        setNotice(null);
      });
    },
    add: (/** @type {Event} */ event) => {
      event.preventDefault(); // 안 막으면 form이 페이지를 새로고침한다
      const form = /** @type {HTMLFormElement} */ (event.currentTarget);
      const field = /** @type {HTMLInputElement} */ (form.elements.namedItem('menu'));
      const name = field.value.trim();
      const problem = nameProblem(name);
      onAction('메뉴 추가', problem === null ? 2 : 1);
      if (problem !== null) {
        setNotice({ text: problem, error: true });
        return;
      }
      // 중복은 최신 목록을 봐야 알 수 있다. batch 안의 updater는 순서대로 실행되므로 목록 updater가 정한 결과를 알림 updater가 읽는다.
      let duplicate = false;
      batch(() => {
        setMenus((list) => {
          duplicate = list.some((menu) => menu.name === name);
          return duplicate ? list : [...list, { id: Math.max(0, ...list.map((menu) => menu.id)) + 1, name, votes: 0 }];
        });
        setNotice(() => (duplicate ? { text: `'${name}'은(는) 이미 있어요.`, error: true } : { text: `'${name}'을(를) 추가했어요.`, error: false }));
      });
      if (!duplicate) form.reset();
    },
    reset: () => {
      onAction('초기화', 2);
      batch(() => {
        setMenus(SAMPLE_MENUS);
        setNotice(null);
      });
    },
  }), [onAction, batch]);

  const total = menus.reduce((sum, menu) => sum + menu.votes, 0);
  return h('section', { attrs: { class: 'vote', 'aria-labelledby': 'vote-title' }, events: {} }, [
    h('header', { attrs: { class: 'vote-head' }, events: {} }, [
      h('div', { attrs: {}, events: {} }, [
        h('p', { attrs: { class: 'vote-eyebrow' }, events: {} }, ['Mini React · 점심 투표']),
        h('h1', { attrs: { id: 'vote-title' }, events: {} }, ['오늘 점심 뭐 먹지?']),
      ]),
      h('button', { attrs: { type: 'button', class: 'ghost' }, events: { click: handlers.reset } }, ['초기화']),
    ]),
    h('form', { attrs: { class: 'add-form', novalidate: '' }, events: { submit: handlers.add } }, [
      h('input', { attrs: { name: 'menu', type: 'text', placeholder: '메뉴 이름 (예: 비빔밥)', maxlength: String(MAX_NAME_LENGTH + 10), autocomplete: 'off', 'aria-label': '추가할 메뉴 이름', 'aria-describedby': 'vote-notice' }, events: {} }),
      h('button', { attrs: { type: 'submit', class: 'primary' }, events: {} }, ['추가']),
    ]),
    h('p', { attrs: { id: 'vote-notice', class: notice?.error ? 'notice error' : 'notice', role: 'status' }, events: {} }, [notice?.text ?? '']),
    ranking.length === 0
      ? h('p', { attrs: { class: 'menu-empty' }, events: {} }, ['메뉴를 추가해 주세요.'])
      : h('ol', { attrs: { class: 'menu-list', 'aria-label': '득표 순위' }, events: {} },
        ranking.map((menu, index) => child(MenuRow, { key: menu.id, rank: index + 1, name: menu.name, votes: menu.votes, onVote: handlers.vote, onRemove: handlers.remove }))),
    h('p', { attrs: { class: 'vote-total' }, events: {} }, [`메뉴 ${menus.length}개 · 총 ${total}표`]),
  ]);
}

/**
 * 투표 앱과 오른쪽 DevTools 패널을 띄운다.
 * @param {HTMLElement} appContainer
 * @param {HTMLElement} panelContainer
 */
export function startVote(appContainer, panelContainer) {
  /** @type {FunctionComponent<any>} */
  const component = new FunctionComponent(VoteApp, {
    setTitle: (/** @type {string} */ title) => syncDocumentTitle(appContainer, title),
    batch: (/** @type {() => void} */ callback) => component.batch(callback),
    onAction: (/** @type {string} */ label, /** @type {number} */ setStates) => devtools.action(label, setStates),
  });
  const devtools = attachDevtools(component, appContainer, panelContainer);
  try {
    component.mount(appContainer);
  } catch (error) {
    devtools.detach(); // 마운트가 실패하면 먼저 붙인 관찰자·패널·강조 레이어가 남지 않게 한다
    throw error;
  }
  return () => {
    try {
      component.unmount();
    } finally {
      devtools.detach();
    }
  };
}
