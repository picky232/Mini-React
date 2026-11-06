import { containerToVNode, htmlToVNode, createElement, vnodeToHTML } from '../src/vdom.js';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { createHistory } from '../src/history.js';

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

// prev → next를 실제 영역에 diff로 반영하고 결과를 보여 준다
function apply(prev, next) {
  const ps = diff(prev, next);
  observer.takeRecords(); // 이전 기록 비우기
  patch(real, ps);
  const records = observer.takeRecords();
  const inner = measureInnerHTML(prev, next);

  $('patch-nodes').textContent = touched(records);
  $('patch-records').textContent = records.length;
  $('inner-nodes').textContent = touched(inner);
  $('inner-records').textContent = inner.length;
  $('log').replaceChildren(...(ps.length ? ps : [null]).map((p) => {
    const li = document.createElement('li');
    li.textContent = p ? JSON.stringify(p) : '(변경 없음)';
    return li;
  }));
  return ps;
}

// 로드: 실제 영역 → VDOM. 공백 텍스트·주석을 걸러 다시 그려야 path가 childNodes 인덱스와 맞는다
const v0 = containerToVNode(real);
real.replaceChildren(createElement(v0));
textarea.value = vnodeToHTML(v0);
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
  const prev = history.current();
  const next = htmlToVNode(textarea.value);
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
  const prev = history.current();
  const target = dir < 0 ? history.back() : history.forward();
  if (target === prev) return;
  step += dir;
  apply(prev, target);
  textarea.value = vnodeToHTML(target);
  refresh();
}

$('btn-back').addEventListener('click', () => move(-1));
$('btn-forward').addEventListener('click', () => move(1));
refresh();
