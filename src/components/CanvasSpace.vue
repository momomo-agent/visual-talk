<template>
  <div class="canvas" @click="handleBgClick">
    <div class="canvas-space" ref="spaceRef" :class="{ 'nav-zoom': isNavigating }">
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
    <div class="greeting" :class="{ hidden: !greetingVisible }">visual talk</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import { useTimelineStore } from '../stores/timeline.js'
import BlockCard from './BlockCard.vue'
import SketchOverlay from './SketchOverlay.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const { cards, greetingVisible, isNavigating } = storeToRefs(canvas)
const { dockedIds, dockedSnapshots } = storeToRefs(timeline)
const { toggleSelect, clearSelection, updateCardPosition } = canvas

// Track card DOM refs for measuring heights
const cardRefs = new Map()
function setCardRef(id, el) {
  if (el) cardRefs.set(id, el)
  else cardRefs.delete(id)
}

// Dock slot positions — computed from actual DOM heights
const dockSlots = ref(new Map())  // id -> topPx

function recalcDockSlots() {
  const slots = new Map()
  let y = 36  // top padding
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

// Dock zone: 12px padding + 276px card = 288px
// Convert to percentage at runtime based on actual viewport
const DOCK_ZONE_PX = 288

// All cards in one list — canvas cards + docked snapshots merged
const allCards = computed(() => {
  const entries = []
  let dockIndex = 0
  const dIds = dockedIds.value
  const hasDock = dIds.size > 0

  // Canvas cards (tree replay results) — skip docked ones (they're in independent layer)
  cards.value.forEach((card, id) => {
    if (dIds.has(id)) return  // hidden — it's been picked up

    card._isDocked = false
    card._dockSlot = -1
    card._dockTop = 0

    // Remap x coordinate: when docked cards present, shift canvas right
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

  // Docked snapshots — independent layer
  dockedSnapshots.value.forEach((snap, id) => {
    const docked = { ...snap }
    docked._isDocked = true
    docked._dockSlot = dockIndex++
    docked._dockTop = dockSlots.value.get(id) ?? (36 + docked._dockSlot * 220)
    entries.push([id, docked])
  })

  return entries
})

const hasDocked = computed(() => dockedIds.value.size > 0)

// Recalc dock positions when dock list changes
watch(dockedSnapshots, () => {
  nextTick(() => recalcDockSlots())
}, { deep: true })

// Also recalc when cards change (new cards loaded)
watch(cards, () => {
  nextTick(() => recalcDockSlots())
}, { deep: true })

const spaceRef = ref(null)

const emit = defineEmits(['click-canvas'])

function handleBgClick(e) {
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}

function onToggleDock(cardId) {
  timeline.toggleDock(cardId)
}

function onDragEnd(card, x, y) {
  if (card._isDocked) return
  const key = card.data?.key
  if (key) {
    timeline.setUserOverride(key, x, y)
  }
}

function onMouseMove(e) {
  if (!spaceRef.value) return
  const rx = (e.clientY / window.innerHeight - 0.5) * -8
  const ry = (e.clientX / window.innerWidth - 0.5) * 8
  spaceRef.value.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
})
</script>
