# Visual Talk — Vision

## 一句话

从 AI 对话工具到 AI-native OS。

## 核心信念

UI 是 AI 的第一语言。不是聊天框里打字，不是 Markdown 渲染——是 AI 直接用空间构图表达思想。

## 三个阶段

### Phase 1: 对话工具 ← 当前阶段

**核心交互：你说话 → AI 用 UI 回应 + 语音伴随**

| 功能 | 状态 | 备注 |
|------|------|------|
| Canvas 空间构图（x/y/z 定位） | ✅ | 3D 景深、hover/select、拖拽 |
| 文本协议驱动 streaming | ✅ | `<!--vt:card-->` / `<!--vt:move-->` / `<!--vt:update-->` |
| Blocks 原子化抽象 | ✅ | 17 种 block 类型，自由组合 |
| Timeline 分支树 | ✅ | 4 向导航、分支创建、操作重放 |
| 语音输出 (TTS) | ✅ | OpenAI 兼容、6 种声音 |
| 语音输入 (STT) | ✅ | Whisper API + Web Speech 双路 |
| 多主题 | ✅ | Basic / Mercury / Dot，CSS 变量体系 |
| 图表/表格主题适配 | ✅ | CSS custom properties 全局方案 |
| Skills 能力注册 | ✅ | 12 个工具（搜索/天气/音乐/股票/地图/百科等） |
| HTML Block (live iframe) | ✅ | sandboxed 交互 demo，支持网络访问 |
| 配置持久化 (localStorage) | ✅ | LLM/TTS/Tool keys/Theme/Proxy |
| Docked cards 侧边栏 | ✅ | 双击 dock/undock |
| TTS 和卡片同步 | ⬜ | 说到哪出到哪 |
| 连续对话（history 持久化） | ⬜ | 跨 session 记忆 |
| 语音输入优化 | ⬜ | push-to-talk 体验打磨 |
| 分享能力 | ⬜ | 画面导出/分享链接 |
| 移动端适配 | ⬜ | 响应式布局 |

**Block 类型（17 种）：**
heading (with sub) · text · image · tags · metric · list · quote · code · divider · progress · spacer · chart · table · diagram · map · audio · html

### Phase 2: 环境智能

| 功能 | 状态 | 备注 |
|------|------|------|
| 多模态输入（图片/截图/摄像头） | ⬜ | |
| 持久化（跨 session 记忆） | ⬜ | Phase 1 连续对话的深化 |
| 主动感知（注意力/犹豫/模式） | ⬜ | |
| 主动推送（AI 不被触发就输出） | ⬜ | |

### Phase 3: AI-native OS

| 功能 | 状态 | 备注 |
|------|------|------|
| 事件循环（时间/注意力/外部事件） | ⬜ | |
| 能力即插件（Skill 声明式加载） | 🟡 | 有 skill 注册机制，但还不是动态插拔 |
| 注意力管理（z-depth = 优先级） | 🟡 | z-depth 已实现，但还没有智能优先级 |
| 进程 = 意图（Timeline node） | 🟡 | Timeline tree 已实现，但还没有意图语义 |

## 架构映射

| 传统 OS | Visual Talk | 当前状态 |
|---------|-------------|---------|
| 文件系统 | Timeline（按对话树组织信息） | ✅ 树结构 + 操作重放 |
| 窗口管理器 | Canvas（空间构图 + 注意力管理） | ✅ 3D 空间 + dock |
| 命令行 | 语音/文字输入（意图，不是指令） | ✅ 双路输入 |
| App | Skill（prompt 里的能力声明） | ✅ 12 个 skills |
| 进程 | Timeline node（意图的执行单元） | ✅ 基础实现 |
| 系统调用 | 文本协议 `<!--vt:card-->` | ✅ streaming 协议 |

## 设计原则

1. **表达 > 执行** — AI 在用 UI "说话"，不是在"调用组件"
2. **空间 > 列表** — 卡片之间有位置、层次、时间关系
3. **流动 > 原子** — streaming 构图，说到哪出到哪
4. **主动 > 被动** — AI 知道什么时候该说话、该闭嘴、该帮忙
5. **意图 > 操作** — 用户表达想要什么，不是怎么做
6. **原子 > 配置** — 每个 block 做一件事，组合出无限可能（v0.5 新增）

## 技术栈

- 纯前端（Vue 3 + Pinia + Vite）
- LLM: Anthropic 协议 (subrouter.ai)
- TTS/STT: OpenAI 兼容 (yunwu.ai)
- 搜索: Tavily
- 部署: GitHub Pages + 自定义域名 (visual-talk.momomo.dev)
