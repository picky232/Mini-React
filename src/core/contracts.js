/**
 * Stage 0: 데이터와 함수 타입만 정의한다. 런타임 구현은 없다.
 * 경로 순서, 불변성 등 타입으로 표현하지 못하는 규칙은 docs/architecture.md 참고.
 */

/** @typedef {Readonly<Record<string, string>>} Attributes */
/** @typedef {Readonly<Record<string, EventListener>>} Events */

/**
 * 이벤트 이름은 click 등 소문자이며 on 접두사를 붙이지 않는다.
 * Phase 1의 DOM 역변환에서는 events가 빈 객체다.
 * @typedef {Readonly<{ attrs: Attributes, events: Events }>} VNodeProps
 */

/** @typedef {Readonly<{ kind: 'text', value: string }>} TextVNode */

/**
 * tag는 소문자 HTML 태그, children은 텍스트를 포함한 순서 있는 자식 목록이다.
 * @typedef {Readonly<{
 *   kind: 'element',
 *   tag: string,
 *   props: VNodeProps,
 *   children: ReadonlyArray<VNode>
 * }>} ElementVNode
 */

/** @typedef {ElementVNode | TextVNode} VNode */
/** @typedef {VNode | string | number | boolean | null | undefined} VNodeChild */
/** @typedef {VNode | null} Tree */

/**
 * []는 컨테이너의 단일 루트, [i, j]는 루트.childNodes[i].childNodes[j].
 * 각 인덱스는 0 이상의 정수이며 바로 앞 Patch까지 적용한 DOM을 기준으로 한다.
 * @typedef {ReadonlyArray<number>} NodePath
 */

/**
 * 같은 이름을 set과 remove에 동시에 넣지 않는다.
 * @typedef {Readonly<{
 *   setAttrs: Attributes,
 *   removeAttrs: ReadonlyArray<string>,
 *   setEvents: Events,
 *   removeEvents: ReadonlyArray<string>
 * }>} PropsDelta
 */

/** @typedef {Readonly<{ type: 'INSERT', path: NodePath, node: VNode }>} InsertPatch */
/** @typedef {Readonly<{ type: 'REMOVE', path: NodePath }>} RemovePatch */
/** @typedef {Readonly<{ type: 'REPLACE', path: NodePath, node: VNode }>} ReplacePatch */
/** @typedef {Readonly<{ type: 'TEXT', path: NodePath, value: string }>} TextPatch */
/** @typedef {Readonly<{ type: 'PROPS', path: NodePath, changes: PropsDelta }>} PropsPatch */
/** @typedef {InsertPatch | RemovePatch | ReplacePatch | TextPatch | PropsPatch} Patch */
/** @typedef {ReadonlyArray<Patch>} PatchList */

/**
 * entries는 최소 1개, 0 <= index < entries.length. null도 유효한 스냅샷이다.
 * @typedef {Readonly<{ entries: ReadonlyArray<Tree>, index: number }>} History
 */

// 다음 함수들은 구현 단계에서 각 모듈의 export에 연결할 계약이다.
/** @typedef {(tag: string, props: VNodeProps | null, children?: ReadonlyArray<VNodeChild>) => ElementVNode} H */
/** @typedef {(value: string | number) => TextVNode} CreateTextVNode */
/** @typedef {(node: Element | Text) => VNode} DomToVNode */
/** @typedef {(vnode: VNode, ownerDocument: Document) => Element | Text} CreateDOM */
/** @typedef {(previous: Tree, next: Tree) => PatchList} Diff */
/** @typedef {(container: Element, patches: PatchList) => Element | Text | null} ApplyPatches */
/** @typedef {(initial: Tree) => History} CreateHistory */
/** @typedef {(history: History, next: Tree) => History} PushHistory */
/** @typedef {(history: History) => History} Undo */
/** @typedef {(history: History) => History} Redo */
/** @typedef {(history: History) => Tree} GetCurrent */

/**
 * actual과 test는 각각 단일 루트를 소유하는 별도 컨테이너다.
 * @typedef {Readonly<{
 *   actual: HTMLElement,
 *   test: HTMLElement,
 *   patchButton: HTMLButtonElement,
 *   undoButton: HTMLButtonElement,
 *   redoButton: HTMLButtonElement
 * }>} DemoElements
 */

/** @typedef {(elements: DemoElements) => (() => void)} StartDemo */

export {};
