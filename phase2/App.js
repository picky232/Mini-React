/*
 * Phase 2 엔진 확인용 임시 데모: 할 일 앱. (최종 데모 웹페이지는 다른 주제로 따로 만든다)
 * 상태(todos, text, filter)는 전부 루트 App에만 있고, 자식은 props만 받아 VNode를 돌려주는 순수 함수다 (Lifting State Up).
 * 자식이 상태를 바꿔야 할 때는 App이 내려준 함수(actions, onInput 등)를 부른다.
 */
import { h, memo, useState, useEffect, useMemo } from '../src/component.js';

export const STORAGE_KEY = 'mini-react-todos';
const SAMPLE = [
  { id: 's1', text: '장보기', done: true },
  { id: 's2', text: '운동 & 스트레칭', done: false },
  { id: 's3', text: 'Phase 2 발표 준비', done: false },
];
export const FILTERS = { all: '전체', active: '진행 중', done: '완료' };

let seq = 0;
const newTodo = (text) => ({ id: `${Date.now().toString(36)}-${seq++}`, text, done: false });

// 저장된 목록이 없거나 깨졌거나 저장소가 막혀 있으면 샘플로 시작한다
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : SAMPLE;
  } catch {
    return SAMPLE;
  }
}

/* ───────── 루트 컴포넌트: hook은 여기서만 ───────── */

export function App() {
  const [todos, setTodos] = useState(load); // 함수를 넘기면 첫 렌더에만 localStorage를 읽는다
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');

  // memo 자식(TodoItem)에게 넘길 핸들러 묶음. 렌더마다 새로 만들면 props가 매번 달라져 memo가 소용없다.
  // setTodos는 렌더마다 같은 함수이고 함수형 업데이트로 최신 todos를 받으므로 deps가 [] 여도 안전하다
  const actions = useMemo(() => ({
    toggle: (id) => setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
    remove: (id) => setTodos((ts) => ts.filter((t) => t.id !== id)),
  }), []);

  // 필터 결과와 남은 개수는 todos·filter가 바뀔 때만 다시 계산한다 (입력창 타이핑 때는 캐시 사용)
  const visible = useMemo(
    () => (filter === 'all' ? todos : todos.filter((t) => t.done === (filter === 'done'))),
    [todos, filter],
  );
  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  // 화면 반영 뒤에 할 일: 저장, 탭 제목
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(todos)); } catch {} // 저장이 막힌 환경이면 이번 방문에만 유지
  }, [todos]);
  useEffect(() => {
    document.title = remaining ? `할 일 ${remaining}개 · Mini React` : 'Mini React · Phase 2';
  }, [remaining]);

  const add = (e) => {
    e.preventDefault(); // 안 막으면 form이 페이지를 새로고침한다
    const t = text.trim();
    if (!t) return;
    setTodos((ts) => [newTodo(t), ...ts]); // 맨 앞에 추가: key 덕분에 CREATE 1개로 끝난다
    setText('');
  };
  // setState를 연달아 3번 → batching으로 렌더 1번
  const addThree = () => {
    for (const s of ['물 마시기', '스트레칭', '일기 쓰기']) setTodos((ts) => [newTodo(s), ...ts]);
  };
  const reverse = () => setTodos((ts) => [...ts].reverse()); // 순서만 바뀜: key 덕분에 MOVE만

  return h('div', { class: 'todo-app' },
    h(Header, { remaining, total: todos.length }),
    h(TodoForm, { text, onInput: (e) => setText(e.target.value), onSubmit: add }),
    h(Toolbar, { filter, onFilter: setFilter, onAddThree: addThree, onReverse: reverse }),
    h(TodoList, { todos: visible, actions }),
  );
}

/* ───────── 자식 컴포넌트: props만 받는 순수 함수 (hook 금지) ───────── */

function Header({ remaining, total }) {
  return h('div', { class: 'todo-head' },
    h('h2', null, '오늘 할 일'),
    h('p', { class: 'todo-count' }, `남은 일 ${remaining}개 · 전체 ${total}개`),
  );
}

function TodoForm({ text, onInput, onSubmit }) {
  return h('form', { class: 'todo-form', onSubmit },
    h('input', { name: 'todo', value: text, placeholder: '할 일을 입력하세요', autocomplete: 'off', 'aria-label': '새 할 일', onInput }),
    h('button', { class: 'primary', type: 'submit', disabled: !text.trim() }, '추가'),
  );
}

function Toolbar({ filter, onFilter, onAddThree, onReverse }) {
  return h('div', { class: 'todo-toolbar' },
    h('div', { class: 'segmented', role: 'group', 'aria-label': '필터' },
      Object.entries(FILTERS).map(([value, label]) =>
        h('button', { type: 'button', class: value === filter ? 'on' : null, 'aria-pressed': value === filter ? 'true' : 'false', onClick: () => onFilter(value) }, label)),
    ),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', onClick: onAddThree }, 'setState ×3'),
      h('button', { type: 'button', onClick: onReverse }, '순서 뒤집기'),
    ),
  );
}

function TodoList({ todos, actions }) {
  if (todos.length === 0) return h('p', { class: 'todo-empty' }, '할 일이 없어요');
  // key = 할 일 id. 위치가 바뀌어도 같은 항목이면 같은 DOM 노드를 옮겨 쓴다
  return h('ul', { class: 'todo-list' }, todos.map((todo) => h(TodoItem, { key: todo.id, todo, actions })));
}

// memo: todo 객체와 actions가 지난번과 같으면 이 함수를 부르지 않고 지난 VNode를 그대로 쓴다.
// 하나를 체크하면 그 todo만 새 객체가 되므로 그 항목만 다시 그려진다
const TodoItem = memo(({ todo, actions }) =>
  h('li', { class: todo.done ? 'done' : null },
    h('label', null,
      h('input', { type: 'checkbox', checked: todo.done, onChange: () => actions.toggle(todo.id) }),
      h('span', null, todo.text),
    ),
    h('button', { type: 'button', class: 'remove', 'aria-label': `${todo.text} 삭제`, onClick: () => actions.remove(todo.id) }, '삭제'),
  ));
