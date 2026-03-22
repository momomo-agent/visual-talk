<template>
  <div class="canvas" @click="handleBgClick">
    <!-- Eye tracking debug overlay -->
    <div v-if="showDebug" class="eye-debug">
      <div class="eye-dot" :style="gazeDotStyle"></div>
      <div class="eye-info">
        {{ isTracking ? `👁 ${method}` : '👁 no face' }}
        <br>head: {{ headX.toFixed(2) }}, {{ headY.toFixed(2) }}
        <br>eye: {{ proj.eyeX.toFixed(0) }}, {{ proj.eyeY.toFixed(0) }}
      </div>
    </div>

    <div class="canvas-space" ref="spaceRef">
      <BlockCard
        v-for="[id, card] in cards"
        :key="id"
        :card="card"
        :style="getParallaxStyle(card)"
        @toggle-select="(e) => toggleSelect(id, e)"
        @update-position="(x, y) => updateCardPosition(id, x, y)"
        @drag-end="(x, y) => onDragEnd(id, x, y)"
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
import { useEyeTracking } from '../composables/useEyeTracking.js'
import { OffAxisProjection } from '../lib/off-axis-projection.js'
import BlockCard from './BlockCard.vue'
import SketchOverlay from './SketchOverlay.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const { cards, greetingVisible } = storeToRefs(canvas)
const { toggleSelect, clearSelection, updateCardPosition } = canvas

const showDebug = ref(true)
const spaceRef = ref(null)

// Eye tracking
const { headX, headY, gazeX, gazeY, isTracking, confidence, method } = useEyeTracking({
  smoothing: 0.08,
  updateRate: 10,
})

// Projection engine
const proj = new OffAxisProjection(
  window.innerWidth,
  window.innerHeight,
  600 // 眼睛到屏幕的虚拟距离，越小效果越强
)

function getParallaxStyle(card) {
  // Update eye position from head tracking
  proj.setEyePosition(headX.value, headY.value)

  // Card position relative to screen center
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardCenterX = (card.x / 100) * vw + (card.w / 100) * vw / 2 - vw / 2
  const cardCenterY = (card.y / 100) * vh - vh / 2

  // Card depth — z values in Visual Talk are 0-60 typically
  // Map to projection space: z=0 is screen plane
  const depth = (card.z || 0) * 4 // amplify for visible effect

  const { offsetX, offsetY, scale } = proj.project(cardCenterX, cardCenterY, depth)

  return {
    '--parallax-x': `${offsetX}px`,
    '--parallax-y': `${offsetY}px`,
    '--parallax-scale': scale,
  }
}

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

function onResize() {
  proj.resize(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.eye-debug {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none; z-index: 10000;
}
.eye-dot {
  position: absolute; width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(0, 200, 255, 0.8);
  box-shadow: 0 0 16px rgba(0, 200, 255, 0.6);
  transform: translate(-50%, -50%);
  transition: left 0.05s, top 0.05s;
}
.eye-info {
  position: absolute; top: 10px; right: 10px;
  font-size: 11px; color: rgba(255,255,255,0.5);
  font-family: monospace; text-align: right; line-height: 1.6;
}
</style>
