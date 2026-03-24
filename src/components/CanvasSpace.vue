<template>
  <div class="canvas" :class="{ 'mission-control': galleryMode }" @click="handleBgClick">
    <!-- Normal mode: live canvas -->
    <div
      v-show="!galleryMode"
      class="canvas-space"
      ref="spaceRef"
      :class="{ 'nav-zoom': isNavigating }"
    >
      <BlockCard
        v-for="[id, card] in allCards"
        :key="id"
        :ref="el => setCardRef(id, el)"
        :card="card"
        :class="{ 'is-docked': dockedIds.has(id) }"
        @toggle-select="(e) => toggleSelect(id, e)"
        @toggle-dock="() => onToggleDock(id)"
        @update-position="(x, y) => updateCardPosition(id, x, y)"
        @drag-end="(x, y) => onDragEnd(card, x, y)"
      />
      <SketchOverlay />
    </div>

    <!-- Gallery mode: all topics as uniform thumbnails -->
    <div v-if="galleryMode" class="gallery-scroll" :class="{ zooming: zoomingTopicId }" ref="galleryScrollRef" @click.self="exitGallery">
      <button class="gallery-close-btn" @click="exitGallery">×</button>
      <div class="gallery-grid" :style="gridStyle">
        <div
          v-for="topic in sortedTopics"
          :key="topic.id"
          class="gallery-item"
          :class="{ active: topic.id === activeTreeId, 'zoom-target': zoomingTopicId === topic.id }"
          :ref="el => setGalleryItemRef(topic.id, el)"
          @click="onTopicClick(topic.id)"
        >
          <div class="gallery-preview">
            <div class="gallery-canvas">
              <BlockCard
                v-for="card in topic.cards"
                :key="card.id"
                :card="card"
                @toggle-select="() => {}"
                @toggle-dock="() => {}"
                @update-position="() => {}"
                @drag-end="() => {}"
              />
            </div>
            <div v-if="topic.cards.length === 0" class="preview-empty">空</div>
            <!-- Delete button -->
            <button
              v-if="sortedTopics.length > 1"
              class="gallery-delete"
              @click.stop="deleteTopic(topic.id)"
            >×</button>
          </div>
          <div class="gallery-label">{{ topic.name }}</div>
        </div>
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

// ── Gallery (Mission Control) mode ──
const galleryMode = ref(false)
const galleryTopics = ref([])     // snapshot of topics when gallery opens
const zoomingTopicId = ref(null)  // topic being zoomed into
const galleryItemRefs = new Map()

function setGalleryItemRef(id, el) {
  if (el) galleryItemRefs.set(id, el)
  else galleryItemRefs.delete(id)
}

// Snapshot ordering when gallery opens — only re-sort on open, not on re-enter
let lastSortOrder = null

async function enterGallery() {
  // Save current before taking snapshot
  await forest.saveCurrentTree()

  // Build topic list: current + others, all uniform
  const topics = []
  for (const t of forest.treeList) {
    let topicCards = []
    if (t.isActive) {
      // Current tree: read cards from live canvas store
      topicCards = Array.from(cards.value.entries()).map(([id, c]) => reactive({
        id, x: c.x ?? 10, y: c.y ?? 10, w: c.w || 25,
        z: 0, scale: 1, opacity: 1, blur: 0, zIndex: 100,
        selected: false, pointerEvents: 'none', entranceDelay: 0,
        _isDocked: false, type: c.type || 'blocks',
        contentKey: String(id),
        data: c.data || { key: String(id), blocks: [{ type: 'text', text: '...' }] },
      }))
    } else {
      // Other trees: load from IndexedDB
      const rawCards = await forest.getTreePreview(t.id)
      topicCards = rawCards.map(c => reactive({
        id: c.id, x: c.x ?? 10, y: c.y ?? 10, w: c.w || 25,
        z: 0, scale: 1, opacity: 1, blur: 0, zIndex: 100,
        selected: false, pointerEvents: 'none', entranceDelay: 0,
        _isDocked: false, type: c.type || 'blocks',
        contentKey: String(c.id),
        data: c.data || { key: String(c.id), blocks: [{ type: 'text', text: '...' }] },
      }))
    }
    topics.push({
      id: t.id,
      name: t.name || '新对话',
      updatedAt: t.updatedAt || t.createdAt || 0,
      cards: topicCards,
    })
  }

  // Sort by updatedAt descending (most recent first)
  // But if we have a previous sort order and no new conversations, keep it stable
  const sorted = topics.sort((a, b) => b.updatedAt - a.updatedAt)
  const currentIds = sorted.map(t => t.id)

  if (lastSortOrder && arraysEqual(currentIds.sort(), [...lastSortOrder].sort())) {
    // Same set of topics — use previous order for stability
    const orderMap = new Map(lastSortOrder.map((id, i) => [id, i]))
    sorted.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
  } else {
    // New set or first open — sort by updatedAt
    sorted.sort((a, b) => b.updatedAt - a.updatedAt)
    lastSortOrder = sorted.map(t => t.id)
  }

  galleryTopics.value = sorted
  galleryMode.value = true
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function exitGallery() {
  galleryMode.value = false
  galleryTopics.value = []
  // Reset parallax transform so it doesn't stay cleared
  if (spaceRef.value) {
    spaceRef.value.style.transform = ''
  }
}

async function onTopicClick(treeId) {
  // Get the clicked preview element's position for zoom animation
  const itemEl = galleryItemRefs.get(treeId)
  const previewEl = itemEl?.querySelector?.('.gallery-preview') || itemEl?.$el?.querySelector?.('.gallery-preview')

  if (previewEl) {
    const rect = previewEl.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Calculate transform to go from current position to fullscreen
    const scaleX = vw / rect.width
    const scaleY = vh / rect.height
    const scale = Math.max(scaleX, scaleY)
    const tx = (vw / 2) - (rect.left + rect.width / 2)
    const ty = (vh / 2) - (rect.top + rect.height / 2)

    // Apply zoom transform to the preview element
    previewEl.style.transition = 'transform 0.4s cubic-bezier(.22,1,.36,1), opacity 0.3s'
    previewEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    previewEl.style.zIndex = '200'
    previewEl.style.borderRadius = '0'

    zoomingTopicId.value = treeId

    // Wait for animation
    await new Promise(r => setTimeout(r, 350))
  }

  // Now switch
  galleryMode.value = false
  zoomingTopicId.value = null
  galleryTopics.value = []
  galleryItemRefs.clear()

  if (treeId !== activeTreeId.value) {
    await forest.switchTree(treeId)
  }

  // Reset parallax
  if (spaceRef.value) {
    spaceRef.value.style.transform = ''
  }
}

async function deleteTopic(treeId) {
  galleryTopics.value = galleryTopics.value.filter(t => t.id !== treeId)
  lastSortOrder = galleryTopics.value.map(t => t.id)
  await forest.deleteTree(treeId)
  // If deleted the only topic, exit gallery
  if (galleryTopics.value.length === 0) {
    exitGallery()
  }
}

const sortedTopics = computed(() => galleryTopics.value)

// Expose for App.vue
defineExpose({ enterGallery, galleryMode })

// ── Grid layout ──
const COLS = 3

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${COLS}, 1fr)`,
  gap: '24px',
  padding: '60px 48px 48px',
  maxWidth: '1200px',
  margin: '0 auto',
}))

// Dynamically compute preview scale from actual container width
const galleryScrollRef = ref(null)

function updatePreviewScale() {
  nextTick(() => {
    const container = galleryScrollRef.value
    if (!container) return
    const cw = container.clientWidth
    const padX = 96 // 48*2
    const gaps = (COLS - 1) * 24
    const itemW = (Math.min(cw, 1200) - padX - gaps) / COLS
    // Scale based on actual viewport width (canvas uses 100vw)
    const vw = window.innerWidth || 1280
    const vh = window.innerHeight || 800
    const scale = itemW / vw
    container.style.setProperty('--preview-scale', scale.toFixed(4))
    container.style.setProperty('--viewport-ratio', `${vw} / ${vh}`)
  })
}

watch(galleryMode, (v) => {
  if (v) {
    updatePreviewScale()
    window.addEventListener('resize', updatePreviewScale)
  } else {
    window.removeEventListener('resize', updatePreviewScale)
  }
})

// ── Existing card logic (unchanged) ──
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
    const ref = cardRefs.get(id)
    const el = ref?.$el || ref
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

const spaceRef = ref(null)
const emit = defineEmits(['click-canvas'])

function handleBgClick(e) {
  if (galleryMode.value) return
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}

function onToggleDock(cardId) { timeline.toggleDock(cardId) }

function onDragEnd(card, x, y) {
  if (card._isDocked) return
  const key = card.data?.key
  if (key) timeline.setUserOverride(key, x, y)
}

function onMouseMove(e) {
  if (!spaceRef.value || galleryMode.value) return
  const rx = (e.clientY / window.innerHeight - 0.5) * -8
  const ry = (e.clientX / window.innerWidth - 0.5) * 8
  spaceRef.value.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
}

function onKeyDown(e) {
  if (e.key === 'Escape' && galleryMode.value) {
    exitGallery()
  }
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', updatePreviewScale)
})
</script>

<style>
/* ── Gallery mode ── */
.canvas.mission-control {
  cursor: default;
}

.gallery-scroll {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 100;
  background: rgba(220,221,224,0.92);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  animation: gallery-fade-in 0.3s ease;
}

@keyframes gallery-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.gallery-scroll::-webkit-scrollbar {
  width: 6px;
}
.gallery-scroll::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.1);
  border-radius: 3px;
}

/* ── Gallery item ── */
.gallery-item {
  cursor: pointer;
}

.gallery-preview {
  position: relative;
  aspect-ratio: var(--viewport-ratio, 16 / 10);
  overflow: hidden;
  border-radius: 12px;
  background: rgba(0,0,0,0.04);
  transition: box-shadow 0.2s, transform 0.2s;
}

.gallery-item:hover .gallery-preview {
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}

.gallery-item.active .gallery-preview {
  box-shadow: 0 0 0 3px rgba(0,0,0,0.12);
}

/* Scaled real canvas inside preview */
.gallery-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  transform: scale(var(--preview-scale, 0.25));
  transform-origin: top left;
  pointer-events: none;
}

.gallery-canvas .v-block {
  transition: none !important;
  animation: none !important;
  pointer-events: none !important;
  min-width: 0 !important;
  max-width: none !important;
}

.gallery-canvas .win-bar { display: none !important; }

.gallery-canvas .win-body { padding: 6px !important; }
.gallery-canvas .blocks-renderer {
  gap: 3px !important;
  padding: 6px !important;
}

/* Label */
.gallery-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(0,0,0,0.5);
  text-align: center;
  padding: 8px 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Delete */
.gallery-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.8);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
  z-index: 2;
}

.gallery-item:hover .gallery-delete { opacity: 1; }
.gallery-delete:hover { background: rgba(200,60,60,0.6); color: #fff; }

/* Empty preview */
.preview-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0,0,0,0.06);
  font-size: 14px;
  letter-spacing: 4px;
}

/* Close button */
.gallery-close-btn {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 110;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.06);
  color: rgba(0,0,0,0.4);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.gallery-close-btn:hover {
  background: rgba(0,0,0,0.1);
  color: rgba(0,0,0,0.6);
}

/* Zoom animation */
.gallery-scroll.zooming {
  background: transparent;
  backdrop-filter: none;
  pointer-events: none;
}

.gallery-scroll.zooming .gallery-item:not(.zoom-target) {
  opacity: 0;
  transition: opacity 0.2s;
}

.gallery-scroll.zooming .gallery-close-btn,
.gallery-scroll.zooming .gallery-label {
  opacity: 0;
  transition: opacity 0.15s;
}

.gallery-scroll.zooming .zoom-target .gallery-preview {
  overflow: visible;
}

/* ── Compute --preview-scale from container ── */
.gallery-item {
  --preview-scale: 0.25;
}

/* ═══ Theme: Mercury ═══ */
.theme-mercury .gallery-scroll {
  background: rgba(220,221,224,0.92);
}
.theme-mercury .gallery-preview { background: rgba(0,0,0,0.035); }
.theme-mercury .gallery-item.active .gallery-preview { box-shadow: 0 0 0 3px rgba(0,0,0,0.1); }
.theme-mercury .gallery-label { color: rgba(0,0,0,0.45); }

/* ═══ Theme: Dot ═══ */
.theme-dot .gallery-scroll {
  background: rgba(240,230,220,0.92);
}
.theme-dot .gallery-preview { background: rgba(0,0,0,0.025); }
.theme-dot .gallery-item.active .gallery-preview { box-shadow: 0 0 0 3px rgba(180,140,100,0.2); }
.theme-dot .gallery-label { color: rgba(100,80,60,0.45); }

/* ═══ Theme: Basic (dark) ═══ */
body:not(.theme-mercury):not(.theme-dot) .gallery-scroll {
  background: rgba(10,10,8,0.9);
}
body:not(.theme-mercury):not(.theme-dot) .gallery-preview { background: rgba(255,255,255,0.04); }
body:not(.theme-mercury):not(.theme-dot) .gallery-item.active .gallery-preview { box-shadow: 0 0 0 3px rgba(196,168,130,0.2); }
body:not(.theme-mercury):not(.theme-dot) .gallery-label { color: rgba(196,168,130,0.45); }
body:not(.theme-mercury):not(.theme-dot) .gallery-delete { background: rgba(255,255,255,0.1); }
body:not(.theme-mercury):not(.theme-dot) .preview-empty { color: rgba(196,168,130,0.08); }
</style>
