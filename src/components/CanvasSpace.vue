<template>
  <div class="canvas" @click="handleBgClick">
    <!-- Eye tracking debug -->
    <div v-if="showDebug" class="eye-debug">
      <div class="eye-info">
        {{ isTracking ? `👁 ${method}` : '👁 no face' }}
        <br>x: {{ headX.toFixed(3) }} y: {{ headY.toFixed(3) }} z: {{ headZ.toFixed(2) }}
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
import { ref, onMounted, onUnmounted } from 'vue'
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

// Eye tracking — parallax-effect style EMA smoothing
const { headX, headY, headZ, isTracking, method } = useEyeTracking({
  smoothEye: 0.3,
  smoothDist: 0.15,
})

/**
 * Parallax style — matching parallax-effect Three.js example approach:
 * 
 * camera.position.x = baseX + 0.8 * view.x * strength
 * camera.position.y = baseY + 1.2 * view.y * strength
 * camera.rotation.x = -0.12 * view.y
 * camera.rotation.y = 0.12 * view.x
 * 
 * For CSS: each card shifts proportional to its z-depth × head position.
 * The key insight from the library: use DIFFERENT multipliers for X and Y,
 * and add a tiny rotation (CSS perspective handles this).
 */
const STRENGTH = 1.5

function getParallaxStyle(card) {
  const z = card.z || 0
  const depth = z / 30 // normalize typical 0-60 range to 0-2

  // Position shift — mimics camera.position offset
  const px = headX.value * depth * 60 * STRENGTH
  const py = headY.value * depth * 40 * STRENGTH

  // Slight rotation — mimics camera.rotation (very subtle)
  const rx = -headY.value * depth * 1.5
  const ry = headX.value * depth * 1.5

  return {
    '--parallax-x': `${px}px`,
    '--parallax-y': `${py}px`,
    '--parallax-rx': `${rx}deg`,
    '--parallax-ry': `${ry}deg`,
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
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none; z-index: 10000;
}
.eye-info {
  position: absolute; top: 10px; right: 10px;
  font-size: 11px; color: rgba(255,255,255,0.5);
  font-family: monospace; text-align: right; line-height: 1.6;
}
</style>
