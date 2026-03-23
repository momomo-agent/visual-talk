# Dock Architecture — "拿起来 / 放回去"

## 核心概念

画布上有两层：
- **画布层（Canvas）**：树状时间线，卡片跟着对话走，可以分支、回溯、沉降
- **手边层（Docked）**：独立于时间线，用户"拿在手里"的东西

## 三个操作

| 操作 | 含义 | 数据变化 |
|------|------|----------|
| dock | 从画布拿起来 | 复制卡片数据到 `dockedSnapshots`，画布上该卡片被隐藏 |
| undock | 放回画布 | snapshot 作为 create op 注入当前 activeTip 节点，删除 snapshot |
| close | 丢掉 | 删除 snapshot，不注入。画布上保留 dock 之前的版本 |

## 数据结构

```js
// timeline store
const dockedSnapshots = reactive(new Map())
// key: cardId (same as in canvas)
// value: { card data object — full copy, independent of tree }
```

不需要 `dockedIds` Set（从 `dockedSnapshots.has()` 推导）。
不需要 `dockHistory` Map。
不需要 activeTip 注入 hack。

## 数据流

### dock(cardId)
1. 从当前 canvas snapshot 获取卡片数据
2. 深拷贝到 `dockedSnapshots.set(cardId, deepCopy(cardData))`
3. 清 canvasCache（因为 computeCanvas 需要跳过 docked 卡片）
4. 重新 applySnapshot

### AI update docked card
1. AI 发出 `vt:update {key: "playlist", ...changes}`
2. parser 解析出 update op
3. **在 addOperation 时**检查 cardId 是否在 `dockedSnapshots` 里
4. 如果是：直接 `Object.assign(dockedSnapshots.get(cardId), changes)`
5. op 不存入节点的 operations（它不属于树）
6. 触发 canvas 重新渲染（snapshot 变了）

### undock(cardId)
1. 从 `dockedSnapshots` 取出数据
2. 在 activeTip 节点注入 create op（如果树上有同 key 的卡片，用 update op）
3. `dockedSnapshots.delete(cardId)`
4. 清 canvasCache + 重新 applySnapshot

### close(cardId)
1. `dockedSnapshots.delete(cardId)`
2. 清 canvasCache + 重新 applySnapshot
3. 画布上恢复树状 replay 的原始状态

### computeCanvas(nodeId)
1. 正常树状 replay
2. replay 时：如果 cardId 在 `dockedSnapshots` 里，**跳过渲染**（不加入 state.cards）
3. replay 完成后，不注入任何 docked 卡片（它们在独立层）

### CanvasSpace rendering
1. `allCards` computed 合并两个来源：
   - canvas store 的 cards（树状 replay 结果）
   - `dockedSnapshots`（手边的东西）
2. docked 卡片用固定位置（左边 12px, top 动态计算）
3. 非 docked 卡片做 x 坐标重映射避开 dock 区域

## 序列化

```js
toJSON() {
  return {
    ...existingData,
    dockedSnapshots: Object.fromEntries(dockedSnapshots),
  }
}

fromJSON(data) {
  dockedSnapshots.clear()
  if (data.dockedSnapshots) {
    for (const [id, snap] of Object.entries(data.dockedSnapshots)) {
      dockedSnapshots.set(id, snap)
    }
  }
}
```

## 不变量

1. 一张卡片要么在画布上，要么在手边，不会同时出现在两个地方
2. docked 卡片没有历史/版本/回溯——只有当前状态
3. dock/undock/close 不影响树状时间线的 ops
4. undock 是唯一会向树注入 op 的操作
5. AI 对 docked 卡片的 update 不存入节点 ops

## CanvasState 变化

- 移除 `dockedIds` 参数——CanvasState 不再知道 dock 的存在
- `_push` 不再特殊处理 docked 卡片
- `_update` / `_move` 正常执行所有 ops
- dock 的隐藏/显示完全在 CanvasSpace computed 层处理
