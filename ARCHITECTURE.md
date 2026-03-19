# Visual Talk — Vue 3 Architecture

## 核心理念

UI 是 AI 的第一语言。屏幕是 AI 的表达空间，不是聊天记录。

## 技术栈

- Vite + Vue 3 (Composition API)
- Pinia (状态管理)
- 纯 CSS 动画 (no animation library)
- agentic-core (LLM 调用) + agentic-claw (工具编排)
- 部署: GitHub Pages (vite build → dist/)

## 目录结构

```
src/
├── App.vue                 # 根：CanvasSpace + InputBar + SpeechBubble + ConfigPanel
├── main.js                 # Vite 入口
├── stores/
│   ├── canvas.js           # Pinia: cards Map, depthLevel, push/create/update/move
│   ├── timeline.js         # Pinia: 活树, navigation, branching, computeCanvas
│   └── config.js           # Pinia: API keys, voice, proxy
├── composables/
│   ├── useLLM.js           # callLLM + 流式解析 + onToken/onSpeech
│   ├── useTTS.js           # playTTS + stopTTS + generation counter
│   ├── useSTT.js           # startRecording + stopRecording + push-to-talk
│   ├── useTimeline.js      # 滚轮/键盘/双指 → navigate(direction)
│   └── useSend.js          # send() queue + orchestration
├── components/
│   ├── CanvasSpace.vue     # 3D perspective 容器 + parallax mouse tracking
│   ├── BlockCard.vue       # 单卡片: props.card → 11种类型渲染
│   ├── ChartRenderer.vue   # SVG 图表 (bar/column/pie/donut/line)
│   ├── SpeechBubble.vue    # 语音气泡 + timeline indicator
│   ├── ThinkingDots.vue    # 三点动画
│   ├── InputBar.vue        # 文本输入 + mic 按钮
│   └── ConfigPanel.vue     # 设置面板 (gear icon)
├── lib/
│   ├── parser.js           # parseResponse(): vt 格式 → { speech, blocks, commands }
│   ├── imageProxy.js       # 三层 fallback: direct → proxy → weserv
│   └── id.js               # nextId(): 全局自增 card-0, card-1, ...
└── styles/
    ├── base.css            # reset + CSS variables (颜色、字体)
    ├── canvas.css          # perspective, 3D transforms
    └── blocks.css          # 卡片类型样式
```

## 数据模型

### Canvas Store (canvas.js)

```js
// 所有卡片，全局唯一 ID
cards: Map<string, {
  id: string,             // 'card-0', 'card-1', ...
  type: string,           // 11种: card/metric/steps/columns/callout/code/markdown/media/chart/list/embed
  data: object,           // LLM 输出的原始 JSON
  x: number,              // 0-100 (viewport %)
  y: number,
  z: number,              // translateZ px
  w: number,              // width %
  depth: number,          // 哪一轮创建的
  opacity: number,        // 当前显示透明度
  scale: number,          // 当前缩放
  blur: number,           // 当前模糊 px
  selected: boolean,
}>
```

### Timeline Store (timeline.js) — 活树

```js
// 树节点: 只存这一轮的 diff 操作
nodes: Map<number, {
  id: number,
  parentId: number | null,
  childIds: number[],
  lastChildId: number | null,
  userMessage: string,
  timestamp: number,
  depth: number,           // depthLevel at this round
  operations: Operation[], // 这一轮做了什么
}>

// Operation 类型
{ op: 'create', card: { id, type, data, x, y, z, w } }
{ op: 'update', cardId: string, changes: object }
{ op: 'move', cardId: string, to: { x?, y?, z? } }
{ op: 'push' }  // 旧卡片后退一层

// 导航状态
activeTip: number          // 当前活跃分支的末端
viewingId: number | null   // null = live (看最新), number = 看历史节点

// 从根到目标节点重放，得到完整画面
function computeCanvas(nodeId): Map<string, CardState>
```

### Config Store (config.js)

```js
{
  provider: 'anthropic',
  apiKey: string,
  baseUrl: string,
  model: string,
  tavilyKey: string,
  ttsKey: string,
  ttsBaseUrl: string,
  voice: 'nova',           // alloy/echo/fable/nova/onyx/shimmer
  proxyEnabled: boolean,
  proxyUrl: string,
  showToolCalls: boolean,
}
```

## 关键流程

### 1. 用户发消息

```
InputBar.send(text)
  → useSend.enqueue({ text, branchFrom? })
  → processSendQueue():
      1. if branchFrom: timeline.setActiveTip(branchFrom)
      2. canvas.beginRound() — depthLevel++, push old cards
      3. callLLM(prompt, onToken, onSpeech)
         onToken: parseResponse → canvas.applyOperations()
         onSpeech: bubble.show() + tts.play()
      4. timeline.commit(userMessage, operations)
```

### 2. Timeline 导航

```
useTimeline: wheel/arrow → timeline.navigate(direction)
  → computeCanvas(targetNodeId)
  → canvas.setState(computedCards)  // 响应式更新，Vue 自动 transition
  → bubble.showIndicator(node)
```

### 3. 从历史分支

```
user viewing node B, sends new message F:
  → branchFrom = B.id
  → timeline.setActiveTip(B.id)
  → canvas 当前是 B 的画面（通过 computeCanvas(B) 计算的）
  → 正常 LLM 流程，新操作记录在新节点 F
  → F.parentId = B.id, B.childIds.push(F.id)
```

### 4. 卡片渲染 (BlockCard.vue)

```vue
<template>
  <div class="v-block"
    :style="cardStyle"    <!-- position, transform, opacity, filter 全 computed -->
    @click="toggleSelect"
  >
    <div class="win-bar">{{ card.type }}</div>
    <div class="win-body">
      <CardContent :type="card.type" :data="card.data" />
      <!-- CardContent 内部 switch 11 种类型 -->
    </div>
  </div>
</template>
```

所有视觉属性 (x, y, z, opacity, scale, blur) 是响应式的。
CSS transition 在 .v-block 上，改数据 = 自动动画。

## 设计决策

1. **活树 > 快照**: 节点只存 diff，画面通过重放计算。无冗余，分支天然正确。
2. **卡片 ID 全局自增**: `card-${counter++}`，永不碰撞。
3. **数据驱动 > DOM 操作**: 不存 innerHTML，从 card.data 渲染。update = 改数据，Vue 自动更新。
4. **CSS transition > JS 动画**: 改 style 属性，浏览器优化。
5. **Pinia > 全局变量**: 响应式、devtools 友好、可持久化。
6. **composables 封装副作用**: LLM/TTS/STT 都是 async 副作用，用 composable 隔离。

## 迁移策略

Phase 1: 基础框架 + 卡片渲染 (不含 timeline)
Phase 2: LLM 集成 + 流式渲染
Phase 3: 活树 timeline + 分支导航
Phase 4: TTS/STT + push-to-talk
Phase 5: 配置面板 + 部署

## System Prompt

从现有 app.js 的 SYSTEM 常量原样迁移到 useLLM.js。
