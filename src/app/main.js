import { diff } from '../core/diff.js';
import { createHistory, getCurrent, pushHistory, redo, undo } from '../core/history.js';
import { domToVNode } from '../dom/from-dom.js';
import { applyPatches } from '../dom/patch.js';
import { createDOM } from '../dom/render.js';

/** @typedef {import('../core/contracts.js').Tree} Tree */
/** @typedef {import('../core/contracts.js').History} History */

/** @param {HTMLElement} area @returns {Tree} */
function readArea(area) {
  // 바깥 영역은 UI에 속한다. 그 안의 단일 루트만 스냅샷으로 읽는다.
  if (area.childNodes.length > 1) throw new RangeError('Expected at most one root.');
  const root = area.firstChild;
  return root ? domToVNode(/** @type {Element | Text} */ (root)) : null;
}

/** @param {HTMLTextAreaElement} editor @returns {Tree} */
function readSource(editor) {
  // 소스는 먼저 화면에 붙지 않는 template에서 DOM으로 파싱한다.
  const template = editor.ownerDocument.createElement('template');
  template.innerHTML = editor.value;
  const { content } = template;
  if (content.querySelector('script, style, iframe, object, embed, base, link, meta')) {
    throw new TypeError('Unsupported active HTML.');
  }
  for (const element of content.querySelectorAll('[href], [src], [action], [formaction]')) {
    for (const name of ['href', 'src', 'action', 'formaction']) {
      const url = element.getAttribute(name)?.replace(/[\x00-\x20]/g, '');
      if (url && /^javascript:/i.test(url)) throw new TypeError('Unsupported script URL.');
    }
  }

  // 요소 앞뒤의 들여쓰기는 편집기 서식이다. 요소 내부와 텍스트 루트의 공백은 보존한다.
  const roots = Array.from(content.childNodes).filter((node) => node.nodeType !== 3 || node.textContent?.trim());
  if (roots.length > 1) throw new RangeError('Expected at most one root.');
  const root = roots[0] ?? content.firstChild;
  return root ? domToVNode(/** @type {Element | Text} */ (root)) : null;
}

/** @param {HTMLElement} area @param {Tree} tree */
function renderArea(area, tree) {
  if (tree === null) {
    area.replaceChildren();
  } else {
    area.replaceChildren(createDOM(tree, area.ownerDocument));
  }
}

/** @param {HTMLElement} area @param {Tree} saved */
function restoreArea(area, saved) {
  // 명령 일부가 적용됐을 수 있으므로 현재 DOM을 다시 읽어 복구한다.
  try {
    applyPatches(area, diff(readArea(area), saved));
  } catch {
    // 주석이나 여러 루트처럼 읽을 수 없는 초안은 저장된 트리로 다시 그린다.
    renderArea(area, saved);
  }
}

/**
 * 실제 영역을 첫 이력으로 저장하고, 편집 영역에 같은 화면을 렌더링한다.
 * 예를 들어 편집 영역에서 A를 B로 바꾸면 실제 영역은 Patch 버튼을 누를 때 B가 된다.
 * Undo를 누르면 두 영역이 A로 돌아가며 아직 저장하지 않은 편집 내용도 사라진다.
 * @type {import('../core/contracts.js').StartDemo}
 */
export function startDemo({ actual, test, patchButton, undoButton, redoButton, status, sourceView }) {
  let history = createHistory(readArea(actual));
  let showingCode = false;
  renderArea(test, getCurrent(history));

  function syncCode() {
    if (!sourceView) return;
    sourceView.actualCode.value = actual.innerHTML;
    sourceView.draftCode.value = test.innerHTML;
  }

  /** @param {string} message */
  function updateControls(message, isError = false) {
    undoButton.disabled = history.index === 0;
    redoButton.disabled = history.index === history.entries.length - 1;
    if (status) {
      status.textContent = `상태 ${history.index + 1} / ${history.entries.length} · ${message}`;
      status.classList.toggle('is-error', isError);
    }
  }

  /** @param {Tree} saved */
  function recover(saved) {
    restoreArea(actual, saved);
    restoreArea(test, saved);
    syncCode();
    updateControls('적용에 실패해 저장된 상태로 복구했어요.', true);
  }

  function loadCodeDraft() {
    if (!showingCode || !sourceView || sourceView.draftCode.value === test.innerHTML) return true;
    try {
      // HTML 편집 내용을 먼저 테스트 영역에 렌더링한다. 실제 영역은 commit에서 갱신한다.
      renderArea(test, readSource(sourceView.draftCode));
      return true;
    } catch {
      updateControls('루트가 하나인 HTML인지, 지원되는 태그와 속성인지 확인해 주세요.', true);
      return false;
    }
  }

  function commit() {
    if (!loadCodeDraft()) return;
    const saved = getCurrent(history);
    try {
      const draft = readArea(test);
      const patches = diff(saved, draft);
      if (patches.length === 0) {
        syncCode();
        updateControls('반영할 변경이 없어요.');
        return;
      }

      // 실제 DOM에 적용한 다음 이력을 저장한다. Undo 이후라면 이때 미래 이력이 잘린다.
      applyPatches(actual, patches);
      history = pushHistory(history, draft);
      syncCode();
      updateControls(`변경 ${patches.length}건을 반영했어요.`);
    } catch {
      recover(saved);
    }
  }

  /** @param {(history: History) => History} move @param {string} message */
  function navigate(move, message) {
    const target = move(history);
    if (target === history) return;

    const saved = getCurrent(history);
    try {
      const draft = readArea(test);
      const next = getCurrent(target);

      // 실제 영역과 편집 영역의 현재 내용은 다를 수 있어 각각 비교한다.
      applyPatches(actual, diff(saved, next));
      applyPatches(test, diff(draft, next));
      history = target;
      syncCode();
      updateControls(message);
    } catch {
      recover(saved);
    }
  }

  const goBack = () => navigate(undo, '이전 상태로 돌아왔어요.');
  const goForward = () => navigate(redo, '다음 상태로 이동했어요.');
  const onEdit = () => updateControls('편집 중이에요. Patch를 눌러 반영하세요.');

  function toggleView() {
    if (!sourceView || !loadCodeDraft()) return;
    showingCode = !showingCode;
    if (showingCode) syncCode();
    actual.hidden = showingCode;
    test.hidden = showingCode;
    sourceView.actualCode.hidden = !showingCode;
    sourceView.draftCode.hidden = !showingCode;
    sourceView.toggle.setAttribute('aria-checked', String(showingCode));
  }

  patchButton.addEventListener('click', commit);
  undoButton.addEventListener('click', goBack);
  redoButton.addEventListener('click', goForward);
  test.addEventListener('input', onEdit);
  sourceView?.toggle.addEventListener('click', toggleView);
  sourceView?.draftCode.addEventListener('input', onEdit);
  updateControls('테스트 영역에서 내용을 편집해 보세요.');

  // 등록할 때 사용한 함수 참조로 해제한다.
  return () => {
    patchButton.removeEventListener('click', commit);
    undoButton.removeEventListener('click', goBack);
    redoButton.removeEventListener('click', goForward);
    test.removeEventListener('input', onEdit);
    sourceView?.toggle.removeEventListener('click', toggleView);
    sourceView?.draftCode.removeEventListener('input', onEdit);
  };
}
