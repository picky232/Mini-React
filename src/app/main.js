import { diff } from '../core/diff.js';
import { createHistory, getCurrent, pushHistory, redo, undo } from '../core/history.js';
import { UnsafeInputError } from '../core/security.js';
import { domToVNode, normalizeDOM } from '../dom/from-dom.js';
import { applyPatches } from '../dom/patch.js';
import { replaceDOMTree as renderArea } from '../dom/render.js';
import { describePatch, measureFullReplace, touchedNodes } from './patch-report.js';

/** @typedef {import('../core/contracts.js').Tree} Tree */
/** @typedef {import('../core/contracts.js').History} History */

/** @param {HTMLElement} area @returns {Tree} */
function readArea(area) {
  // VNode가 버리는 주석·들여쓰기 공백을 화면에서도 지워 childNodes와 VNode 순서를 맞춘다.
  normalizeDOM(area);
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
  // 위험한 태그·속성은 domToVNode가 부르는 h()에서 막는다. 화면 입력과 코드 입력이 같은 규칙을 쓴다.

  // 요소 앞뒤의 들여쓰기는 편집기 서식이다. 주석도 루트로 세지 않는다.
  const roots = Array.from(content.childNodes).filter((node) => node.nodeType === 1 || (node.nodeType === 3 && node.textContent?.trim()));
  if (roots.length > 1) throw new RangeError('Expected at most one root.');
  const root = roots[0] ?? null;
  return root ? domToVNode(/** @type {Element | Text} */ (root)) : null;
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
export function startDemo({ actual, test, patchButton, undoButton, redoButton, status, sourceView, report }) {
  let history = createHistory(readArea(actual));
  // 실제 영역이 patch로 몇 번 바뀌었는지 센다. takeRecords()는 쌓인 기록을 동기로 꺼낸다.
  const observer = new MutationObserver(() => {});
  observer.observe(actual, { childList: true, attributes: true, characterData: true, subtree: true });

  /**
   * 방금 반영한 Patch 목록과 "innerHTML로 통째로 바꿨다면"의 비용을 나란히 보여 준다.
   * @param {Tree} previous @param {Tree} next @param {readonly import('../core/contracts.js').Patch[]} patches
   */
  function showReport(previous, next, patches) {
    const records = observer.takeRecords();
    if (!report) return;
    const full = measureFullReplace(actual.ownerDocument, previous, next);
    report.patchNodes.textContent = String(touchedNodes(records));
    report.innerNodes.textContent = String(touchedNodes(full));
    report.patchRecords.textContent = String(records.length);
    report.innerRecords.textContent = String(full.length);
    const doc = report.log.ownerDocument;
    report.log.replaceChildren(...patches.map((patch) => {
      const { type, target, detail } = describePatch(patch);
      const item = doc.createElement('li');
      const tag = Object.assign(doc.createElement('span'), { className: `tag tag-${type}`, textContent: type });
      const path = Object.assign(doc.createElement('code'), { textContent: target });
      const text = Object.assign(doc.createElement('span'), { className: 'log-detail', textContent: detail });
      item.append(tag, path, text);
      return item;
    }));
  }
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

  /** @param {Tree} saved @param {unknown} error */
  function recover(saved, error) {
    restoreArea(actual, saved);
    observer.takeRecords(); // 실패한 반영과 복구 기록은 다음 보고에 섞지 않는다
    restoreArea(test, saved);
    syncCode();
    updateControls(error instanceof UnsafeInputError
      ? `막힌 입력: ${error.message} 저장된 상태로 되돌렸어요.`
      : '적용에 실패해 저장된 상태로 복구했어요.', true);
  }

  function loadCodeDraft() {
    if (!showingCode || !sourceView || sourceView.draftCode.value === test.innerHTML) return true;
    try {
      // HTML 편집 내용을 먼저 테스트 영역에 렌더링한다. 실제 영역은 commit에서 갱신한다.
      renderArea(test, readSource(sourceView.draftCode));
      return true;
    } catch (error) {
      updateControls(error instanceof UnsafeInputError
        ? `막힌 입력: ${error.message}`
        : '루트가 하나인 HTML인지, 지원되는 태그와 속성인지 확인해 주세요.', true);
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
      showReport(saved, draft, patches);
      history = pushHistory(history, draft);
      syncCode();
      updateControls(`변경 ${patches.length}건을 반영했어요.`);
    } catch (error) {
      recover(saved, error);
    }
  }

  /** @param {(history: History) => History} move @param {string} message */
  function navigate(move, message) {
    const target = move(history);
    if (target === history) return;

    const saved = getCurrent(history);
    try {
      // 들여쓰기 공백·주석을 먼저 지워야 루트 수를 정확히 센다.
      normalizeDOM(test);
      const draft = test.childNodes.length > 1 ? undefined : readArea(test);
      const next = getCurrent(target);

      const patches = diff(saved, next);
      applyPatches(actual, patches);
      if (draft === undefined) {
        // 여러 루트가 있는 초안을 버리고 선택한 이력의 화면을 다시 만든다.
        renderArea(test, next);
      } else {
        applyPatches(test, diff(draft, next));
      }
      // 두 영역이 모두 반영된 뒤에 보고한다. 중간에 실패해 되돌린 이동은 보고하지 않는다.
      showReport(saved, next, patches);
      history = target;
      syncCode();
      updateControls(message);
    } catch (error) {
      recover(saved, error);
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
    observer.disconnect();
    patchButton.removeEventListener('click', commit);
    undoButton.removeEventListener('click', goBack);
    redoButton.removeEventListener('click', goForward);
    test.removeEventListener('input', onEdit);
    sourceView?.toggle.removeEventListener('click', toggleView);
    sourceView?.draftCode.removeEventListener('input', onEdit);
  };
}
