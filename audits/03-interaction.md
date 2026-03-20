# 卡片交互对比

对比范围：Original `app.js` (`setupBlockInteraction` / `toggleSelect` / `clearSelection`) vs Vue `BlockCard.vue` + `canvas.js`

---

## 1. 单击选中：glow-breathe class 添加逻辑、是否清除其他选中

### Original (`app.js`)

```js
// click handler inside setupBlockInteraction
el.addEventListener('click', e => {
  if (isDragging) return
  e.stopPropagation()
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    toggleSelect(el)           // multi-select toggle
  } else {
    clearSelection()           // single click → clear others first
    toggleSelect(el)
  }
  updateSelectionContext()
})

function toggleSelect(el) {
  if (el.classList.contains('selected')) {
    el.classList.remove('selected', 'glow-breathe')
    selectedBlocks.delete(el)
    const d = depthLevel - parseInt(el.dataset.depth || '0')
    applyDepth(el, d)
  } else {
    el.classList.add('selected')
    selectedBlocks.add(el)
    el.style.transform = 'translateZ(300px) scale(1.05)'
    el.style.opacity = 1
    el.style.zIndex = 999
    el.style.filter = 'none'
    setTimeout(() => el.classList.add('glow-breathe'), 500)  // ← delayed glow
  }
}
```

### Vue (`BlockCard.vue` + `canvas.js`)

```js
// BlockCard.vue — onClick
function onClick(e) {
  if (isDragging) return
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    emit('toggle-select', { multi: true })
  } else {
    emit('toggle-select', { multi: false })
  }
  // glow-breathe: local ref
  if (props.card.selected) {
    setTimeout(() => { glowBreathing.value = true }, 500)
  } else {
    glowBreathing.value = false
  }
}

// canvas.js — toggleSelect
function toggleSelect(id, opts) {
  const multi = opts?.multi ?? false
  if (!multi) clearSelection()  // same logic: single click clears others
  const card = cards.get(id)
  if (card.selected) {
    card.selected = false
    selectedIds.value.delete(id)
    applyDepth(card, d)
  } else {
    card.selected = true
    selectedIds.value.add(id)
    card.z = 300; card.scale = 1.05; card.opacity = 1
    card.zIndex = 999; card.blur = 0
  }
}
```

### Verdict: ✅ 功能一致

- 单击清除其他 → toggleSelect → 相同
- `glow-breathe` 500ms 延迟 → 相同
- 选中时 z=300, scale=1.05, zIndex=999 → 相同
- 取消选中恢复 `applyDepth` → 相同
- 唯一差异：Vue 的 `glow-breathe` 判断在 onClick 里基于 `props.card.selected` 的 **当前值**（emit 之后 store 才改，所以 timing 可能有微妙差异），但实际效果一致。

---

## 2. Shift/Ctrl 多选：事件判断方式

### Original

```js
if (e.shiftKey || e.ctrlKey || e.metaKey) {
  toggleSelect(el)    // multi: just toggle this one, don't clear others
} else {
  clearSelection()
  toggleSelect(el)
}
```

### Vue

```js
// BlockCard.vue
if (e.shiftKey || e.ctrlKey || e.metaKey) {
  emit('toggle-select', { multi: true })
} else {
  emit('toggle-select', { multi: false })
}

// canvas.js
function toggleSelect(id, opts) {
  const multi = opts?.multi ?? false
  if (!multi) clearSelection()
  // ...toggle logic
}
```

### Verdict: ✅ 完全一致

- 三个修饰键 `shiftKey / ctrlKey / metaKey` 判断方式完全相同
- multi=true 时不清除其他，multi=false 时先清除再 toggle
- 原版直接调 `toggleSelect(el)`，Vue 版通过 emit 传 `{ multi }` 到 store，逻辑等价

---

## 3. 拖拽：mousedown → mousemove → mouseup 流程、像素→百分比公式

### Original

```js
el.addEventListener('mousedown', e => {
  if (e.target.tagName === 'A' || e.target.tagName === 'INPUT') return
  isDragging = false
  startX = e.clientX
  startY = e.clientY
  origLeft = parseFloat(el.style.left) || 0   // 已经是百分比（从 style.left 读）
  origTop = parseFloat(el.style.top) || 0

  const onMove = e2 => {
    const dx = e2.clientX - startX
    const dy = e2.clientY - startY
    if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) isDragging = true
    if (isDragging) {
      const cw = el.parentElement.offsetWidth   // ← parent 宽度
      const ch = el.parentElement.offsetHeight  // ← parent 高度
      el.style.left = `${origLeft + (dx / cw) * 100}%`
      el.style.top  = `${origTop  + (dy / ch) * 100}%`
    }
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    setTimeout(() => { isDragging = false }, 10)
  }
  // ...
})
```

**公式**: `newX% = origLeft% + (deltaPixels / parentElement.offsetWidth) * 100`

### Vue

```js
// BlockCard.vue — onMouseDown
function onMouseDown(e) {
  if (e.target.tagName === 'A' || e.target.tagName === 'INPUT' || e.target.tagName === 'IFRAME') return
  isDragging = false
  startX = e.clientX
  startY = e.clientY
  origLeft = props.card.x   // 从 store 读，数值型百分比
  origTop = props.card.y

  const onMove = (e2) => {
    const dx = e2.clientX - startX
    const dy = e2.clientY - startY
    if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) isDragging = true
    if (isDragging) {
      const cw = window.innerWidth    // ← window 宽度！
      const ch = window.innerHeight   // ← window 高度！
      emit('update-position', origLeft + (dx / cw) * 100, origTop + (dy / ch) * 100)
    }
  }
  // onUp 同原版
}
```

**公式**: `newX% = origLeft% + (deltaPixels / window.innerWidth) * 100`

### Verdict: ⚠️ 除数不同

| | Original | Vue |
|---|---|---|
| 除数(宽) | `el.parentElement.offsetWidth` (canvasSpace) | `window.innerWidth` |
| 除数(高) | `el.parentElement.offsetHeight` (canvasSpace) | `window.innerHeight` |
| 排除标签 | A, INPUT | A, INPUT, **IFRAME** (多了) |

**差异影响**：canvasSpace 的 `offsetWidth/Height` 和 `window.innerWidth/Height` 在全屏布局下几乎相同，但如果 canvas 不是全屏（有侧边栏、padding 等），拖拽像素→百分比的比例会不一致。Vue 版还多排除了 `IFRAME` 标签（embed 卡片的改进，这是正确的）。

---

## 4. Hover 效果：mouseenter 时的 z/scale/blur 增量、mouseleave 恢复

### Original

```js
el.addEventListener('mouseenter', () => {
  if (el.classList.contains('selected') || isDragging) return
  el._preHover = {
    transform: el.style.transform,
    opacity: el.style.opacity,
    zIndex: el.style.zIndex,
    filter: el.style.filter
  }
  el.style.transform = 'translateZ(60px) scale(1.04)'
  el.style.opacity = 1
  el.style.zIndex = 150
  el.style.filter = 'none'
})

el.addEventListener('mouseleave', () => {
  if (el.classList.contains('selected') || isDragging) return
  if (el._preHover) {
    el.style.transform = el._preHover.transform
    el.style.opacity = el._preHover.opacity
    el.style.zIndex = el._preHover.zIndex
    el.style.filter = el._preHover.filter
    el._preHover = null
  }
})
```

### Vue

```js
function onMouseEnter() {
  if (props.card.selected || isDragging) return
  preHover = {
    z: props.card.z,
    scale: props.card.scale,
    opacity: props.card.opacity,
    zIndex: props.card.zIndex,
    blur: props.card.blur,
  }
  props.card.z = 60
  props.card.scale = 1.04
  props.card.opacity = 1
  props.card.zIndex = 150
  props.card.blur = 0
}

function onMouseLeave() {
  if (props.card.selected || isDragging) return
  if (preHover) {
    props.card.z = preHover.z
    props.card.scale = preHover.scale
    props.card.opacity = preHover.opacity
    props.card.zIndex = preHover.zIndex
    props.card.blur = preHover.blur
    preHover = null
  }
}
```

### Verdict: ✅ 功能一致

| 属性 | Original | Vue |
|---|---|---|
| z (translateZ) | 60px | 60 |
| scale | 1.04 | 1.04 |
| opacity | 1 | 1 |
| zIndex | 150 | 150 |
| filter/blur | none / 0 | blur=0 |

- 数值完全匹配
- 保存/恢复逻辑相同：hover 前记录原始状态，leave 时恢复
- 跳过条件相同：selected 或 dragging 时不触发
- Vue 版直接 mutate reactive proxy（`props.card.z = 60`），原版操作 DOM style — 实现方式不同但效果等价

---

## 5. 点击背景空白区域：是否清除全部选中

### Original

```js
document.addEventListener('click', e => {
  if (e.target.closest('.v-block') ||
      e.target.closest('.input-bar') ||
      e.target.closest('.config-overlay') ||
      e.target.closest('.gear-btn')) return
  clearSelection()
  updateSelectionContext()
})
```

### Vue (`CanvasSpace.vue`)

```js
// template: <div class="canvas" @click="handleBgClick">

function handleBgClick(e) {
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}
```

### Verdict: ⚠️ 排除范围缩小

| 排除目标 | Original | Vue |
|---|---|---|
| `.v-block` | ✅ | ✅ |
| `.input-bar` | ✅ | ✅ |
| `.config-overlay` | ✅ | ❌ 未排除 |
| `.gear-btn` | ✅ | ❌ 未排除 |

**差异影响**：Vue 版点击设置按钮或设置面板时会意外清除选中卡片。不过如果 config overlay 和 gear button 在 canvas 组件外部（不会冒泡到 `handleBgClick`），则无影响 — 取决于 DOM 层级结构。由于 Vue 版事件绑定在 `<div class="canvas">` 上而非 `document`，如果 config-overlay 和 gear-btn 在 canvas 外面，事件不会传到这里，所以实际可能没问题。

---

## 总结

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 单击选中 + glow-breathe | ✅ 一致 |
| 2 | Shift/Ctrl/Meta 多选 | ✅ 一致 |
| 3 | 拖拽像素→百分比公式 | ⚠️ 除数用 `window.innerWidth` 替代 `parentElement.offsetWidth`，全屏时无差异 |
| 4 | Hover 效果 z/scale/blur | ✅ 一致（数值完全匹配） |
| 5 | 背景点击清除选中 | ⚠️ 排除范围缩小，但因 Vue 事件作用域限于 canvas 组件，实际影响取决于 DOM 结构 |
