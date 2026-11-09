import { containerToVNode, htmlToVNode, createElement, vnodeToHTML, vnodeToPrettyHTML } from '../src/vdom.js';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { createHistory } from '../src/history.js';
import { attachEditor } from './editor.js';
import { describePatch } from './log.js';

const $ = (id) => document.getElementById(id);
const real = $('real');
const textarea = $('test');

const OBSERVE = { childList: true, attributes: true, characterData: true, subtree: true };

// 노드와 그 하위 노드 개수
const countNodes = (node) => [...node.childNodes].reduce((n, c) => n + countNodes(c), 1);

// 바뀐 노드 수: 속성·텍스트 변경은 1개, 추가·삭제는 하위 노드까지 센다
function touched(records) {
  return records.reduce((sum, r) => r.type !== 'childList'
    ? sum + 1
    : sum + [...r.addedNodes, ...r.removedNodes].reduce((n, node) => n + countNodes(node), 0), 0);
}

const observer = new MutationObserver(() => {});

// 같은 변경을 innerHTML로 했을 때의 비용. 떨어진 div도 <img onerror>를 실행하므로 inert한 template 안에서 잰다
function measureInnerHTML(prev, next) {
  const box = document.createElement('template');
  box.innerHTML = vnodeToHTML(prev);
  const mo = new MutationObserver(() => {});
  mo.observe(box.content, OBSERVE); // template.innerHTML은 content 프래그먼트를 바꾼다
  box.innerHTML = vnodeToHTML(next);
  const records = mo.takeRecords();
  mo.disconnect();
  return records;
}

function showStat(key, ours, theirs) {
  $(`patch-${key}`).textContent = ours;
  $(`inner-${key}`).textContent = theirs;
}

// 라이트·다크 전환. 처음 테마는 index.html head에서 정해 둔다
const themeBtn = $('theme-toggle');
const syncThemeLabel = () => {
  themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '라이트 모드' : '다크 모드';
};
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {} // 저장이 막힌 환경이면 이번 방문에만 적용
  syncThemeLabel();
});
syncThemeLabel();

// prev → next를 실제 영역에 diff로 반영하고 결과를 보여 준다
function apply(prev, next) {
  const ps = diff(prev, next);
  observer.takeRecords(); // 이전 기록 비우기
  patch(real, ps);
  const records = observer.takeRecords();
  const inner = measureInnerHTML(prev, next);

  showStat('nodes', touched(records), touched(inner));
  showStat('records', records.length, inner.length);
  $('log').replaceChildren(...(ps.length ? ps : [null]).map((p) => {
    const li = document.createElement('li');
    if (!p) { li.textContent = '(변경 없음)'; return li; }
    const { target, detail } = describePatch(p, prev);
    const el = (tag, className, textContent) => Object.assign(document.createElement(tag), { className, textContent });
    const head = el('div', 'log-head', '');
    head.append(el('span', `tag tag-${p.type}`, p.type), el('code', 'log-path', target));
    const body = document.createElement('div');
    body.append(head, el('div', 'log-detail', detail));
    li.append(body);
    return li;
  }));
  return ps;
}

// 로드: 실제 영역 → VDOM. 주석으로 갈라진 텍스트는 VNode에선 하나, patch.js에선 둘로 세어져 path가 어긋난다. createElement로 다시 그려 이웃 텍스트가 없는 DOM을 만든다
// 실제 영역의 DOM을 읽는 건 이 한 번뿐. 이후로는 저장해 둔 VNode끼리만 비교한다
const v0 = containerToVNode(real);
real.replaceChildren(createElement(v0)); // 다시 그리기: 이제부터 실제 영역은 patch로만 바뀜
textarea.value = vnodeToPrettyHTML(v0);
attachEditor(textarea);
const history = createHistory(v0);
let step = 0;
let total = 1;
observer.observe(real, OBSERVE);

function refresh() {
  $('btn-back').disabled = !history.canBack();
  $('btn-forward').disabled = !history.canForward();
  $('step').textContent = `기록 ${step + 1} / ${total}`;
}

$('btn-patch').addEventListener('click', () => {
  const prev = history.current(); // 지금 화면에 반영된 VNode
  const next = htmlToVNode(textarea.value); // textarea는 타이핑해도 아무 일 없고, 여기서 처음 VNode가 됨
  if (diff(prev, next).length === 0) {
    $('log').replaceChildren(Object.assign(document.createElement('li'), { textContent: '(변경 없음, 기록하지 않음)' }));
    return;
  }
  apply(prev, next);
  history.push(next);
  step++;
  total = step + 1; // 앞쪽 기록은 잘린다
  refresh();
});

function move(dir) {
  // diff(지금 화면, 목표). 목표가 더 오래된 VNode여도 diff는 시간 순서를 신경 쓰지 않는다
  const prev = history.current();
  const target = dir < 0 ? history.back() : history.forward();
  if (target === prev) return;
  step += dir;
  apply(prev, target);
  textarea.value = vnodeToPrettyHTML(target);
  refresh();
}

$('btn-back').addEventListener('click', () => move(-1));
$('btn-forward').addEventListener('click', () => move(1));
refresh();
