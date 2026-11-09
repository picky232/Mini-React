import { createElement } from './vdom.js';

/** @typedef {import('./types.js').Patch} Patch */

// VNode에 들어가는 노드만 센다: 엘리먼트, 공백만이 아닌 텍스트. (domToVNode의 무시 규칙과 같아야 한다. trim은 &nbsp;까지 지워서 안 된다)
// shortcut: 주석으로 갈라진 텍스트는 VNode에선 하나로 합쳐지지만 여기선 따로 센다. 실제 영역은 로드 때 createElement로 다시 그려 그런 DOM이 없다. 임의 DOM에 patch하게 되면 여기도 맞춰야 한다
// nodeType: 1 = 엘리먼트, 3 = 텍스트, 8 = 주석. HTML 들여쓰기 줄바꿈도 텍스트 노드가 되므로 걸러야 VNode 번호와 맞는다
// 정규식 /^[ \t\n\f\r]*$/: 시작(^)부터 끝($)까지 [공백·탭·줄바꿈 중 하나]가 0번 이상(*) 반복 = "공백류만 있는 문자열"
// .test()는 JS 내장 메서드로 패턴에 맞으면 true. 앞의 !로 뒤집어 "글자가 실제로 있는 텍스트"만 센다
const counts = (n) => n.nodeType === 1 || (n.nodeType === 3 && !/^[ \t\n\f\r]*$/.test(n.nodeValue));
// counts 함수를 넘겨 자식노드들이 공백, 주석인지 아닌지 검사해서 공백·주석이 아닌 것만 모아 새 배열을 만들어 담음
// component.js의 이벤트 위임도 DOM 노드 → VNode 인덱스를 셀 때 같은 규칙을 써야 해서 내보낸다
export const kids = (node) => [...node.childNodes].filter(counts);

/** VNode 기준 path를 따라 실제 DOM 노드를 찾는다. DOM에 공백·주석이 섞여 있어도 VNode 인덱스와 맞춘다. */
function find(container, path) {
  let node = container;
  // path [1, 0] = 컨테이너의 1번 자식 → 그 0번 자식. 주소를 따라 실제 DOM을 내려감
  for (const i of path) node = kids(node)[i];
  return node;
}

/**
 * Patch 배열을 컨테이너에 앞에서부터 그대로 적용한다. path [] = 컨테이너.
 * @param {Element} container
 * @param {Patch[]} patches
 */
export function patch(container, patches) {
  // diff가 정한 순서 그대로 하나씩 적용. 실제 DOM이 바뀌는 곳은 여기뿐이다
  for (const p of patches) {
    const target = find(container, p.path);
    switch (p.type) {
      case 'CREATE':
        // 새 노드는 아직 DOM에 없어서 target = 부모. index 자리 앞에 끼우고, 자리가 없으면(null) 맨 끝에 붙임
        target.insertBefore(createElement(p.node), kids(target)[p.index] ?? null);
        break;
      case 'REMOVE':
        target.remove(); // 하위 노드까지 통째로 사라짐
        break;
      case 'REPLACE':
        // 태그 종류는 바꿀 수 없으므로 새로 만들어서 그 자리에 갈아 끼움
        target.replaceWith(createElement(p.node));
        break;
      case 'TEXT':
        target.nodeValue = p.text; // 노드는 그대로 두고 글자만 바꿈
        break;
      case 'PROPS':
        // 노드는 그대로 두고 속성만 붙이거나 지움
        for (const [name, value] of Object.entries(p.set)) {
          target.setAttribute(name, value);
          // 사용자가 한 번 입력하거나 클릭한 input은 value·checked "속성"을 바꿔도 화면이 안 바뀐다(속성은 초기값일 뿐).
          // 그래서 화면에 보이는 값인 "프로퍼티"도 같이 쓴다. 같은 값이면 쓰지 않는다: 한글 조합(IME) 중에 다시 쓰면 조합이 끊길 수 있다
          if (name === 'value' && target.value !== value) target.value = value;
          if (name === 'checked') target.checked = true;
        }
        for (const name of p.remove) {
          target.removeAttribute(name);
          if (name === 'value' && 'value' in target) target.value = '';
          if (name === 'checked') target.checked = false;
        }
        break;
      case 'MOVE': {
        // key 목록에서 순서만 바뀐 노드. 지우고 새로 만들지 않고, 이미 있는 노드를 옮긴다(insertBefore는 원래 자리에서 빼서 끼운다)
        const list = kids(target);
        target.insertBefore(list[p.from], list[p.to] ?? null);
        break;
      }
      default:
        throw new Error(`알 수 없는 patch 타입: ${p.type}`);
    }
  }
}
