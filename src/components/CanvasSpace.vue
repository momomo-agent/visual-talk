<template>
  <div class="canvas" :class="{ 'mission-control': galleryMode }" @click="handleBgClick">
    <!-- Current canvas -->
    <div
      class="canvas-space"
      ref="spaceRef"
      :class="{ 'nav-zoom': isNavigating }"
      :style="galleryMode ? currentCanvasStyle : undefined"
      @click.self="galleryMode ? exitGallery() : null"
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

    <!-- Other topics (only in gallery mode) -->
    <div
      v-for="(topic, i) in otherTopics"
      :key="topic.id"
      class="topic-canvas-wrapper"
      :style="topicStyle(i)"
      @click.stop="switchToTopic(topic.id)"
    >
      <div class="topic-canvas-inner">
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
    </div>
    <div
      v-for="(topic, i) in otherTopics"
      :key="'label-' + topic.id"
      class="topic-label"
      :style="topicLabelStyle(i)"
    >{{ topic.name || '新对话' }}</div>

    <!-- New topic button (only in gallery mode) -->
    <div
      v-if="galleryMode"
      class="topic-canvas-wrapper topic-new"
      :style="newTopicStyle"
      @click.stop="createNewTopic"
    >
      <div class="topic-canvas-inner topic-new-inner">
        <span class="topic-new-icon">+</span>
      </div>
    </div>
    <div v-if="galleryMode" class="topic-label" :style="newTopicLabelStyle">新话题</div>

    <!-- Current topic label (only in gallery mode) -->
    <div v-if="galleryMode" class="current-topic-label" :style="currentLabelStyle">
      {{ currentTopicName }}
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

// ── Gallery (Mission Control) mode ──
const galleryMode = ref(false)
const otherTopics = ref([])

// Layout constants
const SCALE = 0.28
const GAP = 30 // px between topics
const COLS_MAX = 4

function enterGallery() {
  galleryMode.value = true
  loadOtherTopics()
}

function exitGallery() {
  galleryMode.value = false
  otherTopics.value = []
}

async function loadOtherTopics() {
  await forest.saveCurrentTree()
  const topics = []
  for (const t of forest.treeList) {
    if (t.isActive) continue
    const rawCards = await forest.getTreePreview(t.id)
    topics.push({
      id: t.id,
      name: t.name,
      cards: rawCards.map(c => reactive({
        id: c.id, x: c.x ?? 10, y: c.y ?? 10, w: c.w || 25,
        z: 0, scale: 1, opacity: 1, blur: 0, zIndex: 100,
        selected: false, pointerEvents: 'none', entranceDelay: 0,
        _isDocked: false, type: c.type || 'blocks',
        contentKey: String(c.id),
        data: c.data || { key: String(c.id), blocks: [{ type: 'text', text: '...' }] },
      })),
    })
  }
  otherTopics.value = topics
}

async function switchToTopic(treeId) {
  galleryMode.value = false
  otherTopics.value = []
  await forest.switchTree(treeId)
}

function createNewTopic() {
  galleryMode.value = false
  otherTopics.value = []
  forest.newTree()
}

// Expose for App.vue
defineExpose({ enterGallery, galleryMode })

// ── Layout math ──
// Total items = 1 (current) + otherTopics + 1 (new)
const totalItems = computed(() => 1 + otherTopics.value.length + (galleryMode.value ? 1 : 0))
const cols = computed(() => Math.min(totalItems.value, COLS_MAX))
const canvasW = computed(() => typeof window !== 'undefined' ? window.innerWidth : 1280)
const canvasH = computed(() => typeof window !== 'undefined' ? window.innerHeight : 800)

const itemW = computed(() => canvasW.value * SCALE)
const itemH = computed(() => canvasH.value * SCALE)
const totalW = computed(() => cols.value * itemW.value + (cols.value - 1) * GAP)
const startX = computed(() => (canvasW.value - totalW.value) / 2)
const startY = computed(() => canvasH.value * 0.3)

function getItemPos(index) {
  const col = index % cols.value
  const row = Math.floor(index / cols.value)
  const x = startX.value + col * (itemW.value + GAP)
  const y = startY.value + row * (itemH.value + GAP + 30) // 30 for label
  return { x, y }
}

const currentCanvasStyle = computed(() => {
  if (!galleryMode.value) return undefined
  const { x, y } = getItemPos(0)
  return {
    transform: `translate(${x}px, ${y}px) scale(${SCALE})`,
    transformOrigin: 'top left',
    cursor: 'default',
  }
})

const currentLabelStyle = computed(() => {
  if (!galleryMode.value) return { display: 'none' }
  const { x, y } = getItemPos(0)
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y + itemH.value + 8}px`,
    width: `${itemW.value}px`,
  }
})

const currentTopicName = computed(() => {
  const active = forest.treeList.find(t => t.isActive)
  return active?.name || '当前话题'
})

function topicStyle(i) {
  if (!galleryMode.value) return { display: 'none' }
  const { x, y } = getItemPos(i + 1)
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${canvasW.value}px`,
    height: `${canvasH.value}px`,
    transform: `scale(${SCALE})`,
    transformOrigin: 'top left',
  }
}

function topicLabelStyle(i) {
  if (!galleryMode.value) return { display: 'none' }
  const { x, y } = getItemPos(i + 1)
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y + itemH.value + 8}px`,
    width: `${itemW.value}px`,
  }
}

const newTopicStyle = computed(() => {
  if (!galleryMode.value) return { display: 'none' }
  const { x, y } = getItemPos(1 + otherTopics.value.length)
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${canvasW.value}px`,
    height: `${canvasH.value}px`,
    transform: `scale(${SCALE})`,
    transformOrigin: 'top left',
  }
})

const newTopicLabelStyle = computed(() => {
  if (!galleryMode.value) return { display: 'none' }
  const { x, y } = getItemPos(1 + otherTopics.value.length)
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y + itemH.value + 8}px`,
    width: `${itemW.value}px`,
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

onMounted(() => document.addEventListener('mousemove', onMouseMove))
onUnmounted(() => document.removeEventListener('mousemove', onMouseMove))
</script>

<style>
/* ── Mission Control mode ── */
.canvas.mission-control {
  cursor: default;
}

.canvas.mission-control .canvas-space {
  transition: transform 0.5s cubic-bezier(.22,1,.36,1);
  pointer-events: none;
  cursor: pointer;
}

.canvas.mission-control .canvas-space:hover {
  filter: brightness(1.05);
}

/* Topic canvas wrappers */
.topic-canvas-wrapper {
  overflow: hidden;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
  z-index: 10;
}

.topic-canvas-wrapper:hover {
  box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
}

.topic-canvas-inner {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: rgba(0,0,0,0.03);
  border-radius: 12px;
}

.topic-canvas-inner .v-block {
  transition: none !important;
  animation: none !important;
  pointer-events: none !important;
  min-width: 0 !important;
  max-width: none !important;
}

.topic-canvas-inner .win-bar { display: none !important; }

/* Topic label — positioned outside scaled wrapper */
.topic-label,
.current-topic-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(0,0,0,0.5);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  z-index: 11;
}

/* New topic */
.topic-new-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed rgba(0,0,0,0.06);
  background: rgba(0,0,0,0.015);
}

.topic-new-icon {
  font-size: 48px;
  color: rgba(0,0,0,0.08);
  transition: color 0.2s;
}

.topic-new:hover .topic-new-icon {
  color: rgba(0,0,0,0.2);
}

/* ═══ Mercury Theme ═══ */
.theme-mercury .topic-canvas-inner { background: rgba(0,0,0,0.025); }
.theme-mercury .topic-label,
.theme-mercury .current-topic-label { color: rgba(0,0,0,0.4); }
.theme-mercury .topic-canvas-wrapper:hover { box-shadow: 0 0 0 2px rgba(0,0,0,0.08); }

/* ═══ Dot Theme ═══ */
.theme-dot .topic-canvas-inner { background: rgba(0,0,0,0.02); }
.theme-dot .topic-label,
.theme-dot .current-topic-label { color: rgba(100,80,60,0.4); }
.theme-dot .topic-canvas-wrapper:hover { box-shadow: 0 0 0 2px rgba(180,140,100,0.15); }

/* ═══ Basic (dark) Theme ═══ */
body:not(.theme-mercury):not(.theme-dot) .topic-canvas-inner { background: rgba(255,255,255,0.03); }
body:not(.theme-mercury):not(.theme-dot) .topic-label,
body:not(.theme-mercury):not(.theme-dot) .current-topic-label { color: rgba(196,168,130,0.4); }
body:not(.theme-mercury):not(.theme-dot) .topic-canvas-wrapper:hover { box-shadow: 0 0 0 2px rgba(196,168,130,0.15); }
body:not(.theme-mercury):not(.theme-dot) .topic-new-inner { border-color: rgba(196,168,130,0.08); }
body:not(.theme-mercury):not(.theme-dot) .topic-new-icon { color: rgba(196,168,130,0.08); }
</style>
