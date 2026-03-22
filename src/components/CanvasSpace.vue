<template>
  <div class="canvas" @click="handleBgClick">
    <!-- Eye tracking debug overlay -->
    <div v-if="showDebug" class="eye-debug">
      <div class="eye-dot" :style="gazeDotStyle"></div>
      <div class="eye-info">
        {{ isTracking ? `👁 ${method}` : '👁 no face' }}
        <br>head: {{ headX.toFixed(2) }}, {{ headY.toFixed(2) }}
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

/**
 * Pure parallax via CSS variable --parallax-x/y
 * 
 * Each card shifts based on its z-depth × head position.
 * Higher z = closer to viewer = shifts MORE (opposite to bg).
 * This is how real parallax works — foreground moves more than background.
 */
function getParallaxStyle(card) {
  const z = card.z || 0
  // Normalize z: typical range 0-60, map to 0-1 multiplier
  const depth = z / 40
  // Shift amount: up to 40px at max depth for full head turn
  const px = headX.value * depth * 40
  const py = headY.value * depth * 25
  return {
    '--parallax-x': `${px}px`,
    '--parallax-y': `${py}px`,
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

onMounted(() => { window.addEventListener('keydown', onKeyDown) })
onUnmounted(() => { window.removeEventListener('keydown', onKeyDown) })
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
</style>
