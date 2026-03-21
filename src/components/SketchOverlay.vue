<template>
  <svg
    class="sketch-overlay"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
  >
    <defs>
      <!-- Hand-drawn arrowhead -->
      <marker id="sk-arrow-end" markerWidth="12" markerHeight="8"
        refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M1,1 L10,4 L1,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </marker>
    </defs>

    <g v-for="[id, sk] in sketches" :key="id" :style="{ color: sk.color || sketchColor }">
      <!-- Arrow between cards -->
      <template v-if="sk.type === 'arrow' && arrowData(sk)">
        <path
          v-for="(d, di) in sketchPaths(arrowData(sk).path)"
          :key="'a'+di"
          :d="d"
          fill="none"
          stroke="currentColor"
          :stroke-width="1.8 - di * 0.3"
          :opacity="1 - di * 0.25"
          stroke-linecap="round"
          :marker-end="di === 0 ? 'url(#sk-arrow-end)' : ''"
        />
        <text
          v-if="sk.label && arrowData(sk).mid"
          :x="arrowData(sk).mid[0]"
          :y="arrowData(sk).mid[1] - 10"
          fill="currentColor"
          font-size="14"
          text-anchor="middle"
          class="sk-text"
        >{{ sk.label }}</text>
      </template>

      <!-- Free-form line -->
      <template v-else-if="sk.type === 'line' && linePts(sk)">
        <path
          v-for="(d, di) in sketchPaths(lineD(sk))"
          :key="'l'+di"
          :d="d"
          fill="none"
          stroke="currentColor"
          :stroke-width="(sk.width || 2) - di * 0.4"
          :opacity="1 - di * 0.25"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </template>

      <!-- Circle around card -->
      <template v-else-if="sk.type === 'circle' && circleData(sk)">
        <path
          v-for="(d, di) in sketchPaths(circleD(sk))"
          :key="'c'+di"
          :d="d"
          fill="none"
          stroke="currentColor"
          :stroke-width="(sk.width || 2) - di * 0.3"
          :opacity="0.7 - di * 0.15"
          stroke-linecap="round"
        />
      </template>

      <!-- Text label -->
      <template v-else-if="sk.type === 'label'">
        <text
          :x="pctX(sk.x)"
          :y="pctY(sk.y)"
          fill="currentColor"
          :font-size="sk.size || 18"
          class="sk-text"
        >{{ sk.text }}</text>
      </template>

      <!-- Underline -->
      <template v-else-if="sk.type === 'underline' && underData(sk)">
        <path
          v-for="(d, di) in sketchPaths(underData(sk))"
          :key="'u'+di"
          :d="d"
          fill="none"
          stroke="currentColor"
          :stroke-width="(sk.width || 2.5) - di * 0.4"
          :opacity="0.7 - di * 0.15"
          stroke-linecap="round"
        />
      </template>

      <!-- Bracket -->
      <template v-else-if="sk.type === 'bracket' && bracketData(sk)">
        <path
          v-for="(d, di) in sketchPaths(bracketData(sk).path)"
          :key="'b'+di"
          :d="d"
          fill="none"
          stroke="currentColor"
          :stroke-width="(sk.width || 2) - di * 0.3"
          :opacity="0.7 - di * 0.15"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          v-if="sk.label && bracketData(sk).labelPos"
          :x="bracketData(sk).labelPos[0]"
          :y="bracketData(sk).labelPos[1]"
          fill="currentColor"
          font-size="14"
          text-anchor="middle"
          class="sk-text"
        >{{ sk.label }}</text>
      </template>
    </g>
  </svg>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSketchStore } from '../stores/sketch.js'
import { useCanvasStore } from '../stores/canvas.js'

const sketchStore = useSketchStore()
const canvasStore = useCanvasStore()
const { sketches } = storeToRefs(sketchStore)
const { cards } = storeToRefs(canvasStore)

const sketchColor = '#c8a06e'

const width = ref(window.innerWidth)
const height = ref(window.innerHeight)

function onResize() {
  width.value = window.innerWidth
  height.value = window.innerHeight
}

onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

function pctX(v) { return (v / 100) * width.value }
function pctY(v) { return (v / 100) * height.value }

// --- Card geometry ---
function cardRect(key) {
  let found = null
  cards.value.forEach(c => {
    if (c.contentKey === key || c.data?.key === key) found = c
  })
  if (!found) return null
  const x = pctX(found.x)
  const y = pctY(found.y)
  const w = found.w ? pctX(found.w) : 200
  const h = 130
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
}

// Find the point on the edge of rect closest to target point
function edgePoint(rect, tx, ty) {
  const cx = rect.cx, cy = rect.cy
  const dx = tx - cx, dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const hw = rect.w / 2 + 8  // padding
  const hh = rect.h / 2 + 8

  // Which edge does the line from center to target cross first?
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)

  return { x: cx + dx * s, y: cy + dy * s }
}

// --- Hand-drawn jitter ---
// Generate 2-3 slightly offset copies of a path for that hand-drawn feel
function sketchPaths(pathD) {
  if (!pathD) return []
  const paths = [pathD]
  // Add 2 jittered copies
  for (let pass = 1; pass <= 2; pass++) {
    const seed = pass * 17
    paths.push(pathD.replace(/(-?\d+\.?\d*)/g, (match, num, offset) => {
      const n = parseFloat(num)
      if (isNaN(n) || Math.abs(n) < 2) return match
      const jit = (Math.sin(offset * 0.7 + seed) * 1.2 + Math.cos(offset * 1.3 + seed) * 0.8)
      return (n + jit).toFixed(1)
    }))
  }
  return paths
}

// --- Arrow ---
function arrowData(sk) {
  const fromRect = cardRect(sk.from)
  const toRect = cardRect(sk.to)
  if (!fromRect || !toRect) return null

  // Connect from edge to edge
  const p1 = edgePoint(fromRect, toRect.cx, toRect.cy)
  const p2 = edgePoint(toRect, fromRect.cx, fromRect.cy)

  // Slight curve perpendicular to the line
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const curvature = Math.min(len * 0.15, 40)
  const mx = (p1.x + p2.x) / 2 - (dy / len) * curvature
  const my = (p1.y + p2.y) / 2 + (dx / len) * curvature

  const path = `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  const mid = [mx, my]
  return { path, mid }
}

// --- Free line ---
function linePts(sk) { return sk.points?.length >= 2 }
function lineD(sk) {
  const pts = sk.points.map(([x, y]) => [pctX(x), pctY(y)])
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    // Use quadratic curves through midpoints for smoother feel
    if (i < pts.length - 1) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
    } else {
      d += ` L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`
    }
  }
  return d
}

// --- Circle ---
function circleData(sk) {
  if (sk.target) return cardRect(sk.target)
  if (sk.cx != null) return { cx: pctX(sk.cx), cy: pctY(sk.cy), w: pctX(sk.r || 5) * 2, h: pctY(sk.r || 5) * 2 }
  return null
}
function circleD(sk) {
  const r = circleData(sk)
  if (!r) return null
  const rx = r.w / 2 + 12, ry = r.h / 2 + 8
  const cx = r.cx, cy = r.cy
  // Hand-drawn ellipse using 4 cubic bezier arcs (slightly irregular)
  const k = 0.5522848 // circle approximation constant
  const jx = 3, jy = 2 // asymmetry for hand-drawn feel
  return `M${(cx - rx + jx).toFixed(1)},${cy.toFixed(1)} `
    + `C${(cx - rx).toFixed(1)},${(cy - ry * k - jy).toFixed(1)} ${(cx - rx * k + jx).toFixed(1)},${(cy - ry).toFixed(1)} ${cx.toFixed(1)},${(cy - ry + jy).toFixed(1)} `
    + `C${(cx + rx * k + jx).toFixed(1)},${(cy - ry - jy).toFixed(1)} ${(cx + rx).toFixed(1)},${(cy - ry * k).toFixed(1)} ${(cx + rx - jx).toFixed(1)},${cy.toFixed(1)} `
    + `C${(cx + rx).toFixed(1)},${(cy + ry * k + jy).toFixed(1)} ${(cx + rx * k - jx).toFixed(1)},${(cy + ry).toFixed(1)} ${cx.toFixed(1)},${(cy + ry - jy).toFixed(1)} `
    + `C${(cx - rx * k - jx).toFixed(1)},${(cy + ry + jy).toFixed(1)} ${(cx - rx).toFixed(1)},${(cy + ry * k).toFixed(1)} ${(cx - rx + jx).toFixed(1)},${cy.toFixed(1)}Z`
}

// --- Underline ---
function underData(sk) {
  const r = cardRect(sk.target)
  if (!r) return null
  const y = r.y + r.h + 6
  // Wavy underline
  const x1 = r.x + 6, x2 = r.x + r.w - 6
  const mid = (x1 + x2) / 2
  return `M${x1.toFixed(1)},${y.toFixed(1)} Q${mid.toFixed(1)},${(y + 3).toFixed(1)} ${x2.toFixed(1)},${y.toFixed(1)}`
}

// --- Bracket ---
function bracketData(sk) {
  if (!sk.targets?.length) return null
  const rects = sk.targets.map(cardRect).filter(Boolean)
  if (!rects.length) return null

  const right = sk.side === 'right'
  const minY = Math.min(...rects.map(r => r.y)) - 12
  const maxY = Math.max(...rects.map(r => r.y + r.h)) + 12
  const edge = right
    ? Math.max(...rects.map(r => r.x + r.w)) + 16
    : Math.min(...rects.map(r => r.x)) - 16
  const bump = right ? 18 : -18
  const midY = (minY + maxY) / 2

  const path = `M${edge.toFixed(1)},${minY.toFixed(1)} Q${(edge + bump).toFixed(1)},${minY.toFixed(1)} ${(edge + bump).toFixed(1)},${midY.toFixed(1)} Q${(edge + bump).toFixed(1)},${maxY.toFixed(1)} ${edge.toFixed(1)},${maxY.toFixed(1)}`
  const labelPos = [edge + bump * 2, midY + 5]
  return { path, labelPos }
}
</script>

<style scoped>
.sketch-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
  overflow: visible;
}
.sk-text {
  font-family: 'Shantell Sans', 'Caveat', 'Segoe Print', cursive;
  font-weight: 400;
  opacity: 0.8;
}
</style>
