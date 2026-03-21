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
        <path
          :d="arrowData(sk).headOutline"
          :fill="sk.color || sketchColor"
          stroke="none"
        />
        <text
          v-if="sk.label && arrowData(sk).labelPos"
          :x="arrowData(sk).labelPos[0]"
          :y="arrowData(sk).labelPos[1]"
          :fill="sk.color || sketchColor"
          font-size="15"
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
      <template v-else-if="sk.type === 'label' && labelPos(sk)">
        <text
          :x="labelPos(sk)[0]"
          :y="labelPos(sk)[1]"
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
          font-size="15"
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
const SIZE = 5.5 // thicker for dark background visibility

// Track card positions reactively
const cardPositionVersion = computed(() => {
  let v = 0
  cards.value.forEach(c => { v += (c.x || 0) + (c.y || 0) })
  return v
})

const width = ref(window.innerWidth)
const height = ref(window.innerHeight)

function onResize() {
  width.value = window.innerWidth
  height.value = window.innerHeight
}
onMounted(() => {
  window.addEventListener('resize', onResize)
  const space = document.querySelector('.canvas-space')
  if (space) {
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

function sampleQuad(p0, cp, p1, t) {
  const it = 1 - t
  return {
    x: it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x,
    y: it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y,
  }
}

function sampleBezier(p0, cp, p1, steps = 24) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    let t = i / steps
    t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    pts.push(sampleQuad(p0, cp, p1, t))
  }
  return pts
}

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

function getOutline(strokePoints) {
  if (strokePoints.length < 2) return ''
  
  const leftPts = []
  const rightPts = []

  for (let i = 0; i < strokePoints.length; i++) {
    const pt = strokePoints[i]
    const prev = strokePoints[Math.max(0, i - 1)]
    const next = strokePoints[Math.min(strokePoints.length - 1, i + 1)]
    
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) { dx /= len; dy /= len }
    
    const px = -dy * pt.radius
    const py = dx * pt.radius
    
    leftPts.push({ x: pt.x - px, y: pt.y - py })
    rightPts.push({ x: pt.x + px, y: pt.y + py })
  }

  const last = strokePoints[strokePoints.length - 1]
  const first = strokePoints[0]
  
  let d = `M${f(leftPts[0].x)},${f(leftPts[0].y)}`
  for (let i = 1; i < leftPts.length; i++) {
    d += `L${f(leftPts[i].x)},${f(leftPts[i].y)}`
  }
  const endR = last.radius
  d += `A${f(endR)},${f(endR)} 0 0 1 ${f(rightPts[rightPts.length-1].x)},${f(rightPts[rightPts.length-1].y)}`
  for (let i = rightPts.length - 2; i >= 0; i--) {
    d += `L${f(rightPts[i].x)},${f(rightPts[i].y)}`
  }
  const startR = first.radius
  d += `A${f(startR)},${f(startR)} 0 0 1 ${f(leftPts[0].x)},${f(leftPts[0].y)}`
  d += 'Z'
  return d
}

function pathToFreehand(pathPoints, size = SIZE) {
  if (pathPoints.length < 2) return ''
  const stroked = simulatePressure(pathPoints, size)
  return getOutline(stroked)
}

// ═══════════════════════════════════════════════
// Card geometry — read actual DOM positions
// ═══════════════════════════════════════════════

function cardRect(key) {
  const el = document.querySelector(`[data-block-key="${key}"]`)
    || document.querySelector(`[data-content-key="${key}"]`)
  if (el) {
    const x = el.offsetLeft
    const y = el.offsetTop
    const w = el.offsetWidth
    const h = el.offsetHeight
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
  }
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
  const hw = rect.w / 2 + 8, hh = rect.h / 2 + 8
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

// ═══════════════════════════════════════════════
// Arrow — freehand body + freehand arrowhead
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

  const pathPoints = sampleBezier(p1, { x: cpx, y: cpy }, p2, 32)
  const outline = pathToFreehand(pathPoints, SIZE)

  // Freehand arrowhead — two short lines forming a V, rendered as filled polygons
  const adx = p2.x - cpx, ady = p2.y - cpy
  const al = Math.sqrt(adx * adx + ady * ady)
  const ax = adx / al, ay = ady / al
  const headLen = Math.max(Math.min(len / 5, SIZE * 4), SIZE * 1.5)
  const angle = Math.PI / 6
  const cos = Math.cos(angle), sin = Math.sin(angle)
  
  // Left prong
  const lx = p2.x - headLen * (ax * cos + ay * sin)
  const ly = p2.y - headLen * (ay * cos - ax * sin)
  // Right prong
  const rx = p2.x - headLen * (ax * cos - ay * sin)
  const ry = p2.y - headLen * (ay * cos + ax * sin)
  
  // Render each prong as a freehand line
  const leftPts = sampleBezier({ x: lx, y: ly }, { x: (lx + p2.x) / 2, y: (ly + p2.y) / 2 }, p2, 8)
  const rightPts = sampleBezier(p2, { x: (rx + p2.x) / 2, y: (ry + p2.y) / 2 }, { x: rx, y: ry }, 8)
  const headPts = [...leftPts, ...rightPts.slice(1)]
  const headOutline = pathToFreehand(headPts, SIZE * 0.8)

  const labelPos = [cpx, cpy - 10]

  return { outline, headOutline, labelPos }
}

// ═══════════════════════════════════════════════
// Free line
// ═══════════════════════════════════════════════

function freehandOutline(sk) {
  const pts = sk.points.map(([x, y]) => ({ x: pctX(x), y: pctY(y) }))
  if (pts.length < 2) return ''
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
    rx = r.w / 2 + 16; ry = r.h / 2 + 12
  } else if (sk.cx != null) {
    cx = pctX(sk.cx); cy = pctY(sk.cy)
    rx = pctX(sk.r || 5); ry = pctY(sk.r || 5)
  } else return null

  const steps = 48
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
  }
  return pathToFreehand(pts, SIZE)
}

// ═══════════════════════════════════════════════
// Label — supports both absolute % and relative-to-card positioning
// ═══════════════════════════════════════════════

function labelPos(sk) {
  // If label has a target card, position relative to it
  if (sk.target) {
    const r = cardRect(sk.target)
    if (r) {
      const offsetX = sk.offsetX || 0
      const offsetY = sk.offsetY || -20
      return [r.cx + offsetX, r.y + offsetY]
    }
  }
  // Absolute percentage positioning
  if (sk.x != null && sk.y != null) {
    return [pctX(sk.x), pctY(sk.y)]
  }
  return null
}

// ═══════════════════════════════════════════════
// Underline
// ═══════════════════════════════════════════════

function underOutline(sk) {
  const r = cardRect(sk.target)
  if (!r) return null
  const y = r.y + r.h + 8
  const x1 = r.x + 8, x2 = r.x + r.w - 8
  const mid = (x1 + x2) / 2
  const pts = sampleBezier({ x: x1, y }, { x: mid, y: y + 5 }, { x: x2, y }, 16)
  return pathToFreehand(pts, SIZE * 0.8)
}

// ═══════════════════════════════════════════════
// Bracket — supports top/bottom/left/right
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
    const y = side === 'top' ? minY - 16 : maxY + 16
    const bump = side === 'top' ? -18 : 18
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
    const isRight = side === 'right'
    const edge = isRight ? maxX + 16 : minX - 16
    const bump = isRight ? 18 : -18
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
