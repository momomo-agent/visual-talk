# Visual Talk — Architecture Spec v2

## 核心原则

**Timeline 是唯一数据源。Canvas 是纯渲染层。**

Timeline 拥有所有持久状态。Canvas 只负责"把数据画出来"——接收完整的卡片描述，输出动画和交互。两者之间不存在双向数据流。

## 当前问题

### 1. Canvas 反向写入 Timeline

`addOperation` 中 canvas 的运行时结果被写回 operation：
```js
// ❌ 当前：canvas 结果回写 timeline
operation.card.z = card._targetZ
operation.card.zIndex = card.zIndex
operation.card.intraZ = card.intraZ
```

这意味着 operation 的内容取决于 canvas 是否执行。导航走了 → canvas 不执行 → operation 缺少字段 → computeCanvas 重建不完整。

### 2. 两套独立的状态重建逻辑

- **`applyOperation`**（streaming）：有 intraZ 计算、sibling push-back、entrance 动画、selection promotion
- **`computeCanvas`**（navigation）：简单的 depth 公式，没有 intraZ、没有 sibling 关系

同一份 operations，两条路径算出不同的结果。

### 3. UI 临时状态混入持久状态

- `selection` 是 UI 交互状态，但影响 push 行为（promotion）
- 修复方式是加 `promote` operation——正确方向，但说明设计初期没预见到
- `ensureCurrentRoundVisible` 是给 setTimeout 竞态打的补丁，不是架构解

### 4. 动画 setTimeout 没有统一管理

`restoreFrom` 中有 3 种 setTimeout（fade-out 600ms、fly-in 30ms、entranceDelay 1200ms），靠 generation counter 防竞态。脆弱——新的竞态场景需要新的 guard。

---

## 目标架构

### 数据流

```
User Input
    ↓
useSend → parseResponse
    ↓
timeline.addOperation(nodeId, op)
    ↓ (写入完成，operation 自包含)
    ├── if live → canvas.applySnapshot(computeCanvas(nodeId))
    └── if navigating → 不触发 canvas
    
Navigation
    ↓
timeline.computeCanvas(nodeId)
    ↓
canvas.applySnapshot(snapshot)
```

### 核心改变

#### 1. Operation 自包含——写入时计算完毕

`addOperation` 在写入 timeline 时就确定所有值。不依赖 canvas 的任何运行时状态。

```js
// ✅ 目标：operation 写入时就完整
function addOperation(nodeId, operation) {
  if (operation.op === 'create') {
    operation.card.id = nextId()
    operation.card.x = computeX(operation.card.data)
    operation.card.y = computeY(operation.card.data)
    operation.card.w = operation.card.data?.w || 25
  }
  node.operations.push(operation)
  invalidateFrom(nodeId)
  
  // 通知 canvas 刷新（如果在 live 视图）
  if (isLive) notifyCanvas()
}
```

#### 2. 统一的状态重建——`computeCanvas` 是唯一路径

删除 `applyOperation` 中的所有状态计算逻辑。Canvas 只接收"完整的卡片快照"。

`computeCanvas` 重放 operations，输出 `Map<id, CardSnapshot>`。这是纯函数，输入 operations，输出卡片状态。

```js
// computeCanvas 负责所有状态计算
function computeCanvas(nodeId) {
  const path = getPathFromRoot(nodeId)
  const state = new CanvasState()  // cards, depthLevel, intraZ tracking
  
  for (const node of path) {
    for (const op of node.operations) {
      state.apply(op)  // 统一的 apply 逻辑
    }
  }
  return state.cards
}
```

IntraZ 计算、sibling push-back、depth/opacity/blur 公式——全部在 `computeCanvas` 的 `state.apply()` 中实现。

#### 3. Canvas 只做两件事

```
canvas.applySnapshot(snapshot, { animate: true })   // 增量动画（streaming）
canvas.applySnapshot(snapshot, { animate: false })   // 瞬时切换（navigation）
```

Canvas 的工作：
- 接收 snapshot（Map<id, CardSnapshot>）
- Diff 现有 DOM 和 snapshot
- animate=true：entrance 动画、position 过渡
- animate=false：morphing（匹配 contentKey → 过渡，新增 → fly-in，删除 → fade-out）

Canvas **不**持有 `depthLevel`、`currentRoundIds`、`currentRoundDepth` 这些状态。

#### 4. 动画交给 CSS + 单次 requestAnimationFrame

删除所有 setTimeout 动画。用 CSS transition + `requestAnimationFrame` 批量应用状态变更：

```js
function applySnapshot(snapshot, { animate }) {
  // 1. 同步：标记要删除的、要更新的、要创建的
  // 2. 同步：设置初始状态（opacity:0 for new cards）
  // 3. requestAnimationFrame：设置目标状态，CSS transition 自动过渡
}
```

一个 rAF，不用 setTimeout。CSS transition 自动处理中断（新的 applySnapshot 来了 → CSS 从当前值过渡到新值）。

#### 5. Selection 是 Canvas 的 UI 层状态

Selection 不进入 timeline。`promote` operation 在 push 前由 useSend 写入——这是"用户选中这些卡片作为上下文"的语义记录。

Canvas 的 selection 只影响视觉（高亮、z 提升），不影响数据。

---

## 模块职责

### timeline.js

```
拥有: nodes, operations, activeTip, viewingId, nodeCounter
暴露: addOperation, computeCanvas, navigate, branchFrom, getBubbleInfo
不触碰: canvas state, DOM, animation
```

`computeCanvas` 是纯函数。用 `CanvasState` 类封装重放逻辑：

```js
class CanvasState {
  cards = new Map()
  depthLevel = 0
  pinnedIds = new Set()  // from promote + update + move
  
  apply(op) {
    switch (op.op) {
      case 'promote': this.pinnedIds.add(op.cardId); break
      case 'push': this.pushAll(); break
      case 'create': this.createCard(op); break
      case 'update': this.updateCard(op); break
      case 'move': this.moveCard(op); break
      case 'remove': this.cards.delete(op.cardId); break
    }
  }
  
  pushAll() {
    this.depthLevel++
    this.cards.forEach((card, id) => {
      if (this.pinnedIds.has(id)) {
        card.depth = this.depthLevel
        return
      }
      // depth/opacity/blur/scale 公式
    })
  }
  
  createCard(op) {
    const c = op.card
    this.cards.set(c.id, {
      // 所有属性都从 operation 读取
      // intraZ 在这里计算——基于同 round 已有的 cards
    })
  }
}
```

### canvas.js

```
拥有: cards (reactive Map), selectedIds, greetingVisible
暴露: applySnapshot, toggleSelect, clearSelection, getSelectedContext
不触碰: timeline data, operation processing
```

Canvas 不再有 `applyOperation`、`pushOldBlocks`、`beginRound`、`depthLevel`、`currentRoundIds`。

```js
function applySnapshot(snapshot, { animate = true } = {}) {
  const targetByKey = indexByContentKey(snapshot)
  const existingByKey = indexByContentKey(cards)
  
  // Diff
  const toUpdate = []   // contentKey 匹配
  const toRemove = []   // 只在 existing 中
  const toCreate = []   // 只在 snapshot 中
  
  // Apply
  if (animate) {
    // 1. Set initial state for new cards (opacity:0, z:-200)
    // 2. rAF → set target state, CSS transition handles the rest
  } else {
    // Direct assignment, no animation
  }
}
```

### useSend.js

```
职责: 协调 LLM 调用 → 写 timeline → 控制 bubble
```

不再直接读写 canvas state（除了 `getSelectedContext` 和 `selectedIds` for promote）。

Streaming 回调改为：
```js
onToken(partial) {
  // parse → 检测新 blocks/commands → timeline.addOperation()
  // timeline 内部决定是否通知 canvas 刷新
}
```

### useTimeline.js

```
职责: 键盘/滚轮事件 → 导航 → 触发 canvas 刷新
```

```js
function navigateAndRestore(direction) {
  if (!timeline.navigate(direction)) return false
  
  const nodeId = timeline.viewingId ?? timeline.activeTip
  const snapshot = timeline.computeCanvas(nodeId)
  canvas.applySnapshot(snapshot, { animate: true })
  
  if (timeline.isLive) {
    hideBubble()
  } else {
    showBubble()
  }
}
```

---

## 状态对照表

| 状态 | 当前归属 | 目标归属 | 原因 |
|------|---------|---------|------|
| card id | canvas (运行时) → 回写 timeline | timeline (写入时) | 已修 |
| card x/y | canvas 计算 → 回写 timeline | timeline (写入时) | 已修 |
| card intraZ | canvas 独有 | computeCanvas 计算 | 导航时能重建 |
| depthLevel | canvas + timeline 各一份 | timeline (computeCanvas) | 消除双源 |
| currentRoundIds | canvas | computeCanvas 内部 | 不需要持久化 |
| selection | canvas | canvas | UI 状态，正确位置 |
| promote | timeline operation | timeline operation | 已修，正确 |
| bubble text | useSend + useTimeline 混合 | 分离为两个独立源 | 已修 |

---

## 迁移步骤

1. **提取 CanvasState 类** — 从 computeCanvas 和 applyOperation 中抽取状态计算逻辑，统一到一个类
2. **让 computeCanvas 使用 CanvasState** — 替换现有的 switch/case 块
3. **让 addOperation 的 live 路径也走 computeCanvas** — 删除 canvas.applyOperation，改为 `canvas.applySnapshot(computeCanvas(nodeId))`
4. **重写 canvas.applySnapshot** — 合并 restoreFrom + applyOperation 的 UI 逻辑，用 rAF 替代 setTimeout
5. **清理 canvas store** — 删除 depthLevel、currentRoundIds、pushOldBlocks、beginRound、ensureCurrentRoundVisible
6. **更新 useSend** — 删除 canvas.beginRound()、canvas.isStreaming、ensureCurrentRoundVisible 调用

每一步都可以独立验证——旧测试应该持续通过。
