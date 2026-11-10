import { FunctionComponent, useEffect, useMemo, useState } from '../component/function-component.js';
import { h } from '../core/vnode.js';
import { submitTextField, syncDocumentTitle } from '../dom/todo-controls.js';

/** @typedef {'all' | 'completed' | 'active'} Filter */
/** @typedef {{ id: number, title: string, completed: boolean }} Todo */
/** @typedef {{ items: Todo[], nextId: number }} TodoState */

/** @type {ReadonlyArray<{ value: Filter, label: string }>} */
const filters = [
  { value: 'all', label: '전체' },
  { value: 'completed', label: '완료' },
  { value: 'active', label: '미완료' },
];

/** @param {{ onSubmit: EventListener }} props */
function TodoForm({ onSubmit }) {
  return h('form', { attrs: { class: 'todo-form' }, events: { submit: onSubmit } }, [
    h('label', { attrs: { for: 'todo-title' }, events: {} }, ['새 할 일']),
    h('div', { attrs: { class: 'todo-entry' }, events: {} }, [
      h('input', {
        attrs: { id: 'todo-title', name: 'title', type: 'text', placeholder: '예. 회의 자료 정리', required: '' },
        events: {},
      }),
      h('button', { attrs: { class: 'primary', type: 'submit' }, events: {} }, ['추가']),
    ]),
  ]);
}

/** @param {{ selected: Filter, onSelect: (filter: Filter) => void }} props */
function TodoFilters({ selected, onSelect }) {
  return h('div', { attrs: { class: 'todo-filters', role: 'group', 'aria-label': '할 일 필터' }, events: {} },
    filters.map(({ value, label }) => h('button', {
      attrs: { type: 'button', 'aria-pressed': String(selected === value) },
      events: { click: () => onSelect(value) },
    }, [label])));
}

/** @param {{ items: readonly Todo[], onToggle: (id: number) => void, onRemove: (id: number) => void }} props */
function TodoList({ items, onToggle, onRemove }) {
  const rows = items.map(({ id, title, completed }) => h('li', { attrs: { class: 'todo-row' }, events: {} }, [
    h('button', {
      attrs: { type: 'button', class: 'todo-toggle', 'aria-pressed': String(completed), 'aria-label': `${title} 완료 여부` },
      events: { click: () => onToggle(id) },
    }, [
      h('span', { attrs: { class: 'todo-mark', 'aria-hidden': 'true' }, events: {} }, [completed ? '✓' : '○']),
      h('span', { attrs: { class: 'todo-text' }, events: {} }, [title]),
    ]),
    h('button', {
      attrs: { type: 'button', class: 'todo-remove', 'aria-label': `${title} 삭제` },
      events: { click: () => onRemove(id) },
    }, ['삭제']),
  ]));
  return h('ul', { attrs: { class: 'todo-list', 'aria-label': '할 일 목록' }, events: {} }, rows.length > 0 ? rows : [
    h('li', { attrs: { class: 'todo-empty' }, events: {} }, ['표시할 할 일이 없어요.']),
  ]);
}

/** @param {{ setTitle: (title: string) => () => void }} props */
function TodoApp({ setTitle }) {
  const [{ items }, setTodos] = useState(/** @type {TodoState} */ ({ items: [], nextId: 1 }));
  const [filter, setFilter] = useState(/** @type {Filter} */ ('all'));
  // 입력 중에는 상태를 갱신하지 않는다. 목록과 필터가 바뀔 때 표시할 항목을 계산한다.
  const visibleItems = useMemo(() => filter === 'all'
    ? items
    : items.filter((item) => item.completed === (filter === 'completed')), [items, filter]);
  const completedCount = items.filter((item) => item.completed).length;
  useEffect(() => setTitle(`할 일 ${completedCount}/${items.length} 완료 · Mini React`), [completedCount, items.length, setTitle]);

  const onSubmit = submitTextField('title', (title) => {
    // 목록과 다음 ID를 한 번에 갱신해 제목이 같은 할 일도 구분한다.
    setTodos(({ items, nextId }) => ({ items: [...items, { id: nextId, title, completed: false }], nextId: nextId + 1 }));
  });
  /** @param {number} id */
  const onToggle = (id) => setTodos((state) => ({
    ...state, items: state.items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item),
  }));
  /** @param {number} id */
  const onRemove = (id) => setTodos((state) => ({ ...state, items: state.items.filter((item) => item.id !== id) }));

  return h('section', { attrs: { class: 'todo-card', 'aria-label': '할 일 관리' }, events: {} }, [
    TodoForm({ onSubmit }),
    TodoFilters({ selected: filter, onSelect: setFilter }),
    h('p', { attrs: { class: 'todo-summary', role: 'status' }, events: {} }, [`전체 ${items.length}개 중 ${completedCount}개 완료`]),
    TodoList({ items: visibleItems, onToggle, onRemove }),
  ]);
}

/** @param {HTMLElement} container */
export function startTodo(container) {
  const component = new FunctionComponent(TodoApp, { setTitle: (title) => syncDocumentTitle(container, title) });
  component.mount(container);
  return () => component.unmount();
}
