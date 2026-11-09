/** @typedef {import('./types.js').VNode} VNode */
/** @typedef {import('./types.js').Patch} Patch */
import { PATCH, TEXT } from './types.js';

/**
 * 두 #root VNode를 비교해 Patch 배열을 만든다. DOM을 쓰지 않는 순수 함수.
 * 순서 규칙은 src/types.js 참고.
 * @param {VNode} oldV
 * @param {VNode} newV
 * @returns {Patch[]}
 */
export function diff(oldV, newV) {
  const patches = [];
  // #root 자신은 비교하지 않고 자식 리스트부터 시작 (컨테이너는 바뀌지 않는 틀)
  diffChildren(oldV.children, newV.children, [], patches);
  return patches;
}

// 같은 위치의 두 노드 비교. 순서: 타입 → 텍스트 → 속성 → 자식 재귀
function diffNode(a, b, path, patches) {
  // 같은 객체면 하위까지 전부 같다. memo가 이전 렌더의 VNode를 그대로 돌려준 경우로, 하위 트리 비교를 통째로 건너뛴다
  if (a === b) return;
  // 태그 종류가 다르면 DOM에서 고쳐 쓸 수 없으니 새 노드로 통째로 교체
  if (a.type !== b.type) {
    patches.push({ type: PATCH.REPLACE, path, node: b });
    return; // 통째로 바뀌므로 하위는 비교하지 않는다
  }
  // 텍스트 노드는 자식이 없어서 글자만 비교하고 끝
  if (a.type === TEXT) {
    if (a.text !== b.text) patches.push({ type: PATCH.TEXT, path, text: b.text });
    return;
  }
  // set[k] = 대입은 k가 '__proto__'일 때 setter로 사라지므로 fromEntries로 만든다
  // 새 속성 중 이전에 없었거나 값이 바뀐 것만 {이름: 값} 객체로 묶음
  const set = Object.fromEntries(Object.entries(b.props).filter(([k, v]) => !Object.hasOwn(a.props, k) || a.props[k] !== v));
  // 사라진 속성의 이름만 remove 배열에 남김
  const remove = Object.keys(a.props).filter((k) => !Object.hasOwn(b.props, k));
  // set·remove 중 하나라도 있으면 PROPS patch 하나로 기록
  if (Object.keys(set).length || remove.length) patches.push({ type: PATCH.PROPS, path, set, remove });
  // 자식 리스트 비교로 내려감
  diffChildren(a.children, b.children, path, patches);
}

function diffChildren(oldC, newC, path, patches) {
  // 양쪽 형제 전부에 서로 다른 key가 있으면 위치가 아니라 key로 짝짓는다
  if (isKeyed(oldC) && isKeyed(newC)) return diffKeyed(oldC, newC, path, patches);
  const common = Math.min(oldC.length, newC.length);
  // 겹치는 자식끼리 같은 인덱스로 짝지어 diffNode로 재귀. path에 내 인덱스를 붙여 주소를 만듦
  for (let i = 0; i < common; i++) diffNode(oldC[i], newC[i], [...path, i], patches);
  // 뒤에서부터 지워야 patch가 순서대로 적용해도 앞 인덱스가 밀리지 않는다
  // 이전 자식 리스트가 더 길면 남는 자식을 뒤에서부터 REMOVE로 등록 (path = 지울 노드)
  for (let i = oldC.length - 1; i >= common; i--) patches.push({ type: PATCH.REMOVE, path: [...path, i] });
  // 새 자식 리스트가 더 길면 남는 자식을 앞에서부터 CREATE로 등록 (path = 부모, index = 넣을 자리)
  for (let i = common; i < newC.length; i++) patches.push({ type: PATCH.CREATE, path, index: i, node: newC[i] });
}

// key가 하나라도 빠지거나 겹치면 정체성을 믿을 수 없으므로 위치 비교로 돌아간다
function isKeyed(list) {
  const keys = list.map((c) => c.key);
  return keys.every((k) => k != null) && new Set(keys).size === keys.length;
}

/*
 * key 목록 비교. 위치 비교는 맨 앞에 하나만 끼워도 뒤의 모든 노드가 "글자가 바뀜"으로 보이지만,
 * key 비교는 같은 key = 같은 노드로 보고 그 노드를 지우지 않고 옮기기만 한다.
 * 예: [a,b,c] → [x,a,b,c]  위치 비교 TEXT 3개 + CREATE 1개 / key 비교 CREATE 1개
 */
function diffKeyed(oldC, newC, path, patches) {
  const newByKey = new Map(newC.map((c) => [c.key, c]));
  const oldKeys = new Set(oldC.map((c) => c.key));

  // a. 같은 key끼리 내용 비교. 아직 이 층에서는 아무것도 옮기지 않았으므로 path는 이전 위치 i
  oldC.forEach((a, i) => {
    if (newByKey.has(a.key)) diffNode(a, newByKey.get(a.key), [...path, i], patches);
  });

  // b. 새 목록에 없는 key 삭제. 뒤에서부터 지워야 앞 인덱스가 밀리지 않는다
  for (let i = oldC.length - 1; i >= 0; i--) {
    if (!newByKey.has(oldC[i].key)) patches.push({ type: PATCH.REMOVE, path: [...path, i] });
  }

  // c. 순서 맞추기. cur = 지금 DOM에 남은 key 순서, target = 그 key들이 가야 할 순서
  const cur = oldC.map((c) => c.key).filter((k) => newByKey.has(k));
  const target = newC.map((c) => c.key).filter((k) => oldKeys.has(k));
  // 가장 긴 증가 부분수열(LIS)에 든 노드는 서로 순서가 이미 맞으니 그대로 두고, 나머지만 옮긴다 → MOVE 개수 최소
  const curIndex = new Map(cur.map((k, i) => [k, i]));
  const stay = longestIncreasing(target.map((k) => curIndex.get(k)));
  // 뒤에서부터 정한다: target[i+1]은 이미 제자리이므로 그 앞에 끼우면 된다
  for (let i = target.length - 1; i >= 0; i--) {
    if (stay.has(i)) continue;
    const key = target[i];
    const anchor = target[i + 1]; // 없으면 맨 끝
    const from = cur.indexOf(key);
    const to = anchor === undefined ? cur.length : cur.indexOf(anchor);
    patches.push({ type: PATCH.MOVE, path, from, to });
    // patch가 DOM에 하는 일을 cur에도 똑같이 해서 다음 MOVE의 인덱스를 맞춘다
    cur.splice(from, 1);
    cur.splice(anchor === undefined ? cur.length : cur.indexOf(anchor), 0, key);
  }

  // d. 새 key 만들기. 앞쪽이 이미 최종 순서이므로 새 인덱스 오름차순으로 끼우면 제자리에 들어간다
  newC.forEach((b, i) => {
    if (!oldKeys.has(b.key)) patches.push({ type: PATCH.CREATE, path, index: i, node: b });
  });
}

/**
 * 가장 긴 증가 부분수열의 "인덱스" 집합. O(n log n). Vue 3의 key 재조정과 같은 방법.
 * 예: [a,b,c,d] → [b,c,d,a] 이면 seq = [1, 2, 3, 0] → {0, 1, 2}. b·c·d는 그대로, a 하나만 맨 끝으로 옮긴다
 * @param {number[]} seq
 * @returns {Set<number>}
 */
export function longestIncreasing(seq) {
  const tails = []; // tails[len] = 길이 len+1인 증가 수열 중 끝값이 가장 작은 것의 끝 인덱스
  const prev = []; // prev[i] = 수열에서 i 바로 앞 원소의 인덱스 (거꾸로 따라가 복원)
  seq.forEach((v, i) => {
    // 이분 탐색: v보다 끝값이 작은 가장 긴 수열을 찾아 그 뒤에 v를 붙인다
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const out = new Set();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.add(i);
  return out;
}
