<template>
  <svg
    class="sketch-overlay"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    :data-card-pos="cardPositionVersion"
  >
    <g v-for="[id, sk] in sketches" :key="id">
      <!-- Arrow between cards -->
      <template v-if="sk.type === 'arrow' && arrowData(sk)">
        <path
          :d="arrowData(sk).outline"
          :fill="sk.color || sketchColor"
          stroke="none"
        />
        <!-- Open V arrowhead -->
        <path
          :d="arrowData(sk).head"
          fill="none"
          :stroke="sk.color || sketchColor"
          :stroke-width="baseStrokeW"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          v-if="sk.label && arrowData(sk).labelPos"
          :x="arrowData(sk).labelPos[0]"
          :y="arrowData(sk).labelPos[1]"
          :fill="sk.color || sketchColor"
          font-size="14"
          text-anchor="middle"
          class="sk-text"
        >{{ sk.label }}</text>
      </template>

      <!-- Free-form line -->
      <template v-else-if="sk.type === 'line' && sk.points?.length >= 2">
        <path
          :d="freehandOutline(sk)"
          :fill="sk.color || sketchColor"
          stroke="none"
        />
      </template>

      <!-- Circle / ellipse -->
      <template v-else-if="sk.type === 'circle' && circleOutline(sk)">
        <path
          :d="circleOutline(sk)"
          :fill="sk.color || sketchColor"
          stroke="none"
        />
      </template>

      <!-- Text label -->
      <template v-else-if="sk.type === 'label'">
        <text
          :x="pctX(sk.x)"
          :y="pctY(sk.y)"
          :fill="sk.color || sketchColor"
          :font-size="sk.size || 18"
          class="sk-text"
        >{{ sk.text }}</text>
      </template>

      <!-- Underline -->
      <template v-else-if="sk.type === 'underline' && underOutline(sk)">
        <path
          :d="underOutline(sk)"
          :fill="sk.color || sketchColor"
          stroke="none"
        />
      </template>

      <!-- Bracket -->
      <template v-else-if="sk.type === 'bracket' && bracketData(sk)">
        <path
          :d="bracketData(sk).outline"
          :fill="sk.color || sketchColor"
          stroke="none"
        />
        <text
          v-if="sk.label && bracketData(sk).labelPos"
          :x="bracketData(sk).labelPos[0]"
          :y="bracketData(sk).labelPos[1]"
          :fill="sk.color || sketchColor"
          font-size="14"
          text-anchor="middle"
          class="sk-text"
        >{{ sk.label }}</text>
      </template>
    </g>
  </svg>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSketchStore } from '../stores/sketch.js'
import { useCanvasStore } from '../stores/canvas.js'

const sketchStore = useSketchStore()
const canvasStore = useCanvasStore()
const { sketches } = storeToRefs(sketchStore)
const { cards } = storeToRefs(canvasStore)

const sketchColor = '#d4930d'
const baseStrokeW = 2.0
const SIZE = 4.5 // slightly larger than tldraw "m" (3.5) for visibility on dark bg

// Track card positions reactively — touch x/y of every card to trigger re-render on move
const cardPositionVersion = computed(() => {
  let v = 0
  cards.value.forEach(c => { v += (c.x || 0) + (c.y || 0) })
  return v
})

const width = ref(window.innerWidth)
const height = ref(window.innerHeight)
const spaceRef = ref(null)

function onResize() {
  width.value = window.innerWidth
  height.value = window.innerHeight
}
onMounted(() => {
  window.addEventListener('resize', onResize)
  // Get actual canvas-space dimensions
  const space = document.querySelector('.canvas-space')
  if (space) {
    spaceRef.value = space
    width.value = space.offsetWidth || window.innerWidth
    height.value = space.offsetHeight || window.innerHeight
  }
})
onUnmounted(() => window.removeEventListener('resize', onResize))

function pctX(v) { return (v / 100) * width.value }
function pctY(v) { return (v / 100) * height.value }
function f(n) { return n.toFixed(1) }

// ═══════════════════════════════════════════════
// Freehand stroke engine (simplified tldraw/perfect-freehand)
// ═══════════════════════════════════════════════

// Sample a quadratic bezier at t
function sampleQuad(p0, cp, p1, t) {
  const it = 1 - t
  return {
    x: it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x,
    y: it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y,
  }
}

// Sample points along a quadratic bezier curve with speed variation
function sampleBezier(p0, cp, p1, steps = 24) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    // Ease in-out: slower at ends, faster in middle → thicker ends, thinner middle
    let t = i / steps
    t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // easeInOutQuad
    pts.push(sampleQuad(p0, cp, p1, t))
  }
  return pts
}

// Simulate pressure based on speed (tldraw approach)
// Slower movement = more pressure = thicker line
function simulatePressure(points, size) {
  const result = []
  const thinning = 0.65
  const RATE = 0.275
  let prevPressure = 0.5

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    const dist = i > 0 ? Math.sqrt((pt.x - points[i-1].x)**2 + (pt.y - points[i-1].y)**2) : 0
    const sp = Math.min(1, dist / size)
    const rp = Math.min(1, 1 - sp)
    const pressure = Math.min(1, prevPressure + (rp - prevPressure) * (sp * RATE))
    const radius = size * (0.5 - thinning * (0.5 - pressure))
    prevPressure = pressure
    result.push({ ...pt, pressure, radius: Math.max(0.5, radius) })
  }
  return result
}

// Generate outline polygon from stroke points (like tldraw getStrokeOutlinePoints)
function getOutline(strokePoints) {
  if (strokePoints.length < 2) return ''
  
  const leftPts = []
  const rightPts = []

  for (let i = 0; i < strokePoints.length; i++) {
    const pt = strokePoints[i]
    const prev = strokePoints[Math.max(0, i - 1)]
    const next = strokePoints[Math.min(strokePoints.length - 1, i + 1)]
    
    // Direction vector
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) { dx /= len; dy /= len }
    
    // Perpendicular
    const px = -dy * pt.radius
    const py = dx * pt.radius
    
    leftPts.push({ x: pt.x - px, y: pt.y - py })
    rightPts.push({ x: pt.x + px, y: pt.y + py })
  }

  // Build path: left side forward, end cap, right side backward, start cap
  const last = strokePoints[strokePoints.length - 1]
  const first = strokePoints[0]
  
  let d = `M${f(leftPts[0].x)},${f(leftPts[0].y)}`
  
  // Left side (forward)
  for (let i = 1; i < leftPts.length; i++) {
    d += `L${f(leftPts[i].x)},${f(leftPts[i].y)}`
  }
  
  // End cap (semicircle)
  const endR = last.radius
  d += `A${f(endR)},${f(endR)} 0 0 1 ${f(rightPts[rightPts.length-1].x)},${f(rightPts[rightPts.length-1].y)}`
  
  // Right side (backward)
  for (let i = rightPts.length - 2; i >= 0; i--) {
    d += `L${f(rightPts[i].x)},${f(rightPts[i].y)}`
  }
  
  // Start cap (semicircle)
  const startR = first.radius
  d += `A${f(startR)},${f(startR)} 0 0 1 ${f(leftPts[0].x)},${f(leftPts[0].y)}`
  
  d += 'Z'
  return d
}

// The main function: path string → freehand outline
function pathToFreehand(pathPoints, size = SIZE) {
  if (pathPoints.length < 2) return ''
  const stroked = simulatePressure(pathPoints, size)
  return getOutline(stroked)
}

// ═══════════════════════════════════════════════
// Card geometry — read actual DOM positions
// ═══════════════════════════════════════════════

function cardRect(key) {
  // Find the DOM element by LLM-assigned key
  const el = document.querySelector(`[data-block-key="${key}"]`)
    || document.querySelector(`[data-content-key="${key}"]`)
  if (el) {
    // offsetLeft/Top/Width/Height are layout values, not affected by CSS transforms
    const x = el.offsetLeft
    const y = el.offsetTop
    const w = el.offsetWidth
    const h = el.offsetHeight
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
  }
  // Fallback: use store data (percentage-based)
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

function edgePoint(rect, tx, ty) {
  const cx = rect.cx, cy = rect.cy
  const dx = tx - cx, dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy - rect.h / 2 }
  const hw = rect.w / 2 + 6, hh = rect.h / 2 + 6
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

// ═══════════════════════════════════════════════
// Arrow
// ═══════════════════════════════════════════════

function arrowData(sk) {
  const fromR = cardRect(sk.from)
  const toR = cardRect(sk.to)
  if (!fromR || !toR) return null

  const p1 = edgePoint(fromR, toR.cx, toR.cy)
  const p2 = edgePoint(toR, fromR.cx, fromR.cy)

  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return null

  const curvature = Math.max(len * 0.25, 30)
  const nx = -dy / len, ny = dx / len
  const cpx = (p1.x + p2.x) / 2 + nx * curvature
  const cpy = (p1.y + p2.y) / 2 + ny * curvature

  // Sample the bezier curve into points
  const pathPoints = sampleBezier(p1, { x: cpx, y: cpy }, p2, 32)
  
  // Generate freehand outline
  const outline = pathToFreehand(pathPoints, SIZE)

  // Open V arrowhead (tldraw: PI/6 = 30°)
  const adx = p2.x - cpx, ady = p2.y - cpy
  const al = Math.sqrt(adx * adx + ady * ady)
  const ax = adx / al, ay = ady / al
  const headLen = Math.max(Math.min(len / 5, SIZE * 3), SIZE)
  const angle = Math.PI / 6
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const lx = p2.x - headLen * (ax * cos + ay * sin)
  const ly = p2.y - headLen * (ay * cos - ax * sin)
  const rx = p2.x - headLen * (ax * cos - ay * sin)
  const ry = p2.y - headLen * (ay * cos + ax * sin)
  const head = `M${f(lx)},${f(ly)} L${f(p2.x)},${f(p2.y)} L${f(rx)},${f(ry)}`

  const labelPos = [cpx, cpy - 8]

  return { outline, head, labelPos }
}

// ═══════════════════════════════════════════════
// Free line
// ═══════════════════════════════════════════════

function freehandOutline(sk) {
  const pts = sk.points.map(([x, y]) => ({ x: pctX(x), y: pctY(y) }))
  if (pts.length < 2) return ''
  // Interpolate between points with bezier for smoothness
  const allPts = []
  allPts.push(pts[0])
  for (let i = 1; i < pts.length; i++) {
    if (i < pts.length - 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      const sampled = sampleBezier(allPts[allPts.length - 1], pts[i], { x: mx, y: my }, 12)
      allPts.push(...sampled.slice(1))
    } else {
      allPts.push(pts[i])
    }
  }
  return pathToFreehand(allPts, SIZE)
}

// ═══════════════════════════════════════════════
// Circle
// ═══════════════════════════════════════════════

function circleOutline(sk) {
  let cx, cy, rx, ry
  if (sk.target) {
    const r = cardRect(sk.target)
    if (!r) return null
    cx = r.cx; cy = r.cy
    rx = r.w / 2 + 14; ry = r.h / 2 + 10
  } else if (sk.cx != null) {
    cx = pctX(sk.cx); cy = pctY(sk.cy)
    rx = pctX(sk.r || 5); ry = pctY(sk.r || 5)
  } else return null

  // Sample ellipse into points
  const steps = 48
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
  }
  return pathToFreehand(pts, SIZE)
}

// ═══════════════════════════════════════════════
// Underline
// ═══════════════════════════════════════════════

function underOutline(sk) {
  const r = cardRect(sk.target)
  if (!r) return null
  const y = r.y + r.h + 6
  const x1 = r.x + 6, x2 = r.x + r.w - 6
  const mid = (x1 + x2) / 2
  const pts = sampleBezier({ x: x1, y }, { x: mid, y: y + 4 }, { x: x2, y }, 16)
  return pathToFreehand(pts, SIZE * 0.8)
}

// ═══════════════════════════════════════════════
// Bracket
// ═══════════════════════════════════════════════

function bracketData(sk) {
  if (!sk.targets?.length) return null
  const rects = sk.targets.map(cardRect).filter(Boolean)
  if (!rects.length) return null

  const side = sk.side || 'right'
  const minX = Math.min(...rects.map(r => r.x))
  const maxX = Math.max(...rects.map(r => r.x + r.w))
  const minY = Math.min(...rects.map(r => r.y))
  const maxY = Math.max(...rects.map(r => r.y + r.h))

  let allPts, labelPos

  if (side === 'top' || side === 'bottom') {
    // Horizontal bracket
    const y = side === 'top' ? minY - 14 : maxY + 14
    const bump = side === 'top' ? -16 : 16
    const midX = (minX + maxX) / 2

    const leftPts = sampleBezier(
      { x: minX - 10, y },
      { x: minX - 10, y: y + bump },
      { x: midX, y: y + bump },
      12
    )
    const rightPts = sampleBezier(
      { x: midX, y: y + bump },
      { x: maxX + 10, y: y + bump },
      { x: maxX + 10, y },
      12
    )
    allPts = [...leftPts, ...rightPts.slice(1)]
    labelPos = [midX, y + bump * 2.2]
  } else {
    // Vertical bracket (left/right)
    const isRight = side === 'right'
    const edge = isRight ? maxX + 14 : minX - 14
    const bump = isRight ? 16 : -16
    const midY = (minY + maxY) / 2

    const topPts = sampleBezier(
      { x: edge, y: minY - 10 },
      { x: edge + bump, y: minY - 10 },
      { x: edge + bump, y: midY },
      12
    )
    const botPts = sampleBezier(
      { x: edge + bump, y: midY },
      { x: edge + bump, y: maxY + 10 },
      { x: edge, y: maxY + 10 },
      12
    )
    allPts = [...topPts, ...botPts.slice(1)]
    labelPos = [edge + bump * 2.2, midY + 5]
  }

  const outline = pathToFreehand(allPts, SIZE)
  return { outline, labelPos }
}
</script>

<style scoped>
.sketch-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 200;
  overflow: visible;
}
.sk-text {
  font-family: 'Shantell Sans', 'Caveat', cursive;
  font-weight: 400;
}
</style>
