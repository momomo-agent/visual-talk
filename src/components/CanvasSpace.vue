<template>
  <div class="canvas" @click="handleBgClick">
    <!-- Docked zone: fixed left, flow layout, no 3D -->
    <div v-if="dockedCards.length" class="docked-zone">
      <BlockCard
        v-for="[id, card] in dockedCards"
        :key="'dock-' + id"
        :card="card"
        class="is-docked"
        @toggle-select="(e) => toggleSelect(id, e)"
        @toggle-dock="() => onToggleDock(id)"
        @update-position="() => {}"
        @drag-end="() => {}"
      />
    </div>
    <!-- Canvas: 3D perspective, flowing cards -->
    <div class="canvas-space" ref="spaceRef">
      <BlockCard
        v-for="[id, card] in canvasCards"
        :key="id"
        :card="card"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
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

// Split cards into docked (left zone) and canvas (3D zone)
const dockedCards = computed(() => {
  const result = []
  cards.value.forEach((card, id) => {
    if (dockedIds.value.has(id)) {
      card._isDocked = true
      result.push([id, card])
    }
  })
  return result
})

const canvasCards = computed(() => {
  const result = []
  cards.value.forEach((card, id) => {
    if (!dockedIds.value.has(id)) {
      card._isDocked = false
      result.push([id, card])
    }
  })
  return result
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
