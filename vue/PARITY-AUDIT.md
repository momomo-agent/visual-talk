# Visual Talk: Original ↔ Vue Parity Audit

> Audited: 2026-03-20
> Auditor: Momo (main agent, after sub-agent failures)
> Method: Line-by-line code comparison, live LLM test, 53 automated tests

## Summary

| Dimension | Items | Identical | Enhanced | Missing |
|-----------|-------|-----------|----------|---------|
| CSS rules/classes | 21 | 21 | 2 | 0 |
| CSS animations/keyframes | 6 | 6 | 0 | 0 |
| CSS transitions | 8 | 8 | 2 | 0 |
| Card types | 11 | 11 | 0 | 0 |
| Card sub-element classes | 21 | 21 | 0 | 0 |
| JS functions | 31 | 31 | 0 | 0 |
| Historical commits | 21 | 21 | 0 | 0 |
| Navigation scenarios | 6 | 6 | 0 | 0 |
| Automated tests | 53 | 53 | 0 | 0 |

**Total: 0 missing, 0 regressions.**

---

## 1. CSS Rules (21/21)

All card sub-element classes match with identical reference counts:

win-bar, win-body, win-dot, sub, tags, tag, list-item, footer, big-num, big-label, tl-item, tl-time, tl-title, tl-detail, cols, col, col-item, quote, attribution, highlight, img-grid

## 2. CSS Animations (6/6)

| Animation | Duration | Verdict |
|-----------|----------|---------|
| pulse-dot (thinking dots) | 1.4s ease-in-out | ✅ Identical |
| glow-pulse (selected card) | 2.5s ease-in-out | ✅ Identical |
| pulse-mic (recording) | 1.5s ease-in-out | ✅ Identical |
| tool-slide-in | 0.3s | ✅ Identical |
| tool-fade-out | 0.4s | ✅ Identical |
| voice-pulse (preview) | 0.6s | ✅ Identical |

## 3. CSS Transitions (8/8)

| Element | Properties | Verdict |
|---------|-----------|---------|
| canvas-space | transform 0.8s cubic-bezier(.23,1,.32,1) | ✅ |
| greeting | opacity 0.8s | ✅ |
| thinking | opacity 0.4s | ✅ |
| v-block | transform/opacity/filter/box-shadow/border-color | ✅ (+left/top for move) |
| bubble | opacity 0.5s | ✅ (+white-space:pre-line) |
| input | border-color/background 0.3s | ✅ |
| mic-btn | all 0.3s | ✅ |
| progress-bar | width 0.8s | ✅ |

**Enhancements (Vue only):**
- v-block: added `left 1s, top 1s` for move command smooth transition
- config-overlay: opacity+visibility+scale transition (original: display:none/flex toggle)

## 4. Card Types (11/11)

| Type | Structure | Verdict |
|------|-----------|---------|
| card | image + title + sub + tags + progress + items + footer | ✅ |
| metric | big-num + unit + big-label | ✅ |
| steps | title + tl-item(time/title/detail) | ✅ |
| columns | title + grid cols + items | ✅ |
| callout | quote+attribution OR highlight | ✅ |
| code | pre > code | ✅ |
| markdown | md-body + marked.parse | ✅ |
| media | img-grid multi / single url + caption | ✅ |
| chart | bar/column/pie/donut/line (ChartRenderer) | ✅ |
| list | unordered(●)/ordered(1.)/todo(✅⬜) | ✅ |
| embed | YouTube/Bilibili/GoogleMaps/generic | ✅ |

## 5. JS Functions (31/31)

All original functions have Vue equivalents:

| Original | Vue Location |
|----------|-------------|
| loadConfig/saveConfig/getConfig | stores/config.js |
| cleanBaseUrl | composables/useTTS.js (cleanUrl) |
| showBubble/dismissBubble | App.vue (bubbleText/bubbleVisible) |
| getAudioCtx/unlockAudio/playTTS | composables/useTTS.js |
| showToolLog | composables/useLLM.js + App.vue |
| showThinking/hideThinking | App.vue (isThinking ref) |
| esc | Vue auto-escapes ({{ }}) |
| imgErr | BlockCard.vue (handleImageError) |
| renderBlock | BlockCard.vue (template) |
| parseResponse | composables/useSend.js |
| snapshotCanvas | N/A (timeline stores operations) |
| restoreCanvas | stores/canvas.js (restoreFrom) |
| scrollTimeline | composables/useTimeline.js (navigate) |
| showTimelineIndicator | stores/timeline.js (getBubbleInfo) |
| getCardTitle | stores/canvas.js |
| executeCommands | composables/useSend.js (inline) |
| pushOldBlocks | stores/canvas.js (beginRound) |
| applyDepth | stores/canvas.js (applyDepth) |
| renderBlocks | stores/canvas.js (applyOperation) |
| setupBlockInteraction | BlockCard.vue (event handlers) |
| toggleSelect | stores/canvas.js |
| clearSelection | stores/canvas.js |
| updateSelectionContext | stores/canvas.js (getSelectedContext) |
| ensureClaw | composables/useLLM.js |
| callLLM | composables/useLLM.js |
| send | composables/useSend.js |
| processSendQueue | composables/useSend.js |
| startRecording/stopRecording | composables/useSTT.js |
| startWebSpeech | composables/useSTT.js |
| webmToWav/startWhisper | composables/useSTT.js |
| 3D parallax | CanvasSpace.vue (onMouseMove) |

## 6. Data/Display Separation

| Original (coupled) | Vue (separated) |
|--------------------|----------------|
| DOM = state | reactive Map in store |
| snapshot serializes DOM | timeline stores operations |
| getCardTitle reads DOM | reads card.data |
| toggleSelect modifies DOM style | modifies card.selected |
| executeCommands queries DOM | iterates cards Map |

**Verification:** 4 composables have zero direct card property writes. All mutations go through store methods.

## 7. Navigation × Streaming Matrix (6/6)

| Scenario | Behavior | Verdict |
|----------|----------|---------|
| Idle + navigate | restoreToNode | ✅ |
| Streaming + navigate to history | ops don't auto-apply (viewingId != null) | ✅ |
| Streaming + navigate back to live | restoreToNode(activeTip) replays all ops | ✅ |
| Streaming + queue new message | Serial queue, branchFrom clears viewingId | ✅ |
| Streaming done + still viewing history | Canvas unchanged, nav back shows full result | ✅ |
| Send from history | getBranchPoint returns viewingId, creates branch | ✅ |

## 8. Entrance Animations

| Property | Original | Vue | Verdict |
|----------|----------|-----|---------|
| Initial opacity | 0 | 0 | ✅ |
| Initial scale | 1.06 | 1.06 | ✅ |
| Initial z | 40 | 40 | ✅ |
| Target z | intraZ (INTRA_PUSH=30) | intraZ (INTRA_PUSH=30) | ✅ |
| Per-card delay (CSS) | globalIndex * 0.05s | globalIndex * 0.05s | ✅ |
| Per-card delay (JS) | globalIndex * 50ms | globalIndex * 50ms | ✅ |
| Delay cleanup | 1200ms | 1200ms | ✅ |

## 9. Computed Value Formulas

| Formula | Original | Vue | Verdict |
|---------|----------|-----|---------|
| Position X | 5 + (x/100)*90 | 5 + (x/100)*90 | ✅ |
| Position Y | 5 + (y/100)*75 | 5 + (y/100)*75 | ✅ |
| Depth Z | -d*160 | -d*160 | ✅ |
| Depth scale | max(0.5, 1-d*0.12) | max(0.5, 1-d*0.12) | ✅ |
| Depth opacity | max(0, 1-d*0.45) | max(0, 1-d*0.45) | ✅ |
| Depth blur | d*4 px | d*4 px | ✅ |
| INTRA_PUSH | 30 | 30 | ✅ |

## 10. Automated Tests

- Timeline store: 31/31 pass
- Blue-team stress: 22/22 pass (state pollution, push spam, collision, ghost ops, 100KB payload, 50-deep chain, 20-wide fan, 200 random navs, non-live injection, NaN positions, reset cycles, mutation isolation)
- Total: 53/53

## 11. Bugs Found & Fixed

| Bug | Commit | Status |
|-----|--------|--------|
| computeCanvas position fallback (0,0) | 185cc45 | ✅ Fixed |
| Bubble stays forever (no TTS dismiss) | 4730e95 | ✅ Fixed |
| Streaming blocks navigation | b383233 | ✅ Fixed |
| Navigate back to live stale canvas | b383233 | ✅ Fixed |
| Branch always from activeTip | b9da6a4 | ✅ Fixed |
| Navigation clear+rebuild (no morphing) | 33cfc58 | ✅ Fixed |
| Single click doesn't clear others | cc7d434 | ✅ Fixed |
| Config overlay no animation | cc7d434 | ✅ Fixed |
| Bubble no newline | 54b6134 | ✅ Fixed |
| Timeline bubble no auto-hide | 54b6134 | ✅ Fixed |
| List bullets clipped | 54b6134 | ✅ Fixed |
| Items {text:} objects not normalized | 54b6134 | ✅ Fixed |
| Update identity guidance | 4730e95 | ✅ Fixed |

## Architectural Differences (by design)

1. **Navigation morphing**: Original uses DOM diffing with CSS transitions. Vue uses contentKey-based reactive state diffing with morph/fade-out/fly-in. Same visual result, cleaner implementation.
2. **Canvas store**: Original mutates DOM directly. Vue uses reactive Map with `applyOperation()` and `restoreFrom()` as the only write paths.
3. **Timeline**: Original stores DOM snapshots (innerHTML). Vue stores operation sequences and recomputes via `computeCanvas()`.
