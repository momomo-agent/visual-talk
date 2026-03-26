<template>
  <div class="canvas" :class="{ 'mission-control': galleryMode }" @click="handleBgClick" @dblclick="handleBgDblClick">
    <!-- Dock zone indicator (left edge) -->
    <Transition name="dock-zone">
      <div v-if="showDockZone" class="dock-zone" :class="{ 'dock-zone-active': dockZoneActive }">
        <span class="dock-zone-label">{{ dockZoneActive ? '松开吸附' : '拖到这里吸附' }}</span>
      </div>
    </Transition>
    <!-- All topic canvases -->
    <div
      v-for="topic in allTopics"
      :key="topic.id"
      class="topic-canvas"
      :class="{
        'topic-active': topic.id === activeTreeId,
        'topic-gallery': galleryMode,
        'topic-zooming': zoomingId === topic.id,
        'topic-current-zooming': zoomingId === '__current__' && topic.id === activeTreeId,
      }"
      :style="galleryMode ? getTopicStyle(topic.id) : (topic.id === activeTreeId ? activeCanvasStyle : { display: 'none' })"
      :ref="el => setTopicRef(topic.id, el)"
      @click="galleryMode ? onTopicClick(topic.id) : null"
    >
      <BlockCard
        v-for="[cardId, card] in getTopicCards(topic.id)"
        :key="cardId"
        :ref="el => topic.id === activeTreeId ? setCardRef(cardId, el) : null"
        :card="card"
        :class="{ 'is-docked': topic.id === activeTreeId && dockedIds.has(cardId) }"
        @toggle-select="(e) => galleryMode ? null : toggleSelect(cardId, e)"
        @toggle-dock="() => galleryMode ? null : onToggleDock(cardId)"
        @update-position="(x, y) => galleryMode ? null : updateCardPosition(cardId, x, y)"
        @drag-move="(cx, cy) => galleryMode ? null : onDragMove(cardId, cx)"
        @drag-end="(x, y, px) => galleryMode ? null : onDragEnd(card, x, y, cardId, px)"
      />
      <SketchOverlay v-if="topic.id === activeTreeId && !galleryMode" />
    </div>

    <!-- Gallery overlay (just the background + controls, no duplicate cards) -->
    <Transition name="gallery-fade">
      <div v-if="galleryMode" class="gallery-overlay" :class="{ zooming: !!zoomingId }" @click.self="exitGallery">
        <button class="gallery-close-btn" @click="exitGallery">×</button>
      </div>
    </Transition>

    <!-- Gallery labels layer (above overlay, below canvases) -->
    <div v-if="galleryMode" class="gallery-labels" :class="{ zooming: !!zoomingId }">
      <div
        v-for="(topic, i) in allTopicsSorted"
        :key="topic.id"
        class="gallery-label-item"
        :style="getLabelStyle(i)"
      >
        <div class="gallery-label">{{ topic.name || '新对话' }}</div>
        <button
          v-if="topic.id !== activeTreeId && allTopicsSorted.length > 1"
          class="gallery-delete"
          @click.stop="deleteTopic(topic.id)"
        >×</button>
      </div>
    </div>

    <div class="greeting" :class="{ hidden: !greetingVisible || galleryMode }">visual talk</div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useForestStore } from '../stores/forest.js'
import BlockCard from './BlockCard.vue'
import SketchOverlay from './SketchOverlay.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const forest = useForestStore()
const { cards, greetingVisible, isNavigating } = storeToRefs(canvas)
const { dockedIds, dockedSnapshots } = storeToRefs(timeline)
const { toggleSelect, clearSelection, updateCardPosition } = canvas
const { activeTreeId } = storeToRefs(forest)

// ════════════════════════════════════════════
//  Gallery (Mission Control) — Unified Architecture
//
//  All topics render real BlockCards in their own container.
//  Gallery mode = CSS Grid + transform:scale().
//  No duplicate rendering. What you see IS the real thing.
// ════════════════════════════════════════════

const galleryMode = ref(false)
const zoomingId = ref(null)
const topicRefs = new Map()
const otherTopicCards = ref(new Map())
const galleryScrollY = ref(0)
const isScrolling = ref(false)
let scrollTimer = null // treeId -> reactive card array

function setTopicRef(id, el) {
  if (el) topicRefs.set(id, el)
  else topicRefs.delete(id)
}

// All topics: active + others
const allTopics = computed(() => {
  return forest.treeList.map(t => ({
    id: t.id,
    name: t.name || '新对话',
    isActive: t.isActive,
    updatedAt: t.updatedAt || 0,
  }))
})

// Sorted for gallery display: current first, then by updatedAt
let lastSortOrder = null
const allTopicsSorted = computed(() => {
  if (!galleryMode.value) return allTopics.value
  const current = allTopics.value.find(t => t.id === activeTreeId.value)
  const others = allTopics.value.filter(t => t.id !== activeTreeId.value)
  
  // Stable sort
  const ids = others.map(t => t.id)
  if (lastSortOrder && arrEq([...ids].sort(), [...lastSortOrder].sort())) {
    const m = new Map(lastSortOrder.map((id, i) => [id, i]))
    others.sort((a, b) => (m.get(a.id) ?? 999) - (m.get(b.id) ?? 999))
  } else {
    others.sort((a, b) => b.updatedAt - a.updatedAt)
    lastSortOrder = others.map(t => t.id)
  }
  
  return current ? [current, ...others] : others
})

// Get cards for a topic
function getTopicCards(topicId) {
  if (topicId === activeTreeId.value) {
    // Active topic: use real canvas store cards
    return allCards.value
  }
  // Other topics: use loaded preview cards
  const topicCards = otherTopicCards.value.get(topicId)
  if (!topicCards) return []
  return topicCards.map(c => [c.id, c])
}

// ── Grid layout ──
const COLS = 3
const GRID_GAP = 24
const GRID_PAD_X = 48
const GRID_PAD_TOP = 60
const GRID_PAD_BOT = 48
const GRID_MAX_W = 1200

function getGridMetrics() {
  const vw = window.innerWidth || 1280
  const vh = window.innerHeight || 800
  const gridW = Math.min(GRID_MAX_W, vw - GRID_PAD_X * 2)
  const cellW = (gridW - GRID_GAP * (COLS - 1)) / COLS
  const cellH = cellW * (vh / vw) // maintain viewport aspect ratio
  const gridLeft = (vw - gridW) / 2
  return { vw, vh, gridW, cellW, cellH, gridLeft }
}

function getTopicStyle(topicId) {
  if (!galleryMode.value) return { display: 'none' }
  
  const { vw, vh, cellW, cellH, gridLeft } = getGridMetrics()
  const idx = allTopicsSorted.value.findIndex(t => t.id === topicId)
  if (idx < 0) return { display: 'none' }
  
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  const left = gridLeft + col * (cellW + GRID_GAP)
  const rawTop = GRID_PAD_TOP + row * (cellH + GRID_GAP + 30)
  const top = rawTop - galleryScrollY.value
  const scale = cellW / vw
  
  const isZooming = zoomingId.value === topicId || (zoomingId.value === '__current__' && topicId === activeTreeId.value)
  const isFadingOut = zoomingId.value && !isZooming
  const isCurrent = topicId === activeTreeId.value
  
  // Enter animation: current topic starts fullscreen, then shrinks to grid
  const isEnterStart = enterPhase.value === 'start' && isCurrent
  
  if (isZooming || isEnterStart) {
    // Fullscreen position
    return {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: vw + 'px',
      height: vh + 'px',
      transform: 'scale(1)',
      transformOrigin: 'top left',
      zIndex: '200',
      pointerEvents: 'none',
      borderRadius: '0px',
      overflow: 'hidden',
      transition: isEnterStart ? 'none' : 'transform 0.45s cubic-bezier(.22,1,.36,1), left 0.45s cubic-bezier(.22,1,.36,1), top 0.45s cubic-bezier(.22,1,.36,1), border-radius 0.3s',
      opacity: '1',
    }
  }
  
  // Other topics during enter start: hidden (will fade in during 'animating' phase)
  if (enterPhase.value === 'start' && !isCurrent) {
    return {
      position: 'fixed',
      left: left + 'px',
      top: top + 'px',
      width: vw + 'px',
      height: vh + 'px',
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      zIndex: '101',
      pointerEvents: 'none',
      borderRadius: (12 / scale) + 'px',
      overflow: 'hidden',
      transition: 'none',
      opacity: '0',
    }
  }
  
  const scrollTransition = isScrolling.value ? 'none' : 'transform 0.45s cubic-bezier(.22,1,.36,1), left 0.45s cubic-bezier(.22,1,.36,1), top 0.45s cubic-bezier(.22,1,.36,1), opacity 0.35s ease'
  
  return {
    position: 'fixed',
    left: left + 'px',
    top: top + 'px',
    width: vw + 'px',
    height: vh + 'px',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    zIndex: '101',
    pointerEvents: 'auto',
    cursor: 'pointer',
    borderRadius: (12 / scale) + 'px',
    overflow: 'hidden',
    transition: scrollTransition,
    opacity: isFadingOut ? '0' : '1',
  }
}

function getLabelStyle(idx) {
  const { cellW, cellH, gridLeft } = getGridMetrics()
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  const left = gridLeft + col * (cellW + GRID_GAP)
  const top = GRID_PAD_TOP + row * (cellH + GRID_GAP + 30) + cellH + 6 - galleryScrollY.value
  
  return {
    position: 'fixed',
    left: left + 'px',
    top: top + 'px',
    width: cellW + 'px',
    zIndex: '102',
    transition: isScrolling.value ? 'none' : 'opacity 0.3s',
    opacity: zoomingId.value ? '0' : '1',
  }
}

// Active canvas style (normal mode — no gallery)
const activeCanvasStyle = computed(() => undefined) // uses CSS defaults

// ── Enter / Exit ──
const enterPhase = ref(null) // null | 'start' | 'animating'

async function enterGallery() {
  await forest.saveCurrentTree()

  // Load other topics' cards
  const cardMap = new Map()
  for (const t of forest.treeList) {
    if (t.isActive) continue
    let rawCards = []
    if (forest.getTreePreview) {
      rawCards = await forest.getTreePreview(t.id)
    }
    if (rawCards.length === 0) {
      rawCards = t.lastCards || []
    }
    
    const topicCards = rawCards.map(c => reactive({
      id: c.id, x: c.x ?? 10, y: c.y ?? 10, w: c.w || 25,
      z: c.z ?? 0, scale: c.scale ?? 1, opacity: c.opacity ?? 1,
      blur: c.blur ?? 0, zIndex: c.zIndex ?? 100,
      selected: false, pointerEvents: 'none', entranceDelay: 0,
      _isDocked: false, type: c.type || 'blocks',
      contentKey: String(c.id),
      data: c.data || { key: String(c.id), blocks: [{ type: 'text', text: '...' }] },
    }))
    cardMap.set(t.id, topicCards)
  }
  otherTopicCards.value = cardMap
  
  // Phase 1: Reset 3D rotation on current canvas with animation
  const activeEl = topicRefs.get(activeTreeId.value)
  if (activeEl) {
    activeEl.style.transition = 'transform 0.4s ease'
    activeEl.style.transform = 'rotateX(0deg) rotateY(0deg)'
  }
  
  // Phase 1: Set galleryMode but start at fullscreen position
  enterPhase.value = 'start'
  galleryScrollY.value = 0
  galleryMode.value = true
  
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))
  
  // Phase 2: Animate to grid position
  enterPhase.value = 'animating'
}

function exitGallery() {
  zoomingId.value = '__current__'
  enterPhase.value = null
  
  setTimeout(() => {
    galleryMode.value = false
    zoomingId.value = null
    enterPhase.value = null
    otherTopicCards.value = new Map()
    lastSortOrder = null
    // Clear any inline styles so normal CSS takes over
    const activeEl = topicRefs.get(activeTreeId.value)
    if (activeEl) activeEl.style = ''
  }, 450)
}

function onTopicClick(topicId) {
  if (topicId === activeTreeId.value) {
    exitGallery()
    return
  }
  
  // Zoom into other topic
  zoomingId.value = topicId
  
  setTimeout(async () => {
    galleryMode.value = false
    zoomingId.value = null
    enterPhase.value = null
    otherTopicCards.value = new Map()
    lastSortOrder = null
    
    await forest.switchTree(topicId)
  }, 400)
}

async function deleteTopic(treeId) {
  otherTopicCards.value.delete(treeId)
  await forest.deleteTree(treeId)
  if (forest.treeList.length <= 1) exitGallery()
}

function arrEq(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

defineExpose({ enterGallery, exitGallery, galleryMode })

// ════════════════════════════════════════════
//  Card Logic (unchanged)
// ════════════════════════════════════════════

const cardRefs = new Map()
function setCardRef(id, el) {
  if (el) cardRefs.set(id, el)
  else cardRefs.delete(id)
}

const dockSlots = ref(new Map())
function recalcDockSlots() {
  const slots = new Map()
  let y = 36
  const gap = 20
  dockedSnapshots.value.forEach((snap, id) => {
    slots.set(id, y)
    const r = cardRefs.get(id)
    const el = r?.$el || r
    const h = el?.offsetHeight || 200
    y += h + gap
  })
  dockSlots.value = slots
}

const DOCK_ZONE_PX = 288

const allCards = computed(() => {
  const entries = []
  let dockIndex = 0
  const dIds = dockedIds.value
  const hasDock = dIds.size > 0

  cards.value.forEach((card, id) => {
    if (dIds.has(id)) return
    card._isDocked = false
    card._dockSlot = -1
    card._dockTop = 0
    if (hasDock) {
      const vw = window.innerWidth || 1440
      const offsetPct = (DOCK_ZONE_PX / vw) * 100
      const remaining = 100 - offsetPct
      card._mappedX = offsetPct + (card.x / 100) * remaining
    } else {
      card._mappedX = card.x
    }
    entries.push([id, card])
  })

  dockedSnapshots.value.forEach((snap, id) => {
    const docked = { ...snap }
    docked._isDocked = true
    docked._dockSlot = dockIndex++
    docked._dockTop = dockSlots.value.get(id) ?? (36 + docked._dockSlot * 220)
    entries.push([id, docked])
  })

  return entries
})

watch(dockedSnapshots, () => nextTick(() => recalcDockSlots()), { deep: true })
watch(cards, () => nextTick(() => recalcDockSlots()), { deep: true })

const spaceRef = ref(null) // Keep for mouse parallax on active canvas
const emit = defineEmits(['click-canvas'])

function handleBgClick(e) {
  if (galleryMode.value) return
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}

function handleBgDblClick(e) {
  if (galleryMode.value) return
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  enterGallery()
}

function onToggleDock(id) { timeline.toggleDock(id) }

// ── Drag-to-dock ──
const DOCK_THRESHOLD_PX = 60 // pixels from left edge to trigger dock
const showDockZone = ref(false)
const dockZoneActive = ref(false)
let dragMoveCardId = null

function onDragMove(cardId, clientX) {
  dragMoveCardId = cardId
  // Show dock zone when dragging any card
  showDockZone.value = true
  // Highlight when near left edge
  dockZoneActive.value = clientX < DOCK_THRESHOLD_PX
}

function onDragEnd(card, x, y, cardId, clientX) {
  showDockZone.value = false
  dockZoneActive.value = false

  if (card._isDocked) {
    // Dragging a docked card — undock if dragged away from left edge
    if (clientX != null && clientX > DOCK_THRESHOLD_PX) {
      timeline.undockCard(cardId)
    }
    return
  }

  // Dock if dropped near left edge
  if (clientX != null && clientX < DOCK_THRESHOLD_PX) {
    timeline.dockCard(cardId)
    return
  }

  // Normal drag end — save position
  const key = card.data?.key
  if (key) timeline.setUserOverride(key, x, y)
}

function onMouseMove(e) {
  if (galleryMode.value) return
  const activeEl = topicRefs.get(activeTreeId.value)
  if (!activeEl) return
  const rx = (e.clientY / window.innerHeight - 0.5) * -8
  const ry = (e.clientX / window.innerWidth - 0.5) * 8
  activeEl.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
}

function onKeyDown(e) {
  if (e.key === 'Escape' && galleryMode.value) exitGallery()
}

// ── Gallery scroll ──
function getMaxScroll() {
  const count = allTopicsSorted.value.length
  if (count === 0) return 0
  const { cellH } = getGridMetrics()
  const rows = Math.ceil(count / COLS)
  const contentH = GRID_PAD_TOP + rows * (cellH + GRID_GAP + 30) + GRID_PAD_BOT
  const vh = window.innerHeight || 800
  return Math.max(0, contentH - vh)
}

function onWheel(e) {
  if (!galleryMode.value || zoomingId.value) return
  e.preventDefault()
  const maxScroll = getMaxScroll()
  galleryScrollY.value = Math.min(maxScroll, Math.max(0, galleryScrollY.value + e.deltaY))
  
  // Disable CSS transitions during scroll for instant response
  isScrolling.value = true
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => { isScrolling.value = false }, 120)
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('wheel', onWheel, { passive: false })
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('wheel', onWheel)
})
</script>

<style>
/* ════════════════════════════════════════════
   Topic Canvas — each topic gets its own container
   ════════════════════════════════════════════ */

.topic-canvas {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.8s cubic-bezier(.23,1,.32,1);
  pointer-events: none;
}

.topic-canvas.topic-gallery {
  /* Gallery mode overrides are in inline styles */
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 2px 20px rgba(0,0,0,0.08);
  /* Keep 3D but with distant perspective — subtle depth without cards poking out */
  transform-style: preserve-3d;
  perspective: 4000px;
}

.topic-canvas.topic-gallery .v-block {
  pointer-events: none !important;
  cursor: pointer !important;
}

.topic-canvas.topic-gallery .win-bar { display: none !important; }
.topic-canvas.topic-gallery .sketch-overlay { display: none !important; }

/* topic-canvas.topic-zooming is handled by inline styles in getTopicStyle */

/* ════════════════════════════════════════════
   Gallery Overlay — just background blur
   ════════════════════════════════════════════ */

.gallery-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: rgba(220,221,224,0.92);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

.gallery-overlay.zooming {
  background: transparent;
  backdrop-filter: none;
  pointer-events: none;
  transition: background 0.4s ease, backdrop-filter 0.3s;
}

/* Fade transition */
.gallery-fade-enter-active { transition: opacity 0.3s, backdrop-filter 0.3s; }
.gallery-fade-leave-active { transition: opacity 0.3s; }
.gallery-fade-enter-from { opacity: 0; }
.gallery-fade-leave-to { opacity: 0; }

/* ════════════════════════════════════════════
   Gallery Labels
   ════════════════════════════════════════════ */

.gallery-labels {
  position: fixed;
  inset: 0;
  z-index: 102;
  pointer-events: none;
}

.gallery-labels.zooming { opacity: 0; transition: opacity 0.25s; }

.gallery-label-item {
  pointer-events: auto;
  position: relative;
}

.gallery-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(0,0,0,0.5);
  text-align: center;
  padding: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-delete {
  position: absolute; top: -2px; right: 4px;
  width: 20px; height: 20px;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.15); color: rgba(255,255,255,0.8);
  font-size: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s, background 0.15s;
}
.gallery-label-item:hover .gallery-delete { opacity: 1; }
.gallery-delete:hover { background: rgba(200,60,60,0.6); color: #fff; }

/* Close */
.gallery-close-btn {
  position: fixed; top: 14px; right: 14px; z-index: 110;
  width: 32px; height: 32px;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.4);
  font-size: 20px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.gallery-close-btn:hover { background: rgba(0,0,0,0.1); color: rgba(0,0,0,0.6); }

/* ═══ Theme: Mercury ═══ */
.theme-mercury .gallery-overlay { background: rgba(220,221,224,0.92); }
.theme-mercury .gallery-label { color: rgba(0,0,0,0.45); }

/* ═══ Theme: Dot ═══ */
.theme-dot .gallery-overlay { background: rgba(240,230,220,0.92); }
.theme-dot .gallery-label { color: rgba(100,80,60,0.45); }

/* ═══ Theme: Basic (dark) ═══ */
body:not(.theme-mercury):not(.theme-dot) .gallery-overlay { background: rgba(10,10,8,0.9); }
body:not(.theme-mercury):not(.theme-dot) .gallery-label { color: rgba(196,168,130,0.45); }
body:not(.theme-mercury):not(.theme-dot) .gallery-delete { background: rgba(255,255,255,0.1); }
body:not(.theme-mercury):not(.theme-dot) .gallery-close-btn { background: rgba(255,255,255,0.06); color: rgba(196,168,130,0.3); }

/* ════════════════════════════════════════════
   Dock Zone — left edge drop target
   ════════════════════════════════════════════ */
.dock-zone {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 60px;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(100, 140, 255, 0.08);
  border-right: 2px solid rgba(100, 140, 255, 0.15);
  pointer-events: none;
  transition: all 0.2s ease;
}
.dock-zone-active {
  background: rgba(100, 140, 255, 0.2);
  border-right-color: rgba(100, 140, 255, 0.5);
  width: 72px;
}
.dock-zone-label {
  writing-mode: vertical-rl;
  font-size: 11px;
  letter-spacing: 1px;
  color: rgba(100, 140, 255, 0.5);
  user-select: none;
  transition: color 0.2s;
}
.dock-zone-active .dock-zone-label {
  color: rgba(100, 140, 255, 0.9);
}
.dock-zone-enter-active { transition: opacity 0.15s ease; }
.dock-zone-leave-active { transition: opacity 0.15s ease; }
.dock-zone-enter-from, .dock-zone-leave-to { opacity: 0; }
</style>
