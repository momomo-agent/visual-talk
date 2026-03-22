<template>
  <div class="canvas" @click="handleBgClick">
    <!-- Eye tracking debug overlay -->
    <div v-if="showDebug" class="eye-debug">
      <div class="eye-dot" :style="gazeDotStyle"></div>
      <div class="eye-info">
        {{ isTracking ? `👁 ${method}` : '👁 no face' }}
        <br>head: {{ headX.toFixed(2) }}, {{ headY.toFixed(2) }}
        <br>gaze: {{ gazeX.toFixed(2) }}, {{ gazeY.toFixed(2) }}
      </div>
    </div>

    <div class="canvas-space" ref="spaceRef" :style="canvasTransform">
      <BlockCard
        v-for="[id, card] in cards"
        :key="id"
        :card="card"
        :style="getCardParallaxStyle(card)"
        @toggle-select="(e) => toggleSelect(id, e)"
        @update-position="(x, y) => updateCardPosition(id, x, y)"
        @drag-end="(x, y) => onDragEnd(id, x, y)"
      />
      <SketchOverlay />
    </div>
    <div class="greeting" :class="{ hidden: !greetingVisible }">visual talk</div>

    <!-- Gaze glow — subtle light where user is looking -->
    <div v-if="isTracking" class="gaze-glow" :style="gazeGlowStyle"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useEyeTracking } from '../composables/useEyeTracking.js'
import BlockCard from './BlockCard.vue'
import SketchOverlay from './SketchOverlay.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const { cards, greetingVisible } = storeToRefs(canvas)
const { toggleSelect, clearSelection, updateCardPosition } = canvas

// Eye tracking
const { headX, headY, gazeX, gazeY, isTracking, confidence, method } = useEyeTracking({
  smoothing: 0.12,
  updateRate: 15,
})

const showDebug = ref(true)

// Canvas 3D rotation driven by head position (replaces mouse)
const canvasTransform = computed(() => ({
  transform: `rotateX(${headY.value * -8}deg) rotateY(${headX.value * 8}deg)`,
}))

// Per-card parallax: higher z = more shift
const PARALLAX_FACTOR = 30

function getCardParallaxStyle(card) {
  const z = card.z || 0
  const depth = z / 50
  const shiftX = headX.value * depth * PARALLAX_FACTOR
  const shiftY = headY.value * depth * PARALLAX_FACTOR * 0.6
  return {
    transform: `translateZ(${z}px) scale(${card.scale || 1}) translate(${shiftX}px, ${shiftY}px)`,
  }
}

// Gaze glow
const gazeGlowStyle = computed(() => ({
  left: `${gazeX.value * 100}%`,
  top: `${gazeY.value * 100}%`,
  opacity: isTracking.value ? 0.12 : 0,
}))

const gazeDotStyle = computed(() => ({
  left: `${gazeX.value * 100}%`,
  top: `${gazeY.value * 100}%`,
}))

function onDragEnd(cardId, x, y) {
  const nodeId = timeline.activeTip
  if (nodeId == null) return
  timeline.addOperation(nodeId, {
    op: 'user-move',
    cardId,
    to: { x, y },
  })
}

const spaceRef = ref(null)
const emit = defineEmits(['click-canvas'])

function handleBgClick(e) {
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
  emit('click-canvas')
}

// Toggle debug with 'd' key
function onKeyDown(e) {
  if (e.key === 'd' && !e.target.matches('input, textarea')) {
    showDebug.value = !showDebug.value
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
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
.gaze-glow {
  position: fixed;
  width: 250px; height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(100,150,255,0.15) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
  transition: left 0.1s, top 0.1s, opacity 0.5s;
}
</style>
