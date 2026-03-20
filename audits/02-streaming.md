# Streaming 处理对比

审计日期: 2026-03-20

---

## 1. System Prompt 是否逐字一致

**Original** (`app.js` 内联 `const SYSTEM`):

```
const SYSTEM = `You are Samantha — an AI that expresses itself...
...
Cards belong to the canvas, not to individual responses. You can bring old cards forward when they serve your new response. - \`
```

共约 4464 字符（归一化后），到 Canvas Commands 部分列完 move/update 语法后截止。


**Vue** (`lib/system-prompt.js`):

```js
export const SYSTEM = `You are Samantha — ...
// 前 4464 字符与原版逐字一致
// 之后多出 ~3630 字符的额外 guidance：
//   - Update = same entity 详细说明
//   - Don't move cards just to rearrange
//   - Composition is spatial storytelling（带具体坐标示例）
//   - When to reuse vs create new（5 条规则）
//   - Visual center of gravity
//   - Finding Images 段落
```

**Verdict: ❌ 不一致 — Vue 是原版的超集**

前半部分（类型定义 + Canvas Commands 语法）逐字一致。Vue 新增了大量 Canvas Commands 使用指南和 Finding Images 段落（原版没有这些内容）。原版 system prompt 在 Canvas Commands 节刚列完 move/update 语法就结束了，之后的 "Don't move cards just to rearrange"、"Composition is spatial storytelling" 等段落全是 Vue 新增。

---

## 2. Tools 定义（web_search）是否一致

**Original** (`app.js` ensureClaw):

```js
tools: [{
  name: 'web_search',
  description: 'Search the web for information, images, news. Use for ANY question needing real-world facts, current events, image URLs, or verification.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      search_depth: { type: 'string', enum: ['basic', 'advanced'] },
      include_images: { type: 'boolean', description: 'Include image URLs' }
    },
    required: ['query']
  },
  execute: async (input) => executeTool('web_search', input, cfg.tavilyKey)
}],
```

**Vue** (`useLLM.js` ensureClaw):

```js
tools: [{
  name: 'web_search',
  description: 'Search the web for information, images, news. Use for ANY question needing real-world facts, current events, image URLs, or verification.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      search_depth: { type: 'string', enum: ['basic', 'advanced'] },
      include_images: { type: 'boolean', description: 'Include image URLs' },
    },
    required: ['query'],
  },
  execute: async (input) => tavilySearch(input, cfg.tavilyKey),
}],
```

**Verdict: ✅ 一致**

name、description、parameters schema 完全相同。唯一区别是 execute 调用方式：原版通过 `executeTool('web_search', input, key)` 间接分发（tools.js），Vue 直接调用 `tavilySearch(input, key)`。底层 Tavily 搜索实现逻辑也一致（直连 → proxy fallback、payload 结构、结果映射）。

---

## 3. onToken 回调：parseResponse + blocks 增量检测

**Original** (`app.js` processSendQueue):

```js
let lastBlockCount = 0
let lastCommandCount = 0
// ...
const reply = await callLLM(prompt,
  (partial) => {
    const { blocks, commands } = parseResponse(partial)
    if (commands.length > lastCommandCount) {
      executeCommands(commands.slice(lastCommandCount))
      lastCommandCount = commands.length
    }
    if (blocks.length > lastBlockCount) {
      renderBlocks(blocks.slice(lastBlockCount), lastBlockCount)
      lastBlockCount = blocks.length
    }
  },
  // onSpeech...
)
```

直接调用 `parseResponse(partial)`，用 `lastBlockCount` / `lastCommandCount` 做增量检测，新增的 blocks 直接用 `renderBlocks` 渲染到 DOM，commands 直接用 `executeCommands` 执行。

**Vue** (`useSend.js` processSendQueue):

```js
let lastBlockCount = 0
let lastCommandCount = 0
// ...
const reply = await callLLM(prompt,
  (partial) => {
    const { blocks, commands } = parseResponse(partial)
    // commands
    if (commands.length > lastCommandCount) {
      commands.slice(lastCommandCount).forEach(cmd => {
        // 先匹配 card IDs
        const matchedIds = []
        canvas.cards.forEach(card => { /* title match */ })
        if (cmd.cmd === 'move') {
          matchedIds.forEach(cardId => {
            timeline.addOperation(nodeId, { op: 'move', cardId, to: { x, y, z } })
          })
        } else if (cmd.cmd === 'update') { /* similar */ }
      })
      lastCommandCount = commands.length
    }
    // blocks
    if (blocks.length > lastBlockCount) {
      blocks.slice(lastBlockCount).forEach((b, i) => {
        const idx = lastBlockCount + i
        if (!pushRecorded) {
          timeline.addOperation(nodeId, { op: 'push' })
          pushRecorded = true
        }
        timeline.addOperation(nodeId, {
          op: 'create', globalIndex: idx,
          card: { type: b.type, data: { ...b.data }, contentKey: `r${canvas.depthLevel}-${idx}` }
        })
      })
      lastBlockCount = blocks.length
    }
  },
  // onSpeech...
)
```

**Verdict: ⚠️ 结构一致，写入目标不同**

增量检测机制完全相同：`lastBlockCount` / `lastCommandCount` 做增量、`parseResponse(partial)` 解析、`slice()` 取新增。

关键区别：
- **原版**：直接操作 DOM（`renderBlocks` → `appendChild`，`executeCommands` → 直接改 `el.style`）
- **Vue**：通过 timeline store 间接操作（`timeline.addOperation()` → canvas store 自动响应）
- **Vue 额外逻辑**：commands 处理前先做 card title 匹配获取 `matchedIds`，原版是在 `executeCommands` 内部做匹配
- **Vue 额外逻辑**：blocks 第一次出现时先发一个 `{ op: 'push' }` 操作给 timeline，对应原版的 `pushOldBlocks()`

`parseResponse` 本身：Vue 提取到了 `lib/parser.js`，函数体**逐字一致**（包括 items 归一化、cols 归一化）。

---

## 4. Speech 提取逻辑（speechHandled 标记）

**Original** (`app.js` callLLM + processSendQueue):

```js
// callLLM 内部（streaming 阶段）：
let speechFired = false
// onToken:
if (!speechFired && onSpeech) {
  const sm = accumulated.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  if (sm) { speechFired = true; onSpeech(sm[1].trim()) }
}

// processSendQueue（final pass）：
let speechHandled = false
// onSpeech callback:
(speechText) => {
  speechHandled = true
  showBubble(speechText)
  playTTS(speechText)
}
// final:
if (speech && !speechHandled) {
  showBubble(speech); playTTS(speech)
} else if (!speech && !speechHandled && !blocks.length) {
  const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
  if (plain) { showBubble(plain.slice(0, 100)); playTTS(plain.slice(0, 100)) }
}
```

**Vue** (`useLLM.js` callLLM + `useSend.js` processSendQueue):

```js
// useLLM.js callLLM（streaming 阶段）— 逐字一致：
let speechFired = false
if (!speechFired && onSpeech) {
  const sm = accumulated.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  if (sm) { speechFired = true; onSpeech(sm[1].trim()) }
}

// useSend.js processSendQueue（final pass）：
let speechHandled = false
// onSpeech callback:
(speechText) => {
  speechHandled = true
  showBubble(speechText)
  // ← 没有 playTTS(speechText)
}
// final:
if (speech && !speechHandled) {
  showBubble(speech)
  // ← 没有 playTTS(speech)
} else if (!speech && !speechHandled && !blocks.length) {
  const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
  if (plain) {
    showBubble(plain.slice(0, 100))
    // ← 没有 playTTS(plain)
  }
}
```

**Verdict: ⚠️ 逻辑一致，但 Vue 缺少 TTS 调用**

`speechFired` / `speechHandled` 双标记机制完全一致。检测正则一致。fallback 逻辑（无结构化输出时显示纯文本）一致。

**唯一区别**：原版在每个 speech 触发点都调用 `playTTS()`，Vue 版 **所有 `playTTS()` 调用都被删除**（onSpeech 回调、final pass speech、fallback plain text 三处全部缺失）。Vue 只做了 `showBubble()` 没有语音播放。这可能是因为 TTS composable 尚未迁移。

---

## 5. tool_use 处理（showToolLog 显示/隐藏）

**Original** (`app.js` callLLM):

```js
if (type === 'tool' && cfg.showToolCalls) {
  showToolLog(`${data.name}: ${(data.input?.query || data.input?.url || '').slice(0, 60)}`)
}
```

`showToolLog` 是全局函数，直接操作 DOM（创建 `.tool-log-item` 元素，`>5` 时移除最早的，8s 后自动 fade）。

**Vue** (`useLLM.js` callLLM):

```js
if (type === 'tool' && cfg.showToolCalls) {
  addToolLog(`${data.name}: ${(data.input?.query || data.input?.url || '').slice(0, 60)}`)
}
```

`addToolLog` 操作响应式数组 `toolLogs.value`，逻辑一致（`>5` 时 shift、8s 后 fade）。

显示/隐藏由 `cfg.showToolCalls` 控制，两版一致。

**Verdict: ✅ 一致**

触发条件（`type === 'tool' && cfg.showToolCalls`）、消息格式（`${data.name}: ${...slice(0,60)}`）、保留上限（5）、自动消失时间（8s）全部一致。唯一区别是 DOM 操作 vs 响应式数组，是 Vue 化的正常改写。

---

## 总结

| 项目 | 状态 | 说明 |
|------|------|------|
| System Prompt | ❌ 不一致 | Vue 是超集，新增 ~3630 字符的 Canvas Commands 使用指南 + Finding Images |
| Tools 定义 | ✅ 一致 | schema 相同，execute 分发方式稍异但底层逻辑相同 |
| onToken + 增量检测 | ⚠️ 结构一致 | 增量机制相同；Vue 改写为 timeline-driven 而非直接 DOM |
| Speech 提取 | ⚠️ 逻辑一致缺 TTS | 双标记机制一致，但 Vue 缺少所有 playTTS() 调用 |
| Tool Log | ✅ 一致 | 触发条件/格式/上限/淡出全部一致 |
