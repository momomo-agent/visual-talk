# 首次加载体验对比

## 1. Greeting 文字、位置、样式、消失时机

| | Original | Vue |
|---|---|---|
| 文字 | `visual talk` | `visual talk` |
| 位置 | `.greeting` — absolute, top:50% left:50% translate(-50%,-50%)（画布正中央） | 同上，CanvasSpace.vue 里 `<div class="greeting">visual talk</div>`，canvas.css 样式完全一致 |
| 样式 | font-size:24px, font-weight:200, color:rgba(196,168,130,0.12), letter-spacing:8px, lowercase | canvas.css 完全复制，一模一样 |
| 消失时机 | `renderBlocks()` 里 `$('greeting').classList.add('hidden')` — 第一次渲染 block 时隐藏 | canvas store `greetingVisible = ref(true)`，在 `applyOperation()` 等写入操作时设为 false |

**Verdict: ✅ 一致**

---

## 2. 无 apiKey 时是否自动打开配置面板

| | Original | Vue |
|---|---|---|
| 逻辑 | `callLLM()` 内 `if (!cfg.apiKey) { $('configOverlay').classList.add('open'); return null }` | App.vue `handleSend()` 内 `if (!configStore.apiKey) { configOpen.value = true; return }` |
| 触发时机 | 用户按下 Enter 发送后 | 同上 |
| 页面加载时 | 不自动打开（要用户先发一次消息才触发） | 同上 |

**Verdict: ✅ 一致** — 都是在 send 时检查，不是页面加载时。

---

## 3. 输入框 placeholder 文字

| | Original | Vue |
|---|---|---|
| 文字 | `say something...` (index.html) | `say something...` (InputBar.vue) |

**Verdict: ✅ 一致**

---

## 4. 页面背景色和全局字体

| | Original | Vue |
|---|---|---|
| body background | `#111` (style.css) | `#111` (base.css) |
| body color | `#c4a882` | `#c4a882` |
| font-family | `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` | 同上 |
| canvas background | `radial-gradient(ellipse at 40% 40%, #1e1812 0%, #111 60%, #0a0a08 100%)` | canvas.css 完全一致 |

**Verdict: ✅ 一致**

---

## 5. localStorage key 名称

| | Original | Vue |
|---|---|---|
| key | `visual-talk-config` (app.js `STORAGE_KEY`) | `visual-talk-config` (stores/config.js `STORAGE_KEY`) |
| 存储字段 | provider, apiKey, baseUrl, model, tavilyKey, showToolCalls, ttsEnabled, webSpeech, ttsBaseUrl, ttsApiKey, ttsModel, ttsVoice, proxyUrl, proxyEnabled | 完全相同的字段列表 |
| 读取时机 | `loadConfig()` 在脚本末尾调用 | `load()` 在 store 创建时自动调用 |
| 写入时机 | 每个 input/change 事件手动绑定 `saveConfig` | Pinia `watch()` 监听所有 ref，任意变化自动 `save()` |

**Verdict: ✅ 一致** — key 和字段完全相同，迁移零数据丢失。Vue 版用 watch 替代手动绑定，更优雅。

---

## 总结

| 项目 | 结果 |
|---|---|
| Greeting | ✅ |
| 无 apiKey → 打开配置 | ✅ |
| Placeholder | ✅ |
| 背景色和字体 | ✅ |
| localStorage key | ✅ |

**5/5 全部一致。** Vue 版首次加载体验与原版完全对齐，用户无感知差异。Vue 版在实现上更优（Pinia 自动持久化 vs 手动事件绑定，响应式 greeting 控制 vs DOM 操作），但外在行为完全相同。