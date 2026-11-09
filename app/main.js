/*
 * 데모 페이지 연결. 할 일 앱(App)과 Hooks 인스펙터를 각각 루트 컴포넌트로 mount한다.
 * 인스펙터도 미니 리액트로 그린다: App이 화면에 반영될 때마다(onCommit) 인스펙터의 props를 바꾸고 update()한다.
 */
import { h, FunctionComponent } from '../src/component.js';
import { describePatch } from '../phase1/log.js';
import { App } from './App.js';

const $ = (id) => document.getElementById(id);

// 라이트·다크 전환 (phase1/main.js와 같다). 처음 테마는 index.html head에서 정해 둔다
const themeBtn = $('theme-toggle');
const syncThemeLabel = () => {
  themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '라이트 모드' : '다크 모드';
};
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
  syncThemeLabel();
});
syncThemeLabel();

/* ───────── Hooks 인스펙터 ───────── */

const KIND = { state: 'useState', memo: 'useMemo', effect: 'useEffect' };
const short = (s, max = 64) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
// 함수는 JSON에 안 나오므로 ƒ로 표시 (actions 묶음 등)
const show = (v) => (v === undefined ? '—' : JSON.stringify(v, (_, x) => (typeof x === 'function' ? 'ƒ' : x)) ?? 'ƒ');

/** hooks 배열 → 표의 한 줄씩. effect는 값 대신 deps와 cleanup 유무를 보여 준다 */
function snapshot(hooks) {
  return hooks.map((hk, i) => ({
    i,
    kind: KIND[hk.kind],
    value: hk.kind === 'effect' ? (hk.cleanup ? 'cleanup 있음' : '—') : show(hk.value),
    deps: hk.kind === 'state' ? '' : show(hk.deps),
  }));
}

// 자식 컴포넌트들 (props만 받는 순수 함수)
const Stat = ({ label, value, hint }) =>
  h('div', { class: 'mini-stat' }, h('span', { class: 'mini-stat-value' }, value), h('span', { class: 'mini-stat-label' }, label), hint && h('small', null, hint));

function HookRow({ row, changed }) {
  return h('tr', { class: changed ? 'changed' : null },
    h('td', { class: 'hook-index' }, row.i),
    h('td', null, h('span', { class: `tag tag-${row.kind}` }, row.kind)),
    h('td', { class: 'hook-value', title: row.value }, short(row.value)),
    h('td', { class: 'hook-deps', title: row.deps }, short(row.deps, 40)),
  );
}

function Inspector({ rows, prevRows, info, log }) {
  const types = info ? Object.entries(info.patches.reduce((m, p) => ({ ...m, [p.type]: (m[p.type] ?? 0) + 1 }), {})) : [];
  return [
    h('section', { class: 'card inspector', 'aria-labelledby': 'inspector-title' },
      h('h2', { id: 'inspector-title' }, 'Hooks 인스펙터'),
      h('p', { class: 'inspector-sub' }, 'App 함수는 렌더마다 처음부터 다시 실행되지만, 상태는 함수 바깥의 hooks 배열에 남아 있습니다. 호출 순서(#)로 자기 칸을 찾습니다.'),
      info && h('div', { class: 'mini-stats' },
        h(Stat, { label: '렌더', value: `#${info.render}` }),
        h(Stat, { label: 'setState', value: `${info.batched}번`, hint: info.batched > 1 ? `→ 렌더 1번으로 묶음` : null }),
        h(Stat, { label: 'memo 건너뜀', value: `${info.memoHits}개`, hint: '호출·diff 생략' }),
        h(Stat, { label: 'patch', value: `${info.patches.length}개`, hint: types.map(([t, n]) => `${t} ${n}`).join(' · ') || null }),
        h(Stat, { label: 'MutationRecord', value: `${info.records}개` }),
      ),
      h('table', { class: 'hooks' },
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'hook'), h('th', null, '값'), h('th', null, 'deps'))),
        h('tbody', null, rows.map((row) => h(HookRow, { row, changed: prevRows.length > 0 && prevRows[row.i]?.value !== row.value }))),
      ),
    ),
    h('section', { class: 'card log', 'aria-labelledby': 'log-title' },
      h('h2', { id: 'log-title' }, '이번 렌더의 Patch'),
      h('ol', { id: 'log' }, log.map(({ type, target, detail }) =>
        h('li', null, h('div', null,
          h('div', { class: 'log-head' }, h('span', { class: `tag tag-${type}` }, type), h('code', { class: 'log-path' }, target)),
          detail && h('div', { class: 'log-detail' }, detail))))),
    ),
  ];
}

/* ───────── mount ───────── */

const inspector = new FunctionComponent(Inspector, { rows: [], prevRows: [], info: null, log: [] });
inspector.mount($('inspector'));

const appRoot = $('app');
const app = new FunctionComponent(App);
// 이번 렌더가 실제 DOM을 몇 번 바꿨는지 센다. takeRecords()는 쌓인 기록을 동기로 꺼낸다
const observer = new MutationObserver(() => {});
observer.observe(appRoot, { childList: true, attributes: true, characterData: true, subtree: true });

let prevV = null; // patch의 path는 이전 트리 기준이라 로그를 만들려면 이전 VNode가 필요하다
let prevRows = [];
app.onCommit = (info) => {
  const rows = snapshot(info.hooks);
  const log = prevV === null
    ? [{ type: 'CREATE', target: '#root', detail: '첫 렌더: 비교할 이전 VNode가 없어 createElement로 전체를 그림' }]
    : info.patches.length
      ? info.patches.map((p) => ({ type: p.type, ...describePatch(p, prevV) }))
      : [{ type: 'NONE', target: '(없음)', detail: '바뀐 부분이 없어 DOM을 건드리지 않음' }];
  inspector.props = { rows, prevRows, info: { ...info, records: observer.takeRecords().length }, log };
  inspector.update();
  prevV = app.vnode;
  prevRows = rows;
};
app.mount(appRoot);
