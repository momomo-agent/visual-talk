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
 * Off-axis parallax — physically correct model
 * 
 * Think of the screen as a window. The viewer is at distance D from the screen.
 * A card at depth z behind the screen should shift by:
 *   offset = headPosition * (z / D)
 * 
 * When viewer moves left, objects behind the screen appear to move right
 * (and objects in front move left). This is real parallax.
 * 
 * D (screenDistance) controls sensitivity — smaller = more dramatic effect.
 * headX/Y is mapped to approximate cm of head movement.
 */
const SCREEN_DISTANCE = 5 // virtual "distance to screen" in same units as z
const HEAD_SCALE = 150 // map headX [-1,1] to pixels of shift at z=SCREEN_DISTANCE

function getParallaxStyle(card) {
  const z = card.z || 0
  // Cards with z > 0 are "in front" of screen → shift same direction as head
  // Cards with z < 0 would be "behind" → shift opposite (not used currently)
  const ratio = z / SCREEN_DISTANCE
  const px = headX.value * ratio * HEAD_SCALE
  const py = headY.value * ratio * HEAD_SCALE * 0.7
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
