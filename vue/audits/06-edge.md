# 边缘情况对比

## 1. 空回复：LLM 返回空内容时的处理

**Original (`app.js` — `processSendQueue`)**
```js
if (!reply) continue
// ...
if (!speech && !speechHandled && !blocks.length) {
  const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
  if (plain) {
    showBubble(plain.slice(0, 100))
    playTTS(plain.slice(0, 100))
  }
}
```
- `callLLM` 返回 `null`（无 API key 时弹配置面板）→ `continue` 跳过，不崩溃
- `reply` 非空但没有 speech/blocks 时，strip vt 标记后取纯文本显示在 bubble，播 TTS
- 完全空的文本（strip 后也空）→ 静默忽略

**Vue (`useSend.js` — `processSendQueue`)**
```js
if (!reply) continue
// ...
if (!speech && !speechHandled && !blocks.length) {
  const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
  if (plain) {
    showBubble(plain.slice(0, 100))
  }
}
```
- 逻辑完全一致：`null` → `continue`，无结构化输出 → 纯文本 bubble
- **差异：** Vue 版没有 `playTTS(plain.slice(0, 100))`，纯文本回退时不播语音

**Verdict:** ⚠️ Vue 少了纯文本回退的 TTS 播放。功能性影响不大（TTS 已被整体移除），但作为行为对齐点值得标注。

---

## 2. 网络错误：fetch 失败时的错误显示

**Original**
```js
} catch (err) {
  showBubble(`Error: ${err.message}`, 5000)
  console.error(err)
} finally {
  hideThinking()
}
```
- 错误显示在 bubble，持续 5 秒自动消失
- `hideThinking()` 在 finally 中保证执行

**Vue**
```js
} catch (err) {
  showBubble(`Error: ${err.message}`, 5000)
  console.error(err)
} finally {
  isThinking.value = false
  canvas.isStreaming = false
}
```
- 同样显示 `Error: ${err.message}` 在 bubble，5 秒超时
- finally 清理 `isThinking` + `isStreaming` 两个状态

**Verdict:** ✅ 完全对齐。错误文案格式一致、超时一致、清理逻辑一致。

---

## 3. 图片加载失败：imgErr / handleImageError + imageProxy fallback URL

**Original (`imgErr` 全局函数)**
```js
const PROXY = 'https://proxy.link2web.site/?url='
function imgErr(img) {
  const retries = parseInt(img.dataset.retries || '0')
  if (retries === 0) {
    img.dataset.retries = '1'
    const proxied = PROXY + encodeURIComponent(img.dataset.originalSrc || img.src)
    img.src = proxied
  } else if (retries === 1) {
    img.dataset.retries = '2'
    const weserv = 'https://images.weserv.nl/?url=' + encodeURIComponent(img.dataset.originalSrc || img.src)
    img.src = weserv
  } else {
    img.style.display = 'none'
  }
}
```
- 3 层 fallback：直连 → CORS proxy → weserv.nl → 隐藏
- **问题：** 重试 1 时如果 `img.dataset.originalSrc` 不存在，用 `img.src`（当前 URL），是正确的原始 URL
- **问题：** 重试 2 时如果 `img.dataset.originalSrc` 不存在，用 `img.src`（此时已经是 proxy URL 了！），会变成 `weserv.nl/?url=proxy.link2web.site/...`，嵌套代理
- HTML 中只有 `card` 和单图 `media` 设置了 `data-original-src`，grid `media` 的 img 没有设置 → 对 grid 图片第二次重试会嵌套代理

**Vue (`lib/imageProxy.js` + `BlockCard.vue`)**
```js
export function handleImageError(event) {
  const img = event.target
  const retries = parseInt(img.dataset.retries || '0')
  const originalSrc = img.dataset.originalSrc || img.src
  if (retries === 0) {
    img.dataset.retries = '1'
    img.src = getProxiedUrl(originalSrc, 1)
  } else if (retries === 1) {
    img.dataset.retries = '2'
    img.src = getProxiedUrl(originalSrc, 2)
  } else {
    img.style.display = 'none'
  }
}
```
- 相同的 3 层 fallback，相同的 proxy URL
- **相同的 bug**：`originalSrc = img.dataset.originalSrc || img.src`，如果 `data-original-src` 缺失且 retries=1 时已经被替换为 proxy URL，则 `originalSrc` 拿到的是 proxy URL
- Vue 模板中 `card` 和单图 `media` 设了 `:data-original-src`，grid `media` 图片**也没有** `:data-original-src` → 同样的嵌套代理 bug
- 代码被抽成独立模块 `imageProxy.js`，结构更清晰

**Verdict:** ✅ 行为完全对齐（包括相同的 bug）。Vue 版代码组织更好（独立模块），但逻辑完全等价。

---

## 4. move/update 命令：title 匹配 + 多卡片匹配

**Original（`executeCommands` 函数）**
```js
case 'move': {
  const blocks = [...space.querySelectorAll('.v-block')]
  const target = (cmd.title || '').toLowerCase()
  blocks.forEach(el => {
    const title = getCardTitle(el)
    if (title.includes(target)) {
      // 执行 move 操作...
    }
  })
  break
}
```
- `getCardTitle(el)` 从 DOM 取 `h2/h3/.big-label` 文本，fallback 到 `blockData` 的 `title/caption/text/content/code`，全部 `.toLowerCase()`
- 匹配方式：`title.includes(target)` — 模糊包含匹配
- **多卡片行为：** `forEach` 遍历所有 block，所有匹配的都会被 move/update，不是只匹配第一个
- move 后设 `pinned = '1'`，update 后也设 `pinned = '1'`

**Vue（`useSend.js` 中的命令处理）**
```js
const target = (cmd.title || '').toLowerCase()
const matchedIds = []
canvas.cards.forEach((card) => {
  const title = canvas.getCardTitle?.(card) || ''
  if (typeof title === 'string' && title.includes(target)) {
    matchedIds.push(card.id)
  }
})
```
- `getCardTitle(card)` 在 `canvas.js`：从 `card.data` 取 `title/caption/text/content/label/code`，`.toLowerCase()`
- **差异 1：** Vue 多了 `label` 字段作为 fallback（原版没有）
- **差异 2：** Vue 多了 `typeof title === 'string'` 类型保护
- 匹配方式：同样是 `title.includes(target)` — 模糊包含匹配
- **多卡片行为：** 同样收集所有匹配的 cardId，然后对每个执行操作 → 行为一致
- move/update 都设 `pinned = true`

**canvas.js 中 getCardTitle 对比：**
| 字段 | Original | Vue |
|------|----------|-----|
| DOM 查询 | ✅ h2/h3/.big-label | ❌ 无 DOM，纯数据 |
| data.title | ✅ | ✅ |
| data.caption | ✅ | ✅ |
| data.text | ✅ | ✅ |
| data.content | ✅ | ✅ |
| data.label | ❌ | ✅ |
| data.code | ✅ (前 30 字符) | ✅ (前 30 字符) |

**Verdict:** ✅ 核心匹配逻辑（toLowerCase + includes + 遍历所有）完全对齐。Vue 多了 `label` fallback 和类型保护，是改进不是回退。DOM 查询被去掉是正确的重构（Vue 用响应式数据）。

---

## 5. context 构建：getSelectedContext 和 getCanvasContext

**Original（`send` 函数内联）**

`getSelectedContext`（通过 `window._selectedContext`）：
```js
const texts = []
selectedBlocks.forEach(el => {
  texts.push(el.innerText.slice(0, 200))
})
window._selectedContext = texts.length ? texts.join('\n---\n') : null
```
- 取 DOM `innerText`（包含所有可见文本：标题、子标题、标签、列表项、页脚等）
- 每个 block 截断 200 字符

`getCanvasContext`（内联在 `send` 里）：
```js
const allCards = [...document.querySelectorAll('#canvasSpace .v-block')]
  .filter(el => el.dataset.timelineHidden !== '1')
const maxDepth = Math.max(...allCards.map(el => parseInt(el.dataset.depth || '0')), 0)
allCards.forEach(el => {
  const depth = parseInt(el.dataset.depth || '0')
  const type = el.dataset.blockType || 'card'
  const title = el.querySelector('h2, h3, .big-label')?.textContent || ''
  if (depth === maxDepth) {
    try {
      const data = JSON.parse(el.dataset.blockData || '{}')
      currentGroup.push(`<!--vt:${type} ${JSON.stringify(data)}-->`)
    } catch { if (title) currentGroup.push(`"${title}"`) }
  } else {
    if (title) olderCards.push(`"${title}" (depth:${depth})`)
  }
})
```
- Latest group：完整 `<!--vt:TYPE JSON-->` 格式
- Older cards：只有 `"title" (depth:N)`
- **过滤：** 排除 `timelineHidden` 的卡片
- **Title 来源：** DOM 查询 `h2/h3/.big-label`

**Vue（`canvas.js` 的 `getSelectedContext` 和 `getCanvasContext`）**

`getSelectedContext`：
```js
function getSelectedContext() {
  const texts = []
  selectedIds.value.forEach(id => {
    const card = cards.get(id)
    if (card) {
      const d = card.data
      const text = d.title || d.text || d.content || d.value || d.caption || ''
      texts.push(String(text).slice(0, 200))
    }
  })
  return texts.length ? texts.join('\n---\n') : null
}
```
- **差异：** 从 `card.data` 取**单个字段**（title → text → content → value → caption，第一个非空的），不是 DOM innerText
- 这意味着大量信息丢失：sub、tags、items、footer 全都不在 context 里
- 例如一个带有 title + sub + 3 个 items + footer 的 card，原版会把所有文本都给 LLM，Vue 版只给 title

`getCanvasContext`：
```js
function getCanvasContext() {
  const allCards = Array.from(cards.values())
  // 无过滤 — 所有 cards 都算在内
  const maxDepth = Math.max(...allCards.map(c => c.depth || 0), 0)
  allCards.forEach(card => {
    if (card.depth === maxDepth) {
      currentGroup.push(`<!--vt:${card.type} ${JSON.stringify(card.data)}-->`)
    } else {
      const title = getCardTitle(card)
      if (title) olderCards.push(`"${title}" (depth:${card.depth})`)
    }
  })
}
```
- Latest group 输出格式一致：`<!--vt:TYPE JSON-->`
- Older cards 输出格式一致：`"title" (depth:N)`
- **差异 1：** 无 `timelineHidden` 过滤（Vue 用不同的 timeline 机制，restoreFrom 会删除不在目标中的卡片，所以 cards Map 里都是可见的）
- **差异 2：** Older cards 的 title 来自 `getCardTitle(card.data)` 而非 DOM，但字段覆盖更全面

**Verdict:** ⚠️ `getSelectedContext` 有显著行为差异 — 原版取 DOM 全部 innerText，Vue 只取 data 中的单个字段。对于复杂卡片（card with items/tags/sub），Vue 给 LLM 的 context 信息量显著少于原版。`getCanvasContext` 逻辑对齐。

---

## 总结

| 项目 | 状态 | 说明 |
|------|------|------|
| 空回复 | ⚠️ | Vue 缺少纯文本回退的 TTS（影响小） |
| 网络错误 | ✅ | 完全对齐 |
| 图片加载失败 | ✅ | 完全对齐（含相同 bug） |
| move/update | ✅ | 核心逻辑对齐，Vue 有类型保护改进 |
| context 构建 | ⚠️ | `getSelectedContext` 信息量显著不足 |

**需要修复的优先项：**
1. **`getSelectedContext` 信息丢失（P1）** — 应该拼接 card.data 的所有文本字段（title + sub + items + tags + footer + text + content + value），而不是只取第一个非空字段。这直接影响 LLM 理解用户选中的内容。
