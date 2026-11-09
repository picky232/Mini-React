/** @typedef {import('./contracts.js').Tree} Tree */
/** @typedef {import('./contracts.js').NodePath} NodePath */
/** @typedef {import('./contracts.js').Patch} Patch */

/**
 * 두 속성/이벤트 객체에서 설정할 항목과 삭제할 이름을 분리한다.
 * 속성 문자열은 값으로, 이벤트 함수는 참조로 비교한다.
 * @template T
 * @param {Readonly<Record<string, T>>} previous
 * @param {Readonly<Record<string, T>>} next
 * @returns {{ set: Record<string, T>, remove: string[] }}
 */
function diffRecords(previous, next) {
  // hasOwn으로 상속된 프로퍼티와 실제 데이터 필드를 구분한다.
  // fromEntries는 __proto__ 같은 이름도 자체 데이터 필드로 만든다.
  const set = Object.fromEntries(Object.entries(next).filter(([name, value]) => (
    !Object.hasOwn(previous, name) || previous[name] !== value
  )));
  const remove = Object.keys(previous).filter((name) => !Object.hasOwn(next, name));
  return { set, remove };
}

/**
 * 이전/다음 VNode를 같은 위치끼리 비교하여 순서가 있는 Patch 목록을 만든다.
 * DOM에 접근하지 않고 입력을 변경하지 않는다. node 값은 불변 VNode를 참조한다.
 *
 * 한계 1: key나 MOVE가 없어 재정렬 시 항목 정체성과 최소 변경 수를 보장하지 않는다.
 * 한계 2: 재귀 호출이므로 매우 깊은 트리는 JavaScript 호출 스택 한도를 넘을 수 있다.
 * @type {import('./contracts.js').Diff}
 */
export function diff(previous, next) {
  /** @type {Patch[]} */
  const patches = [];

  /**
   * @param {Tree} before
   * @param {Tree} after
   * @param {NodePath} path
   * @returns {void}
   */
  function compare(before, after, path) {
    // 불변 입력에서 같은 참조는 같은 트리다. null끼리 비교하는 경우도 포함한다.
    if (before === after) return;

    if (before === null) {
      if (after !== null) patches.push({ type: 'INSERT', path, node: after });
      return;
    }
    if (after === null) {
      patches.push({ type: 'REMOVE', path });
      return;
    }

    // 노드 종류가 바뀌면 해당 서브트리를 통째로 교체하므로 자식은 비교하지 않는다.
    if (before.kind !== after.kind) {
      patches.push({ type: 'REPLACE', path, node: after });
      return;
    }
    if (before.kind === 'text' && after.kind === 'text') {
      if (before.value !== after.value) patches.push({ type: 'TEXT', path, value: after.value });
      return;
    }

    if (before.kind === 'element' && after.kind === 'element') {
      // 같은 Element 종류라도 div → p처럼 태그가 바뀌면 교체한다.
      if (before.tag !== after.tag) {
        patches.push({ type: 'REPLACE', path, node: after });
        return;
      }

      const attrs = diffRecords(before.props.attrs, after.props.attrs);
      const events = diffRecords(before.props.events, after.props.events);
      if (Object.keys(attrs.set).length || attrs.remove.length
        || Object.keys(events.set).length || events.remove.length) {
        patches.push({
          type: 'PROPS',
          path,
          changes: {
            setAttrs: attrs.set,
            removeAttrs: attrs.remove,
            setEvents: events.set,
            removeEvents: events.remove,
          },
        });
      }

      // 공통 구간의 비교는 부모의 자식 수를 바꾸지 않으므로 기존 인덱스를 유지한다.
      const commonLength = Math.min(before.children.length, after.children.length);
      for (let index = 0; index < commonLength; index += 1) {
        // 경로 배열을 새로 만들어 형제·하위 노드의 경로가 서로 섞이지 않게 한다.
        compare(before.children[index] ?? null, after.children[index] ?? null, [...path, index]);
      }

      // 뒤에서 삭제하면 아직 삭제하지 않은 앞쪽 형제들의 인덱스가 바뀌지 않는다.
      for (let index = before.children.length - 1; index >= after.children.length; index -= 1) {
        patches.push({ type: 'REMOVE', path: [...path, index] });
      }

      // 앞에서 추가하면 각 INSERT의 인덱스가 그 시점의 자식 수와 일치한다.
      for (let index = before.children.length; index < after.children.length; index += 1) {
        compare(null, after.children[index] ?? null, [...path, index]);
      }
    }
  }

  compare(previous, next, []);
  return patches;
}
