# Visual Talk Feature Audit: historical → historical-vue

## Summary
- Total features in historical (unique commits): **20**
- Implemented in Vue: **17**
- Missing: **0**
- Behavior differences: **3** (architectural redesign, not missing)

The Vue version doesn't port code 1:1 — it **reimplements** the same features with a fundamentally different architecture. The historical branch uses DOM manipulation + snapshot arrays; the Vue branch uses a reactive store + operation-based timeline tree. Every feature from historical is accounted for; the 3 "differences" are places where the Vue architecture handles things differently by design.

---

## Feature-by-Feature

### 1. `4a5626c` feat: historical timeline — scroll through conversation history
- **Status**: ✅ Implemented (redesigned)
- **Historical location**: `app.js` — `snapshotCanvas()`, `restoreCanvas()`, `scrollTimeline()`, `showTimelineIndicator()`, wheel listener
- **Vue location**: `src/stores/timeline.js` (tree store), `src/composables/useTimeline.js` (scroll/keyboard handler), `src/stores/canvas.js:restoreFrom()`
- **Notes**: Historical uses a flat `timeline[]` array of full DOM snapshots (position, opacity, innerHTML). Vue uses an operation-based timeline tree — each node stores operations (create/update/move/push/remove), and canvas state is computed by replaying operations from root to node. This is architecturally superior: no DOM serialization, smaller storage, supports branching natively. Scroll wheel behavior with accumulator + threshold (80px) is identical.

### 2. `f3b09c0` feat: arrow keys for timeline navigation
- **Status**: ✅ Implemented
- **Historical location**: `app.js` — `keydown` listener, ArrowUp/ArrowDown only
- **Vue location**: `src/composables/useTimeline.js:handleKeyDown()` L88-105
- **Notes**: Vue supports all 4 arrow keys (Up/Down/Left/Right) from the start, matching the final state of historical after commit `aa7ecd1`. Input focus check identical: skips when `input, textarea, select` is active.

### 3. `2531321` fix: timeline scroll direction was inverted
- **Status**: ✅ Implemented (never had this bug)
- **Historical location**: `app.js` — delta subtraction fix
- **Vue location**: `src/composables/useTimeline.js:handleWheel()` L68-78
- **Notes**: Vue version maps `deltaY > 0` → 'up' (scroll down = go back in time), `deltaY < 0` → 'down'. Correct from the start. The historical bug (delta subtracted instead of added) never existed in Vue because the direction mapping uses string constants, not arithmetic.

### 4. `9c024fb` feat: smooth timeline transitions — cards morph, don't rebuild
- **Status**: ⚠️ Different approach
- **Historical location**: `app.js:restoreCanvas()` — DOM diffing by contentKey, existing cards animate, missing cards fade out (translateZ:-400), new cards fade in (translateZ:-200), CSS transitions 0.6s
- **Vue location**: `src/stores/canvas.js:restoreFrom()` L222-244
- **Notes**: Historical does sophisticated DOM diffing with 3-way handling (match/hide/create) and preserves DOM elements across snapshots using `timelineHidden`. Vue takes a simpler approach: `cards.clear()` then repopulate all cards with opacity:0, then fade in after 30ms timeout. No per-card morphing — all cards fade in simultaneously. **This is a behavior difference**: historical shows smooth position/content morphing between snapshots; Vue does a full fade-in/fade-out. The Vue approach is simpler but loses the "cards sliding into new positions" effect.

### 5. `aa126cc` fix: timeline restore opacity — don't use renderBlock for new cards
- **Status**: ✅ N/A (architectural difference)
- **Historical location**: `app.js:restoreCanvas()` — bypasses `renderBlock` to avoid opacity:0 entrance override, uses raw `document.createElement('div')` with direct HTML injection
- **Vue location**: `src/stores/canvas.js:restoreFrom()` L222-244
- **Notes**: This was a DOM-specific bug where `renderBlock()` set `opacity:0` as entrance state, overriding timeline restore values. In Vue, there is no `renderBlock` — cards are reactive objects in a Map, and BlockCard.vue renders based on reactive state. The opacity:0→target animation is handled cleanly by setting opacity:0 initially then updating after 30ms. Bug cannot occur in Vue architecture.

### 6. `142c603` feat: timeline indicator uses bubble instead of custom UI
- **Status**: ✅ Implemented
- **Historical location**: `app.js:showTimelineIndicator()` — replaced custom `#timelineIndicator` div with existing `showBubble()`, added `white-space: pre-line`
- **Vue location**: `src/App.vue` L107-112 (`timelineBubbleText` computed), `src/stores/timeline.js:getBubbleInfo()` L254-273
- **Notes**: Vue uses the existing SpeechBubble component for timeline info, same as historical's final state. Timeline bubble shows "HH:MM\nmessage" with sibling arrows (‹ ›). Wired via computed properties: `timelineBubbleText` and `timelineBubbleVisible` override normal bubble when scrolling.

### 7. `1907950` fix: snapshot never stores opacity 0 for visible cards
- **Status**: ✅ N/A (architectural difference)
- **Historical location**: `app.js:snapshotCanvas()` — `opacity: (parseFloat(el.style.opacity) || 0) > 0.01 ? el.style.opacity : '1'`
- **Vue location**: `src/stores/timeline.js:computeCanvas()` L128-183
- **Notes**: Historical snapshots read DOM opacity which could be near-zero during entrance animation. Vue never reads DOM — opacity is a reactive property in the card object, set explicitly to 0 (entrance) then 1 (after delay). Timeline's `computeCanvas()` always computes opacity from operation replay, never from live render state. Bug cannot occur.

### 8. `af2fece` fix: clear card selection when scrolling timeline
- **Status**: ✅ Implemented
- **Historical location**: `app.js:scrollTimeline()` — `clearSelection(); updateSelectionContext()`
- **Vue location**: `src/composables/useTimeline.js:navigateAndRestore()` L44 — `canvas.clearSelection()`
- **Notes**: Identical behavior. Both clear selection when navigating timeline.

### 9. `8dc1ac0` fix: arrow keys swapped + no snapshot on error
- **Status**: ✅ Implemented
- **Historical location**: `app.js` — (1) arrow key direction fix: Up = back, Down = forward; (2) `snapshotCanvas` moved from `finally` to `try` block
- **Vue location**: (1) `src/composables/useTimeline.js:handleKeyDown()` — ArrowUp → 'up', ArrowDown → 'down'; (2) `src/composables/useSend.js` — timeline node is created before LLM call (`branchFrom()`), operations are only added on success; error in catch doesn't add operations → node exists but empty (effectively no snapshot)
- **Notes**: Arrow direction correct in Vue from start. Error handling: Vue creates the timeline node upfront but only populates it with operations during successful streaming. An errored response leaves an empty node, which is functionally equivalent to "no snapshot on error" since `computeCanvas()` would return the parent's state.

### 10. `b78c067` feat: new message grows from historical canvas state
- **Status**: ⚠️ Different approach
- **Historical location**: `app.js:send()` — keeps current canvas when `timelinePos !== -1`, filters `timelineHidden` cards from context, new response renders on top of historical state
- **Vue location**: `src/composables/useSend.js:send()` L66-79 — always sends from `activeTip` via `getBranchPoint()` + `branchFrom()`; `src/stores/timeline.js:getBranchPoint()` L246 always returns `activeTip`
- **Notes**: **Behavior difference.** Historical allows "branching from where you're viewing" — if you scroll to snapshot B and send a message, the new response grows from B's canvas. Vue's `getBranchPoint()` always returns `activeTip` (the latest node on the active branch), meaning viewing history then sending continues from the tip, not from the viewed node. The comment in timeline.js L243 explicitly says: "Send always continues from the active tip — not from where you're viewing. Viewing history is just looking back, not going back." This is a deliberate design choice in Vue, different from historical.

### 11. `aa7ecd1` feat: tree-based timeline with branch navigation
- **Status**: ✅ Implemented (redesigned)
- **Historical location**: `app.js` — timeline converted from flat array to tree: `parentIndex`, `children[]`, `lastChildIndex`, 4-direction `scrollTimeline()`, sibling arrows in bubble
- **Vue location**: `src/stores/timeline.js` (full tree implementation), `src/composables/useTimeline.js` (4-direction navigation)
- **Notes**: Vue implements the same tree structure with a cleaner API. Node data: `parentId`, `childIds[]`, `lastChildId`. Navigation: `navigate(direction)` handles up/down/left/right. `siblingInfo` computed property provides ‹ › arrow data. `getBubbleInfo()` formats the display. `lastChildId` remembers last-visited branch, same as historical. Key difference: Vue uses a `Map` keyed by auto-incrementing IDs instead of array indices.

### 12. `3b87933` fix: don't auto-hide bubble at branch tip
- **Status**: ✅ Implemented (with refinement)
- **Historical location**: `app.js` — removed code that auto-exited history mode at active branch tip
- **Vue location**: `src/composables/useTimeline.js:navigateAndRestore()` L47-54
- **Notes**: Vue handles this more elegantly: when navigating to a node where `timeline.isLive` (i.e., viewing the active tip), it clears the scrolling state and bubble. When not live, it shows the bubble with a 3s auto-hide timer. This combines the behavior of commits `3b87933` and `c643d24`.

### 13. `c643d24` fix: branch tip 3s fade + depth reset on historical branch
- **Status**: ⚠️ Partial (bubble fade yes, depth reset N/A)
- **Historical location**: `app.js` — (1) active branch tip shows bubble for 3s then auto-hides; (2) `depthLevel` reset to `snap.depth` when branching from history
- **Vue location**: (1) `src/composables/useTimeline.js:showTimelineBubble()` L28-33 — 3s `bubbleHideTimer`; (2) `src/stores/canvas.js:restoreFrom()` L230 — `depthLevel.value = maxDepth`
- **Notes**: (1) The 3s bubble fade is implemented via `showTimelineBubble()` with setTimeout. (2) Depth reset: Vue's `restoreFrom()` always sets `depthLevel` to `maxDepth` from the computed canvas, which achieves the same effect. However, since Vue's `getBranchPoint()` always sends from activeTip (not from viewed node), the "branching from history" scenario that triggered this bug in historical doesn't arise the same way in Vue.

### 14. `a6e3d45` debug: add restore canvas logging to diagnose missing cards
- **Status**: ✅ N/A (debug only)
- **Historical location**: `app.js:restoreCanvas()` — console.log of target count, existing DOM count, matched/hidden/created breakdown
- **Vue location**: N/A
- **Notes**: Debug logging, not a feature. Vue doesn't need this because there's no DOM diffing to debug — canvas state is purely reactive.

### 15. `b164f95` fix: list bullets/numbers clipped by global padding reset
- **Status**: ✅ Implemented
- **Historical location**: `style.css` — added `padding-left: 1.4em` for `.v-block .md-body ul/ol` and `.v-block ul/ol`
- **Vue location**: `src/styles/blocks.css` L58-61
- **Notes**: Identical CSS rules. `.v-block .md-body ul, .v-block .md-body ol { padding-left: 1.4em; }` and `.v-block ul, .v-block ol { padding-left: 1.4em; }` plus `li { margin-bottom: 2px; }` — exact same fix.

### 16. `8fb43f5` prompt: stronger update-over-create guidance
- **Status**: ✅ Implemented
- **Historical location**: `app.js` system prompt — added "Two cards about the same topic is always wrong" and "Before creating any card, check existing"
- **Vue location**: `src/lib/system-prompt.js`
- **Notes**: The Vue prompt includes the final evolved version of this guidance, including the "living document" narrative from `f3ed3bc` and the citation metaphor from `2113cd9`. The intermediate "Before creating any card, check" phrasing was replaced by the narrative form.

### 17. `f3ed3bc` prompt: guide reuse with narrative, not commands
- **Status**: ✅ Implemented
- **Historical location**: `app.js` system prompt — replaced bullet rules with narrative ("A canvas where cards evolve feels like a mind at work")
- **Vue location**: `src/lib/system-prompt.js` — contains exact text: "A canvas where every question spawns fresh cards feels like amnesia. A canvas where cards evolve feels like a mind at work."
- **Notes**: Full narrative present in Vue, word-for-word match with historical's final state.

### 18. `2113cd9` fix: card items support {text:} objects + prompt: move as citation
- **Status**: ✅ Implemented
- **Historical location**: `app.js` — (1) renderBlock: `it.text || it.title || it.label` fallback chain; (2) prompt: "move it into your new composition — like citing a source"
- **Vue location**: (1) `src/lib/parser.js:parseResponse()` L17-27 — normalizes items at parse time: `typeof it === 'string' ? it : (it.text || it.title || it.label || '')`; (2) `src/lib/system-prompt.js` — contains "like citing a source you've already laid out"
- **Notes**: Vue implements the cleaner version from commit `0a53fec` (normalize at parse, not render). Both parser normalization and citation prompt present.

### 19. `901fb47` refactor: unified itemText() for all item rendering
- **Status**: ✅ Superseded by `0a53fec`
- **Historical location**: `app.js:itemText()` — single function for string/{text:}/{title:}/{label:} extraction, used by card/list/column renderers
- **Vue location**: `src/lib/parser.js:parseResponse()` L17-27
- **Notes**: The `itemText()` function was an intermediate step. `0a53fec` moved normalization to parse time, eliminating `itemText()` entirely. Vue implements the final approach: normalize in `parseResponse()`, renderers just use strings directly.

### 20. `c82da38` fix: pushOldBlocks skips timelineHidden cards
- **Status**: ✅ N/A (architectural difference)
- **Historical location**: `app.js:pushOldBlocks()` — added `if (old.dataset.timelineHidden === '1') return` to prevent hidden DOM elements from being processed/removed
- **Vue location**: `src/stores/canvas.js:pushOldBlocks()` L47-71
- **Notes**: Historical used `timelineHidden` data attribute on DOM elements to mark cards that were "hidden" during timeline navigation but still needed to exist for morphing. Vue doesn't have this concept — `restoreFrom()` does `cards.clear()` and rebuilds, no hidden cards. `pushOldBlocks()` operates only on reactive card objects that are always visible. Bug cannot occur.

### 21. `0a53fec` refactor: normalize items at parse, not render
- **Status**: ✅ Implemented
- **Historical location**: `app.js:parseResponse()` — items normalized to strings at parse time, `itemText()` removed, list items keep `{text, done}` for todo semantics
- **Vue location**: `src/lib/parser.js:parseResponse()` L15-27
- **Notes**: Exact same approach. Items normalized via `.map(it => typeof it === 'string' ? it : (it.text || it.title || it.label || ''))`. Column items also normalized. List type is handled separately in BlockCard.vue with `{text, done}` objects for todo rendering.

---

## Architectural Comparison

| Aspect | historical (app.js) | historical-vue |
|--------|-------------------|----------------|
| **State management** | Global variables, DOM as source of truth | Pinia stores (timeline, canvas, config) |
| **Timeline data** | Array of full DOM snapshots (position, opacity, innerHTML) | Tree of operation lists, canvas computed by replay |
| **Canvas restore** | DOM diffing: match by contentKey, animate existing, hide/create others | Clear & rebuild: `cards.clear()` + fade-in all |
| **Timeline navigation** | Direct DOM manipulation | Reactive: `viewingId` triggers computed updates |
| **Card rendering** | `renderBlock()` generates HTML strings, `innerHTML` injection | Vue components (BlockCard.vue) with reactive props |
| **Branching behavior** | Send from viewed node (branch from any point) | Always send from active tip (history is read-only) |
| **Hidden cards** | `timelineHidden` DOM attribute, ghost elements for morphing | No concept — clear and rebuild |

## Key Design Decisions in Vue Version

1. **Operation-based timeline** instead of snapshot-based: Smaller storage, supports undo/redo potential, cleaner branching semantics.
2. **Send from active tip only**: Deliberate choice to make history viewing a pure read operation. Simplifies branch management but loses "grow from any point" capability.
3. **Simple restore (clear+rebuild)** instead of DOM morphing: Trades visual smoothness for code simplicity and correctness. No `timelineHidden` ghost cards, no opacity fallback chains, no `renderBlock` bypass hacks.
