<template>
  <svg
    class="sketch-overlay"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
  >
    <defs>
      <marker id="sk-arrowhead" markerWidth="10" markerHeight="7"
        refX="9" refY="3.5" orient="auto" fill="currentColor">
        <polygon points="0 0, 10 3.5, 0 7" />
      </marker>
    </defs>
    <g v-for="[id, sk] in sketches" :key="id" :style="{ color: sk.color || '#c8a06e' }">
      <!-- Arrow between cards -->
      <g v-if="sk.type === 'arrow'" class="sk-arrow">
        <path
          v-if="arrowPath(sk)"
          :d="arrowPath(sk)"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || 2"
          stroke-linecap="round"
          marker-end="url(#sk-arrowhead)"
          :style="sketchFilter"
        />
        <text
          v-if="sk.label && arrowMid(sk)"
          :x="arrowMid(sk)[0]"
          :y="arrowMid(sk)[1] - 8"
          fill="currentColor"
          font-size="12"
          text-anchor="middle"
          :style="labelStyle"
        >{{ sk.label }}</text>
      </g>

      <!-- Free-form line -->
      <g v-else-if="sk.type === 'line'" class="sk-line">
        <path
          :d="linePath(sk)"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || 2"
          stroke-linecap="round"
          stroke-linejoin="round"
          :style="sketchFilter"
        />
      </g>

      <!-- Circle around card or position -->
      <g v-else-if="sk.type === 'circle'" class="sk-circle">
        <ellipse
          v-if="circlePos(sk)"
          :cx="circlePos(sk).cx"
          :cy="circlePos(sk).cy"
          :rx="circlePos(sk).rx"
          :ry="circlePos(sk).ry"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || 2.5"
          stroke-linecap="round"
          :stroke-dasharray="sk.dashed ? '8 6' : 'none'"
          :style="sketchFilter"
        />
      </g>

      <!-- Text label -->
      <g v-else-if="sk.type === 'label'" class="sk-label">
        <text
          :x="pct(sk.x)"
          :y="pct(sk.y)"
          fill="currentColor"
          :font-size="sk.size || 16"
          :style="labelStyle"
        >{{ sk.text }}</text>
      </g>

      <!-- Underline a card -->
      <g v-else-if="sk.type === 'underline'" class="sk-underline">
        <line
          v-if="underlinePos(sk)"
          :x1="underlinePos(sk).x1"
          :y1="underlinePos(sk).y"
          :x2="underlinePos(sk).x2"
          :y2="underlinePos(sk).y"
          stroke="currentColor"
          :stroke-width="sk.width || 3"
          stroke-linecap="round"
          :style="sketchFilter"
        />
      </g>

      <!-- Bracket grouping -->
      <g v-else-if="sk.type === 'bracket'" class="sk-bracket">
        <path
          v-if="bracketPath(sk)"
          :d="bracketPath(sk)"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || 2"
          stroke-linecap="round"
          stroke-linejoin="round"
          :style="sketchFilter"
        />
        <text
          v-if="sk.label && bracketLabel(sk)"
          :x="bracketLabel(sk)[0]"
          :y="bracketLabel(sk)[1]"
          fill="currentColor"
          font-size="13"
          text-anchor="middle"
          :style="labelStyle"
        >{{ sk.label }}</text>
      </g>
    </g>
  </svg>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSketchStore } from '../stores/sketch.js'
import { useCanvasStore } from '../stores/canvas.js'

const sketchStore = useSketchStore()
const canvasStore = useCanvasStore()
const { sketches } = storeToRefs(sketchStore)
const { cards } = storeToRefs(canvasStore)

const width = ref(window.innerWidth)
const height = ref(window.innerHeight)

function onResize() {
  width.value = window.innerWidth
  height.value = window.innerHeight
}

onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// Convert percentage to pixels
function pct(v) { return typeof v === 'number' ? v * width.value / 100 : 0 }
function pctY(v) { return typeof v === 'number' ? v * height.value / 100 : 0 }

// Find card center by key
function cardRect(key) {
  let found = null
  cards.value.forEach(c => {
    if (c.contentKey === key || c.data?.key === key) found = c
  })
  if (!found) return null
  const x = pct(found.x)
  const y = pctY(found.y)
  const w = found.w ? pct(found.w) : 200
  const h = 120 // approximate card height
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
}

// Sketchy jitter — adds subtle hand-drawn feel
function jitter(v, amount = 1.5) {
  return v + (Math.random() - 0.5) * amount
}

const sketchFilter = { filter: 'url(#none)' } // placeholder for roughness
const labelStyle = { fontFamily: "'Caveat', 'Segoe Print', cursive", fontWeight: 400 }

// Arrow path between two cards
function arrowPath(sk) {
  const from = cardRect(sk.from)
  const to = cardRect(sk.to)
  if (!from || !to) return null

  const x1 = jitter(from.cx)
  const y1 = jitter(from.cy)
  const x2 = jitter(to.cx)
  const y2 = jitter(to.cy)

  // Bezier with slight curve
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.15
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
}

function arrowMid(sk) {
  const from = cardRect(sk.from)
  const to = cardRect(sk.to)
  if (!from || !to) return null
  return [(from.cx + to.cx) / 2, (from.cy + to.cy) / 2]
}

// Free-form line
function linePath(sk) {
  if (!sk.points?.length) return ''
  const pts = sk.points.map(([x, y]) => [pct(x), pctY(y)])
  if (pts.length < 2) return ''
  let d = `M${jitter(pts[0][0])},${jitter(pts[0][1])}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L${jitter(pts[i][0])},${jitter(pts[i][1])}`
  }
  return d
}

// Circle position
function circlePos(sk) {
  if (sk.target) {
    const r = cardRect(sk.target)
    if (!r) return null
    return { cx: r.cx, cy: r.cy, rx: r.w / 2 + 16, ry: r.h / 2 + 12 }
  }
  return {
    cx: pct(sk.cx),
    cy: pctY(sk.cy),
    rx: pct(sk.r || 5),
    ry: pctY(sk.r || 5),
  }
}

// Underline position
function underlinePos(sk) {
  const r = cardRect(sk.target)
  if (!r) return null
  return { x1: r.x + 8, x2: r.x + r.w - 8, y: r.y + r.h + 4 }
}

// Bracket path (left brace grouping multiple cards)
function bracketPath(sk) {
  if (!sk.targets?.length) return null
  const rects = sk.targets.map(cardRect).filter(Boolean)
  if (rects.length === 0) return null
  const minY = Math.min(...rects.map(r => r.y)) - 10
  const maxY = Math.max(...rects.map(r => r.y + r.h)) + 10
  const side = sk.side === 'right'
    ? Math.max(...rects.map(r => r.x + r.w)) + 20
    : Math.min(...rects.map(r => r.x)) - 20
  const bump = sk.side === 'right' ? 15 : -15
  const midY = (minY + maxY) / 2
  return `M${side},${minY} Q${side + bump},${minY} ${side + bump},${midY} Q${side + bump},${maxY} ${side},${maxY}`
}

function bracketLabel(sk) {
  if (!sk.targets?.length) return null
  const rects = sk.targets.map(cardRect).filter(Boolean)
  if (rects.length === 0) return null
  const midY = (Math.min(...rects.map(r => r.y)) + Math.max(...rects.map(r => r.y + r.h))) / 2
  const side = sk.side === 'right'
    ? Math.max(...rects.map(r => r.x + r.w)) + 45
    : Math.min(...rects.map(r => r.x)) - 45
  return [side, midY]
}
</script>

<style scoped>
.sketch-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}
.sk-arrow, .sk-line, .sk-circle, .sk-underline, .sk-bracket {
  opacity: 0.7;
}
.sk-label {
  opacity: 0.8;
}
</style>
