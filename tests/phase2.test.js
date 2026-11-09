// Phase 2 확인 페이지(임시 할 일 앱) 기능 테스트: 사용자가 하는 조작을 jsdom에서 그대로 흉내 내고 화면과 patch를 확인한다
import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionComponent } from '../src/component.js';
import { App, STORAGE_KEY } from '../phase2/App.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

let app;
let root;
let commits;

function start() {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  app = new FunctionComponent(App);
  commits = [];
  app.onCommit = (info) => commits.push({ ...info, types: info.patches.map((p) => p.type) });
  app.mount(root);
}

const $ = (sel) => root.querySelector(sel);
const items = () => [...root.querySelectorAll('.todo-list li')];
const texts = () => items().map((li) => li.querySelector('span').textContent);
const last = () => commits.at(-1);

async function type(value) {
  const input = $('input[name="todo"]');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}
async function submit() {
  $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
}
async function click(node) {
  node.click();
  await flush();
}
const button = (label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

beforeEach(() => {
  localStorage.clear();
  start();
});

describe('Phase 2 확인 페이지: 할 일 앱', () => {
  it('처음엔 샘플 3개를 그리고 남은 개수를 보여 준다', () => {
    expect(texts()).toEqual(['장보기', '운동 & 스트레칭', 'Phase 2 발표 준비']);
    expect($('.todo-count').textContent).toBe('남은 일 2개 · 전체 3개');
    expect(document.title).toBe('할 일 2개 · Mini React');
  });

  it('추가: 맨 앞에 CREATE 1개, 기존 li는 그대로, 입력창은 비워진다', async () => {
    const before = items();
    await type('빨래');
    expect(last().memoHits).toBe(3); // 타이핑 중엔 목록 항목을 다시 부르지 않는다
    await submit();
    expect(texts()[0]).toBe('빨래');
    expect(items().slice(1)).toEqual(before);
    expect(last().types.filter((t) => t === 'CREATE')).toHaveLength(1);
    expect(last().types).not.toContain('REPLACE');
    expect(last().types).not.toContain('REMOVE');
    expect($('input[name="todo"]').value).toBe('');
    expect($('.todo-count').textContent).toBe('남은 일 3개 · 전체 4개');
  });

  it('공백만 입력하면 추가하지 않고, 추가 버튼은 비활성이다', async () => {
    await type('   ');
    expect(button('추가').disabled).toBe(true);
    await submit();
    expect(items()).toHaveLength(3);
  });

  it('체크: 그 항목만 다시 그리고(나머지는 memo), 개수와 탭 제목이 바뀐다', async () => {
    await click(items()[1].querySelector('input'));
    expect(items()[1].className).toBe('done');
    expect(last().memoHits).toBe(2);
    expect($('.todo-count').textContent).toBe('남은 일 1개 · 전체 3개');
    expect(document.title).toBe('할 일 1개 · Mini React');
  });

  it('삭제: REMOVE 1개', async () => {
    await click(items()[0].querySelector('.remove'));
    expect(texts()).toEqual(['운동 & 스트레칭', 'Phase 2 발표 준비']);
    expect(last().types.filter((t) => t === 'REMOVE')).toHaveLength(1);
  });

  it('필터: 진행 중 / 완료 / 비었을 때 문구', async () => {
    await click(button('진행 중'));
    expect(texts()).toEqual(['운동 & 스트레칭', 'Phase 2 발표 준비']);
    expect(button('진행 중').getAttribute('aria-pressed')).toBe('true');
    await click(button('완료'));
    expect(texts()).toEqual(['장보기']);
    await click(items()[0].querySelector('input')); // 완료 해제 → 완료 목록이 빈다
    expect($('.todo-empty').textContent).toBe('할 일이 없어요');
  });

  it('setState ×3: 렌더 1번에 3개가 추가된다 (batching)', async () => {
    const renders = app.renderCount;
    await click(button('setState ×3'));
    expect(app.renderCount).toBe(renders + 1);
    expect(last().batched).toBe(3);
    expect(texts().slice(0, 3)).toEqual(['일기 쓰기', '스트레칭', '물 마시기']);
  });

  it('순서 뒤집기: MOVE만 나오고 li 노드는 재사용된다', async () => {
    const before = items();
    await click(button('순서 뒤집기'));
    expect(texts()).toEqual(['Phase 2 발표 준비', '운동 & 스트레칭', '장보기']);
    expect(last().types).toEqual(['MOVE', 'MOVE']);
    expect(items()).toEqual([...before].reverse());
  });

  it('localStorage에 저장하고, 다시 mount하면 불러온다', async () => {
    await type('저장 확인');
    await submit();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))[0].text).toBe('저장 확인');
    app.unmount();
    start();
    expect(texts()[0]).toBe('저장 확인');
  });

  it('저장된 값이 깨져 있으면 샘플로 시작한다', () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    start();
    expect(items()).toHaveLength(3);
  });
});
