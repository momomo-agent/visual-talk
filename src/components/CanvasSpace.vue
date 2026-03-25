<template>
  <div class="canvas" :class="{ 'mission-control': galleryMode }" @click="handleBgClick">
    <!-- Live canvas — always present, transform-ed in gallery mode -->
    <div
      class="canvas-space"
      ref="spaceRef"
      :class="{ 'nav-zoom': isNavigating, 'gallery-current': galleryMode }"
      :style="galleryMode ? currentTransformStyle : undefined"
      @click="galleryMode ? onCurrentClick() : null"
    >
      <BlockCard
        v-for="[id, card] in allCards"
        :key="id"
        :ref="el => setCardRef(id, el)"
        :card="card"
        :class="{ 'is-docked': dockedIds.has(id) }"
        @toggle-select="(e) => galleryMode ? null : toggleSelect(id, e)"
        @toggle-dock="() => galleryMode ? null : onToggleDock(id)"
        @update-position="(x, y) => galleryMode ? null : updateCardPosition(id, x, y)"
        @drag-end="(x, y) => galleryMode ? null : onDragEnd(card, x, y)"
      />
      <SketchOverlay v-if="!galleryMode" />
    </div>

    <!-- Gallery: overlay with other topics -->
    <Transition name="gallery-fade">
      <div v-if="galleryMode" class="gallery-overlay" :class="{ zooming: zoomingId }" @click.self="exitGallery">
        <button class="gallery-close-btn" @click="exitGallery">×</button>

        <!-- Other topics grid -->
        <div class="gallery-grid" :style="gridStyle">
          <!-- Slot for current topic (empty — real canvas is behind) -->
          <div class="gallery-item gallery-item-current" :class="{ active: true }" @click="exitGallery">
            <div class="gallery-preview gallery-preview-ghost"></div>
            <div class="gallery-label">{{ currentTopicName }}</div>
          </div>

          <!-- Other topics -->
          <div
            v-for="topic in otherTopics"
            :key="topic.id"
            class="gallery-item"
            :class="{ 'zoom-target': zoomingId === topic.id }"
            :ref="el => setItemRef(topic.id, el)"
            @click="onOtherClick(topic.id)"
          >
            <div class="gallery-preview">
              <div class="gallery-thumb" :style="thumbStyle">
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
              <button
                v-if="otherTopics.length > 0"
                class="gallery-delete"
                @click.stop="deleteTopic(topic.id)"
              >×</button>
            </div>
            <div class="gallery-label">{{ topic.name }}</div>
          </div>
        </div>
      </div>
    </Transition>

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
//  Gallery (Mission Control) Mode
// ════════════════════════════════════════════

const galleryMode = ref(false)
const otherTopics = ref([])
const zoomingId = ref(null)
const itemRefs = new Map()
let lastSortOrder = null

function setItemRef(id, el) {
  if (el) itemRefs.set(id, el)
  else itemRefs.delete(id)
}

const currentTopicName = computed(() => {
  const t = forest.treeList.find(t => t.isActive)
  return t?.name || '新对话'
})

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

// Thumb style: vw×vh scaled down to fit preview
const thumbStyle = computed(() => {
  const vw = window.innerWidth || 1280
  const vh = window.innerHeight || 800
  // Preview box width ≈ (1200 - 96 - 48) / 3 = 352px approx
  // Actual scale set by container; we just provide the virtual size
  return {
    width: vw + 'px',
    height: vh + 'px',
    transform: `scale(var(--thumb-scale, 0.25))`,
    transformOrigin: 'top left',
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
  }
})

// Current canvas position in gallery grid
const currentCanvasPos = ref(null) // { left, top, width, scale }

const currentTransformStyle = computed(() => {
  if (!galleryMode.value || !currentCanvasPos.value) return undefined
  const { left, top, width, scale } = currentCanvasPos.value
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    position: 'fixed',
    left: left + 'px',
    top: top + 'px',
    width: vw + 'px',
    height: vh + 'px',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    transition: 'all 0.45s cubic-bezier(.22,1,.36,1)',
    zIndex: '101',
    pointerEvents: 'auto',
    cursor: 'pointer',
    borderRadius: (12 / scale) + 'px',
    overflow: 'hidden',
  }
})

// ── Enter / Exit ──
async function enterGallery() {
  await forest.saveCurrentTree()

  // Build other topics
  const topics = []
  for (const t of forest.treeList) {
    if (t.isActive) continue

    // Always use getTreePreview for accurate last-3-rounds data
    let rawCards = []
    if (forest.getTreePreview) {
      rawCards = await forest.getTreePreview(t.id)
    }
    if (rawCards.length === 0) {
      rawCards = t.lastCards || []
    }

    const topicCards = rawCards.map(c => reactive({
      id: c.id, x: c.x ?? 10, y: c.y ?? 10, w: c.w || 25,
      z: 0, scale: 1, opacity: 1, blur: 0, zIndex: 100,
      selected: false, pointerEvents: 'none', entranceDelay: 0,
      _isDocked: false, type: c.type || 'blocks',
      contentKey: String(c.id),
      data: c.data || { key: String(c.id), blocks: [{ type: 'text', text: '...' }] },
    }))
    topics.push({
      id: t.id,
      name: t.name || '新对话',
      updatedAt: t.updatedAt || 0,
      cards: topicCards,
    })
  }

  // Sort by updatedAt desc, but stable on re-enter
  topics.sort((a, b) => b.updatedAt - a.updatedAt)
  const ids = topics.map(t => t.id)
  if (lastSortOrder && arrEq(ids.sort(), [...lastSortOrder].sort())) {
    const m = new Map(lastSortOrder.map((id, i) => [id, i]))
    topics.sort((a, b) => (m.get(a.id) ?? 999) - (m.get(b.id) ?? 999))
  } else {
    topics.sort((a, b) => b.updatedAt - a.updatedAt)
    lastSortOrder = topics.map(t => t.id)
  }

  otherTopics.value = topics

  // Step 1: Set canvas to fullscreen position BEFORE enabling gallery mode
  // This ensures the canvas starts at full size when galleryMode becomes true
  currentCanvasPos.value = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    scale: 1,
  }

  galleryMode.value = true

  // Step 2: Wait for gallery DOM to render
  await nextTick()
  updateThumbScale()
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))

  // Step 3: Measure ghost position and animate TO it
  const ghost = document.querySelector('.gallery-preview-ghost')
  if (ghost) {
    const rect = ghost.getBoundingClientRect()
    const vw = window.innerWidth
    currentCanvasPos.value = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      scale: rect.width / vw,
    }
  }
}

function exitGallery() {
  // Animate canvas back to fullscreen first
  currentCanvasPos.value = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    scale: 1,
  }
  // After transition completes, close gallery
  setTimeout(() => {
    currentCanvasPos.value = null
    galleryMode.value = false
    zoomingId.value = null
    otherTopics.value = []
    itemRefs.clear()
    if (spaceRef.value) spaceRef.value.style = ''
  }, 400)
}

function onCurrentClick() {
  // Fade out gallery overlay while zooming current canvas back to fullscreen
  zoomingId.value = '__current__'
  // Start canvas zoom back to fullscreen
  currentCanvasPos.value = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    scale: 1,
  }
  // Close gallery after animation
  setTimeout(() => {
    currentCanvasPos.value = null
    galleryMode.value = false
    zoomingId.value = null
    otherTopics.value = []
    itemRefs.clear()
    if (spaceRef.value) spaceRef.value.style = ''
  }, 450)
}

async function onOtherClick(treeId) {
  // Zoom animation on clicked item
  const el = itemRefs.get(treeId)?.querySelector?.('.gallery-preview')
  if (el) {
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const scale = Math.max(vw / rect.width, vh / rect.height)
    const tx = (vw / 2) - (rect.left + rect.width / 2)
    const ty = (vh / 2) - (rect.top + rect.height / 2)

    el.style.transition = 'transform 0.4s cubic-bezier(.22,1,.36,1)'
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    el.style.zIndex = '200'
    el.style.borderRadius = '0'
    zoomingId.value = treeId

    await new Promise(r => setTimeout(r, 350))
  }

  galleryMode.value = false
  zoomingId.value = null
  otherTopics.value = []
  itemRefs.clear()
  if (spaceRef.value) spaceRef.value.style = ''

  // Suppress entrance animations during tree switch
  if (spaceRef.value) spaceRef.value.classList.add('no-animate')
  await forest.switchTree(treeId)
  await nextTick()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (spaceRef.value) spaceRef.value.classList.remove('no-animate')
    })
  })
}

async function deleteTopic(treeId) {
  otherTopics.value = otherTopics.value.filter(t => t.id !== treeId)
  lastSortOrder = otherTopics.value.map(t => t.id)
  await forest.deleteTree(treeId)
  if (otherTopics.value.length === 0 && forest.treeList.length <= 1) exitGallery()
}

function arrEq(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// Thumb scale — match preview box width to vw
function updateThumbScale() {
  const items = document.querySelectorAll('.gallery-preview:not(.gallery-preview-ghost)')
  if (!items.length) return
  const w = items[0].clientWidth
  const vw = window.innerWidth || 1280
  const scale = w / vw
  document.documentElement.style.setProperty('--thumb-scale', scale.toFixed(4))
  // Also set vp-ratio
  const vh = window.innerHeight || 800
  document.documentElement.style.setProperty('--vp-ratio', `${vw} / ${vh}`)
}

watch(galleryMode, (v) => {
  if (v) window.addEventListener('resize', updateThumbScale)
  else window.removeEventListener('resize', updateThumbScale)
})

defineExpose({ enterGallery, galleryMode })

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

const spaceRef = ref(null)
const emit = defineEmits(['click-canvas'])

function handleBgClick(e) {
  if (galleryMode.value) return
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}

function onToggleDock(id) { timeline.toggleDock(id) }

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
  if (e.key === 'Escape' && galleryMode.value) exitGallery()
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', updateThumbScale)
})
</script>

<style>
/* ════════════════════════════════════════════
   Gallery Overlay
   ════════════════════════════════════════════ */

.gallery-overlay {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 100;
  background: rgba(220,221,224,0.92);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

.gallery-overlay::-webkit-scrollbar { width: 6px; }
.gallery-overlay::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.1); border-radius: 3px;
}

/* Fade transition */
.gallery-fade-enter-active { transition: opacity 0.3s, backdrop-filter 0.3s; }
.gallery-fade-leave-active { transition: opacity 0.2s; }
.gallery-fade-enter-from { opacity: 0; }
.gallery-fade-leave-to { opacity: 0; }

/* ── Gallery current (real canvas in grid) ── */
.canvas-space.gallery-current {
  pointer-events: auto;
  cursor: pointer;
}

.canvas-space.gallery-current .v-block {
  pointer-events: none !important;
  cursor: pointer !important;
}

.canvas-space.gallery-current .v-block .win-bar { display: none !important; }

/* ── Grid Items ── */
.gallery-item {
  cursor: pointer;
  animation: item-up 0.35s ease both;
}
.gallery-item:nth-child(1) { animation-delay: 0s; }
.gallery-item:nth-child(2) { animation-delay: 0.04s; }
.gallery-item:nth-child(3) { animation-delay: 0.08s; }
.gallery-item:nth-child(4) { animation-delay: 0.12s; }
.gallery-item:nth-child(5) { animation-delay: 0.16s; }
.gallery-item:nth-child(6) { animation-delay: 0.2s; }
.gallery-item:nth-child(n+7) { animation-delay: 0.24s; }

@keyframes item-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.gallery-preview {
  position: relative;
  aspect-ratio: var(--vp-ratio, 16 / 9);
  overflow: hidden;
  border-radius: 12px;
  background: rgba(0,0,0,0.04);
  transition: box-shadow 0.2s, transform 0.2s;
}

.gallery-preview-ghost {
  /* Invisible placeholder — real canvas sits behind here */
  background: transparent;
  border: 2px solid rgba(0,0,0,0.06);
}

.gallery-item:hover .gallery-preview {
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}

.gallery-item.active .gallery-preview {
  box-shadow: 0 0 0 3px rgba(0,0,0,0.12);
}

/* Thumb — scaled canvas */
.gallery-thumb {
  position: absolute;
  top: 0; left: 0;
  pointer-events: none;
}

.gallery-thumb .v-block {
  transition: none !important;
  animation: none !important;
  pointer-events: none !important;
  min-width: 0 !important;
  max-width: none !important;
}

/* Suppress entrance animations during tree switch from gallery */
.no-animate .v-block {
  transition: none !important;
  animation: none !important;
}

.gallery-thumb .win-bar { display: none !important; }
.gallery-thumb .win-body { padding: 6px !important; }
.gallery-thumb .blocks-renderer {
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
  position: absolute; top: 8px; right: 8px;
  width: 24px; height: 24px;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.2); color: rgba(255,255,255,0.8);
  font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s, background 0.15s;
  z-index: 2;
}
.gallery-item:hover .gallery-delete { opacity: 1; }
.gallery-delete:hover { background: rgba(200,60,60,0.6); color: #fff; }

/* Empty */
.preview-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: rgba(0,0,0,0.06); font-size: 14px; letter-spacing: 4px;
}

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

/* Zoom out animation */
.gallery-overlay.zooming {
  background: transparent;
  backdrop-filter: none;
  pointer-events: none;
  transition: background 0.4s ease, backdrop-filter 0.3s;
}
.gallery-overlay.zooming .gallery-item:not(.zoom-target) { opacity: 0; transition: opacity 0.35s ease; }
.gallery-overlay.zooming .gallery-close-btn { opacity: 0; transition: opacity 0.25s; }
.gallery-overlay.zooming .gallery-label { opacity: 0; transition: opacity 0.25s; }
.gallery-overlay.zooming .zoom-target .gallery-preview { overflow: visible; }
.gallery-overlay.zooming .gallery-item-current { opacity: 0; transition: opacity 0.3s ease; }

/* ═══ Mercury ═══ */
.theme-mercury .gallery-overlay { background: rgba(220,221,224,0.92); }
.theme-mercury .gallery-preview { background: rgba(0,0,0,0.035); }
.theme-mercury .gallery-item.active .gallery-preview { box-shadow: 0 0 0 3px rgba(0,0,0,0.1); }
.theme-mercury .gallery-label { color: rgba(0,0,0,0.45); }

/* ═══ Dot ═══ */
.theme-dot .gallery-overlay { background: rgba(240,230,220,0.92); }
.theme-dot .gallery-preview { background: rgba(0,0,0,0.025); }
.theme-dot .gallery-item.active .gallery-preview { box-shadow: 0 0 0 3px rgba(180,140,100,0.2); }
.theme-dot .gallery-label { color: rgba(100,80,60,0.45); }

/* ═══ Basic (dark) ═══ */
body:not(.theme-mercury):not(.theme-dot) .gallery-overlay { background: rgba(10,10,8,0.9); }
body:not(.theme-mercury):not(.theme-dot) .gallery-preview { background: rgba(255,255,255,0.04); }
body:not(.theme-mercury):not(.theme-dot) .gallery-item.active .gallery-preview { box-shadow: 0 0 0 3px rgba(196,168,130,0.2); }
body:not(.theme-mercury):not(.theme-dot) .gallery-label { color: rgba(196,168,130,0.45); }
body:not(.theme-mercury):not(.theme-dot) .gallery-delete { background: rgba(255,255,255,0.1); }
body:not(.theme-mercury):not(.theme-dot) .preview-empty { color: rgba(196,168,130,0.08); }
body:not(.theme-mercury):not(.theme-dot) .gallery-preview-ghost { border-color: rgba(196,168,130,0.08); }
body:not(.theme-mercury):not(.theme-dot) .gallery-close-btn { background: rgba(255,255,255,0.06); color: rgba(196,168,130,0.3); }
</style>
