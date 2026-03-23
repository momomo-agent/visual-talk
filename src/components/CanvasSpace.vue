<template>
  <div class="canvas" @click="handleBgClick">
    <div class="canvas-space" ref="spaceRef">
      <BlockCard
        v-for="[id, card] in allCards"
        :key="id"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import { useTimelineStore } from '../stores/timeline.js'
import BlockCard from './BlockCard.vue'
import SketchOverlay from './SketchOverlay.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const { cards, greetingVisible } = storeToRefs(canvas)
const { dockedIds } = storeToRefs(timeline)
const { toggleSelect, clearSelection, updateCardPosition } = canvas

// All cards — docked ones get position overrides via CSS/style
const allCards = computed(() => {
  const entries = []
  let dockIndex = 0

  cards.value.forEach((card, id) => {
    if (dockedIds.value.has(id)) {
      // Force docked position: stack vertically on left side
      // We set _dockSlot so the card style can position it
      card._dockSlot = dockIndex++
      card._isDocked = true
    } else {
      card._isDocked = false
      card._dockSlot = -1
    }
    entries.push([id, card])
  })
  return entries
})

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
  if (card._isDocked) return  // don't save overrides for docked cards
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
