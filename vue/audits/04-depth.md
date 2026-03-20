# Depth/Push 公式对比

对比原版 `app.js`（historical 分支）与 Vue 版 `canvas.js` + `timeline.js`。

---

## 1. pushOldBlocks / beginRound：depth 增加逻辑

### 原版 (`pushOldBlocks`)

```js
if (currentRoundDepth === depthLevel) return  // 每轮只 push 一次
depthLevel++
currentRoundDepth = depthLevel

// preserved = 本轮已被 move/update 命令加入的卡片
preserved.forEach(el => { el.dataset.depth = depthLevel })

// 被选中的卡片也提升到当前 depth
selectedBlocks.forEach(el => {
  el.dataset.depth = depthLevel
  el.dataset.pinned = '1'
  currentRoundEls.add(el)
})
clearSelection()

// 遍历所有卡片，跳过 currentRoundEls 和 timelineHidden 的
// d = depthLevel - card.depth; if d > 0 → applyDepth(el, d)
```

**调用时机**：`renderBlocks()` 开头（有新 block 时调用一次）

### Vue 版 (`canvas.js pushOldBlocks`)

```js
if (currentRoundDepth.value === depthLevel.value) return
depthLevel.value++
currentRoundDepth.value = depthLevel.value

preserved.forEach(id => { card.depth = depthLevel.value })

selectedIds.value.forEach(id => {
  card.depth = depthLevel.value
  card.pinned = true
  currentRoundIds.value.add(id)
})
clearSelection()

// 遍历所有卡片，跳过 currentRoundIds 中的
// d = depthLevel.value - card.depth; if d > 0 → applyDepth(card, d)
```

**调用时机**：`applyOperation({ op: 'push' })` 或 `applyOperation({ op: 'create' })` 内部（如果当前轮还没 push 过）

**另外**：`beginRound()` 重置 `currentRoundDepth = -1` 和 `currentRoundIds = new Set()`，供新一轮 streaming 使用。

### 对比结论

| 维度 | 原版 | Vue 版 |
|---|---|---|
| depth 递增条件 | `currentRoundDepth !== depthLevel` | 相同 ✅ |
| preserved 卡片处理 | `dataset.depth = depthLevel` | `card.depth = depthLevel.value` ✅ |
| selected 卡片提升 | `pinned='1'`, 加入 currentRoundEls | `pinned=true`, 加入 currentRoundIds ✅ |
| timelineHidden 过滤 | 跳过 `timelineHidden='1'` 的卡片 | ⚠️ 无此判断（Vue 版通过 `cards.delete` 移除不可见卡片，不保留 hidden 状态） |

**结论：一致** ✅（timelineHidden 差异是架构差异，不影响视觉效果）

---

## 2. applyDepth 公式

### 原版

```js
function applyDepth(el, d) {
  const z = -d * 160
  const s = Math.max(0.5, 1 - d * 0.12)
  const o = Math.max(0, 1 - d * 0.45)
  el.style.transform = `translateZ(${z}px) scale(${s})`
  el.style.opacity = o
  el.style.zIndex = Math.max(1, 50 - d * 20)
  el.style.filter = d >= 1 ? `blur(${d * 4}px)` : 'none'
  el.style.pointerEvents = 'auto'
  if (o <= 0 && !el.dataset.timelineHidden) el.remove()
}
```

### Vue 版 (`canvas.js`)

```js
function applyDepth(card, d) {
  const z = -d * 160
  const s = Math.max(0.5, 1 - d * 0.12)
  const o = Math.max(0, 1 - d * 0.45)
  card.z = z
  card.scale = s
  card.opacity = o
  card.zIndex = Math.max(1, 50 - d * 20)
  card.blur = d >= 1 ? d * 4 : 0
  card.pointerEvents = 'auto'
  if (o <= 0) cards.delete(card.id)
}
```

### Vue 版 (`timeline.js computeCanvas`)

```js
// push 操作内部
card.z = -d * 160
card.scale = Math.max(0.5, 1 - d * 0.12)
card.opacity = Math.max(0, 1 - d * 0.45)
card.blur = d >= 1 ? d * 4 : 0
card.zIndex = Math.max(1, 50 - d * 20)
if (card.opacity <= 0) cards.delete(card.id)
```

### 对比结论

| 参数 | 原版 | Vue canvas.js | Vue timeline.js |
|---|---|---|---|
| z | `-d * 160` | `-d * 160` ✅ | `-d * 160` ✅ |
| scale | `max(0.5, 1 - d*0.12)` | `max(0.5, 1 - d*0.12)` ✅ | `max(0.5, 1 - d*0.12)` ✅ |
| opacity | `max(0, 1 - d*0.45)` | `max(0, 1 - d*0.45)` ✅ | `max(0, 1 - d*0.45)` ✅ |
| zIndex | `max(1, 50 - d*20)` | `max(1, 50 - d*20)` ✅ | `max(1, 50 - d*20)` ✅ |
| blur | `d >= 1 ? d*4 : 'none'` | `d >= 1 ? d*4 : 0` ✅ | `d >= 1 ? d*4 : 0` ✅ |
| opacity=0 移除 | `el.remove()`（排除 timelineHidden） | `cards.delete(card.id)` ✅ | `cards.delete(card.id)` ✅ |

**结论：完全一致** ✅

---

## 3. 入场动画

### 原版 (`renderBlock` + `renderBlocks`)

**初始状态**（`renderBlock` 内设定）：
```js
el.style.transform = `translateZ(40px) scale(1.06)`
el.style.opacity = 0
el.style.zIndex = 100
```

**入场目标**（`renderBlocks` 的 rAF 回调）：
```js
el.style.transform = `translateZ(${intraZ}px) scale(1)`
el.style.opacity = 1
```

**INTRA_PUSH**：`30` px（每张新卡片把同组旧卡片往后推 30px）

**per-card delay**：
```js
el.style.transitionDelay = `${i * 0.05}s`  // i = block 在当前 slice 的 index
```

**transition**（在 `renderBlock` 中设定）：
```css
transform 1.2s cubic-bezier(.22,1,.36,1),
opacity 0.6s ease-out,
filter 0.8s,
box-shadow 0.6s,
left 1s cubic-bezier(.22,1,.36,1),
top 1s cubic-bezier(.22,1,.36,1)
```

### Vue 版 (`canvas.js applyOperation create`)

**初始状态**：
```js
card.z = 40       // translateZ(40px)
card.scale = 1.06
card.opacity = 0
card.zIndex = 100 + Math.floor(intraZ / 10)
card.entranceDelay = globalIndex * 0.05
```

**入场目标**（setTimeout 回调）：
```js
card.z = intraZ
card.scale = 1
card.opacity = 1
```

**delay 实现**：
```js
const delay = Math.max(10, globalIndex * 50)  // ms（= 0.05s * 1000 = 50ms）
setTimeout(() => { ... }, delay)
```

**INTRA_PUSH**：`30` ✅

### 对比结论

| 参数 | 原版 | Vue 版 |
|---|---|---|
| 初始 z | `40px` | `40` ✅ |
| 初始 scale | `1.06` | `1.06` ✅ |
| 初始 opacity | `0` | `0` ✅ |
| 初始 zIndex | `100`（固定） | `100 + Math.floor(intraZ / 10)` ⚠️ 略不同 |
| 目标 z | `intraZ` | `intraZ` ✅ |
| 目标 scale | `1` | `1` ✅ |
| 目标 opacity | `1` | `1` ✅ |
| INTRA_PUSH | `30` | `30` ✅ |
| per-card delay | `i * 0.05s`（CSS transitionDelay） | `Math.max(10, globalIndex * 50)` ms（setTimeout） ✅ 数值等价 |
| 动画方式 | CSS transition（rAF 双帧） | setTimeout + Vue reactivity |

**结论：基本一致** ✅（初始 zIndex 微小差异，不影响视觉）

---

## 4. 位置公式：x → left%, y → top%

### 原版 (`renderBlock`)

```js
if (data.x != null) el.style.left = `${5 + (data.x / 100) * 90}%`
if (data.y != null) el.style.top = `${5 + (data.y / 100) * 75}%`
```

- x ∈ [0,100] → left ∈ [5%, 95%]
- y ∈ [0,100] → top ∈ [5%, 80%]

### Vue 版 (`canvas.js applyOperation create`)

```js
x: data.x != null ? 5 + (data.x / 100) * 90 : 50,
y: data.y != null ? 5 + (data.y / 100) * 75 : 30,
```

### 对比结论

| 参数 | 原版 | Vue 版 |
|---|---|---|
| x 公式 | `5 + (data.x / 100) * 90` | `5 + (data.x / 100) * 90` ✅ |
| y 公式 | `5 + (data.y / 100) * 75` | `5 + (data.y / 100) * 75` ✅ |
| x fallback | 不设 left（无定位） | `50`（居中） |
| y fallback | 不设 top（无定位） | `30`（偏上） |

**结论：公式一致** ✅，fallback 行为不同但合理（Vue 版需要数值，不能留 undefined）

---

## 5. computeCanvas 中的位置 fallback

### 原版

原版没有 `computeCanvas` —— 它用 `snapshotCanvas` / `restoreCanvas` 直接操作 DOM 快照。恢复时保存并还原 `el.style.left`、`el.style.top` 等字符串值。

### Vue 版 (`timeline.js computeCanvas`)

```js
case 'create': {
  const c = op.card
  const data = c.data || {}
  cards.set(c.id, {
    x: c.x ?? (data.x != null ? 5 + (data.x / 100) * 90 : 50),
    y: c.y ?? (data.y != null ? 5 + (data.y / 100) * 75 : 30),
    ...
  })
}
```

**fallback 链**：
1. 首先用 `c.x`（卡片已保存的计算后位置，由 `addOperation` 回写）
2. 如果没有，从 `data.x` 计算：`5 + (data.x / 100) * 90`
3. 如果 `data.x` 也是 undefined：x 默认 `50`，y 默认 `30`

### 对比结论

| 维度 | 原版 | Vue 版 |
|---|---|---|
| 位置来源 | DOM 快照直接保存 `style.left/top` 字符串 | operation 中保存计算后数值 → `c.x`/`c.y` |
| 二级 fallback | 无（快照即真值） | `data.x/y` → 重新计算 |
| 三级 fallback | 无 | `x=50, y=30` |
| 位置回写 | 无（DOM 即状态） | `addOperation` 中从 canvas card 回写 `c.x/c.y` 到 operation |

**结论：架构不同但等价** ✅

Vue 版在 `addOperation` 中通过回写 `operation.card.x/y` 确保 `computeCanvas` 能还原与实时渲染一致的位置。fallback 到 `data.x/y` 重计算是防御性代码，正常流程不会触发。

---

## 总结

| # | 对比项 | 一致性 | 备注 |
|---|---|---|---|
| 1 | pushOldBlocks / depth 增加 | ✅ 一致 | timelineHidden 差异为架构差异 |
| 2 | applyDepth 公式 | ✅ 完全一致 | 5 个数值全部匹配 |
| 3 | 入场动画 | ✅ 基本一致 | 初始 zIndex 微差，动画机制不同 |
| 4 | 位置公式 | ✅ 一致 | fallback 不同但合理 |
| 5 | computeCanvas 位置 fallback | ✅ 等价 | 架构差异，通过回写机制保证一致 |

**Vue 版完整复现了原版的 depth/push 计算体系。** 五个核心公式的数值完全匹配，架构差异（DOM 直接操作 → reactive state + operation 回放）不影响最终视觉效果。
