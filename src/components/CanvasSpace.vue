<template>
  <div class="canvas" ref="canvasRef" @click="handleBgClick">
    <!-- Eye tracking debug overlay -->
    <div v-if="showDebug" class="eye-debug">
      <div class="eye-dot" :style="gazeDotStyle"></div>
      <div class="eye-info">
        {{ isTracking ? `👁 ${method}` : '👁 no face' }}
        <br>head: {{ headX.toFixed(2) }}, {{ headY.toFixed(2) }}
      </div>
    </div>

    <!-- Cards are rendered here but positioned by CSS3DRenderer -->
    <div v-show="false" ref="cardContainer">
      <div
        v-for="[id, card] in cards"
        :key="id"
        :ref="el => setCardRef(id, el)"
        class="space-card-wrapper"
      >
        <BlockCard
          :card="card"
          @toggle-select="(e) => toggleSelect(id, e)"
          @update-position="(x, y) => updateCardPosition(id, x, y)"
          @drag-end="(x, y) => onDragEnd(id, x, y)"
        />
      </div>
    </div>

    <div class="greeting" :class="{ hidden: !greetingVisible }">visual talk</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useEyeTracking } from '../composables/useEyeTracking.js'
import { EyeSpace } from '../lib/eye-space.js'
import BlockCard from './BlockCard.vue'
import SketchOverlay from './SketchOverlay.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const { cards, greetingVisible } = storeToRefs(canvas)
const { toggleSelect, clearSelection, updateCardPosition } = canvas

const canvasRef = ref(null)
const showDebug = ref(true)

// Eye tracking
const { headX, headY, gazeX, gazeY, isTracking, confidence, method } = useEyeTracking({
  smoothing: 0.2,
  updateRate: 15,
})

// 3D space
let eyeSpace = null
const cardRefs = new Map()

function setCardRef(id, el) {
  if (el) cardRefs.set(id, el)
  else cardRefs.delete(id)
}

// Convert card canvas coords to 3D position
function cardTo3D(card) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const x = (card.x / 100) * vw - vw / 2 + (card.w / 100) * vw / 2
  const y = (card.y / 100) * vh - vh / 2 + 100
  const z = (card.z || 0) * 3 // amplify z for more depth separation
  return { x, y, z }
}

// Sync cards to 3D scene
function syncCards() {
  if (!eyeSpace) return

  const activeIds = new Set()
  for (const [id, card] of cards.value) {
    activeIds.add(id)
    const el = cardRefs.get(id)
    if (!el) continue

    const { x, y, z } = cardTo3D(card)

    if (eyeSpace.objects.has(id)) {
      eyeSpace.updateObject(id, x, y, z)
    } else {
      eyeSpace.addObject(id, el, x, y, z)
    }
  }

  // Remove cards that no longer exist
  for (const id of eyeSpace.objects.keys()) {
    if (!activeIds.has(id)) eyeSpace.removeObject(id)
  }
}

// Watch head position → update 3D camera
watch([headX, headY], ([hx, hy]) => {
  if (eyeSpace) eyeSpace.setHeadPosition(hx, hy)
})

// Watch cards changes → sync to 3D
watch(cards, () => {
  nextTick(syncCards)
}, { deep: true })

function onDragEnd(cardId, x, y) {
  const nodeId = timeline.activeTip
  if (nodeId == null) return
  timeline.addOperation(nodeId, { op: 'user-move', cardId, to: { x, y } })
}

const emit = defineEmits(['click-canvas'])
function handleBgClick(e) {
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}

// Debug
const gazeDotStyle = computed(() => ({
  left: `${gazeX.value * 100}%`,
  top: `${gazeY.value * 100}%`,
}))
function onKeyDown(e) {
  if (e.key === 'd' && !e.target.matches('input, textarea')) {
    showDebug.value = !showDebug.value
  }
}

onMounted(() => {
  eyeSpace = new EyeSpace(canvasRef.value)
  window.addEventListener('keydown', onKeyDown)
  nextTick(syncCards)
})

onUnmounted(() => {
  if (eyeSpace) eyeSpace.destroy()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.eye-debug {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 10000;
}
.eye-dot {
  position: absolute;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(0, 200, 255, 0.8);
  box-shadow: 0 0 16px rgba(0, 200, 255, 0.6);
  transform: translate(-50%, -50%);
  transition: left 0.05s, top 0.05s;
}
.eye-info {
  position: absolute;
  top: 10px; right: 10px;
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  font-family: monospace;
  text-align: right;
  line-height: 1.6;
}
.space-card-wrapper {
  /* Cards need explicit dimensions for CSS3DObject */
  width: 300px;
}
</style>
