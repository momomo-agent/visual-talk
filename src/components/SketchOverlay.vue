<template>
  <!--
    Each sketch element gets its own mini-SVG with the same translateZ
    as its associated card(s). This eliminates perspective parallax
    because sketch and card are on the same Z plane.
  -->
  <svg
    v-for="[id, sk] in sketches"
    :key="id"
    class="sketch-layer"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    :style="layerStyle(sk)"
    :data-card-pos="cardPositionVersion"
  >
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

const sketchColor = '#e8a849'
const SIZE = 5.5

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

// ═══════════════════════════════════════════════
// Per-sketch Z: match the associated card's translateZ
// ═══════════════════════════════════════════════

function cardZ(key) {
  let found = null
  cards.value.forEach(c => {
    if (c.contentKey === key || c.data?.key === key) found = c
  })
  return found ? (found.z || 0) : 0
}

function sketchZ(sk) {
  // Get the Z of associated card(s), add 1 to float just above
  if (sk.type === 'circle' || sk.type === 'underline') {
    return cardZ(sk.target) + 1
  }
  if (sk.type === 'arrow') {
    const z1 = cardZ(sk.from)
    const z2 = cardZ(sk.to)
    return Math.max(z1, z2) + 1
  }
  if (sk.type === 'bracket') {
    if (!sk.targets?.length) return 1
    const zs = sk.targets.map(cardZ)
    return Math.max(...zs) + 1
  }
  if (sk.type === 'label' && sk.target) {
    return cardZ(sk.target) + 1
  }
  // Fallback: above everything
  let maxZ = 0
  cards.value.forEach(c => { if ((c.z || 0) > maxZ) maxZ = c.z })
  return maxZ + 1
}

function layerStyle(sk) {
  const z = sketchZ(sk)
  return {
    transform: `translateZ(${z}px)`,
  }
}

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

function getOutline(strokePoints, closed = false) {
  if (strokePoints.length < 2) return ''
  
  const n = strokePoints.length
  const leftPts = []
  const rightPts = []

  for (let i = 0; i < n; i++) {
    const pt = strokePoints[i]
    const prev = closed
      ? strokePoints[(i - 1 + n) % n]
      : strokePoints[Math.max(0, i - 1)]
    const next = closed
      ? strokePoints[(i + 1) % n]
      : strokePoints[Math.min(n - 1, i + 1)]
    
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) { dx /= len; dy /= len }
    
    const px = -dy * pt.radius
    const py = dx * pt.radius
    
    leftPts.push({ x: pt.x - px, y: pt.y - py })
    rightPts.push({ x: pt.x + px, y: pt.y + py })
  }

  let d
  if (closed) {
    d = `M${f(leftPts[0].x)},${f(leftPts[0].y)}`
    for (let i = 1; i < leftPts.length; i++) {
      d += `L${f(leftPts[i].x)},${f(leftPts[i].y)}`
    }
    d += 'Z'
    d += `M${f(rightPts[0].x)},${f(rightPts[0].y)}`
    for (let i = rightPts.length - 1; i >= 0; i--) {
      d += `L${f(rightPts[i].x)},${f(rightPts[i].y)}`
    }
    d += 'Z'
  } else {
    d = `M${f(leftPts[0].x)},${f(leftPts[0].y)}`
    for (let i = 1; i < leftPts.length; i++) {
      d += `L${f(leftPts[i].x)},${f(leftPts[i].y)}`
    }
    const last = strokePoints[n - 1]
    const first = strokePoints[0]
    const endR = last.radius
    d += `A${f(endR)},${f(endR)} 0 0 1 ${f(rightPts[n-1].x)},${f(rightPts[n-1].y)}`
    for (let i = n - 2; i >= 0; i--) {
      d += `L${f(rightPts[i].x)},${f(rightPts[i].y)}`
    }
    const startR = first.radius
    d += `A${f(startR)},${f(startR)} 0 0 1 ${f(leftPts[0].x)},${f(leftPts[0].y)}`
    d += 'Z'
  }
  return d
}

function pathToFreehand(pathPoints, size = SIZE, closed = false) {
  if (pathPoints.length < 2) return ''
  const stroked = simulatePressure(pathPoints, size)
  return getOutline(stroked, closed)
}

function pathToFreehandClosed(pathPoints, size = SIZE) {
  if (pathPoints.length < 2) return ''
  const radius = size * 0.5
  const n = pathPoints.length
  const pts = pathPoints.map((pt, i) => {
    // Simulate a real pen stroke around a circle:
    // - Starts thin (pen just touched down)
    // - Gets confident/thick in the middle
    // - Thins again near closure (lifting off)
    const progress = i / n
    const strokeEnvelope = Math.sin(progress * Math.PI) // 0→1→0 arc
    const thickRadius = radius * (0.6 + 0.8 * strokeEnvelope) // thin at ends, thick in middle
    const jitter = Math.sin(i * 7.3 + i * i * 0.01) * 0.5
    return { ...pt, radius: Math.max(0.5, thickRadius + jitter), pressure: 0.5 }
  })
  return getOutline(pts, true)
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

  const pathPoints = sampleBezier(p1, { x: cpx, y: cpy }, p2, 32)
  const outline = pathToFreehand(pathPoints, SIZE)

  const adx = p2.x - cpx, ady = p2.y - cpy
  const al = Math.sqrt(adx * adx + ady * ady)
  const ax = adx / al, ay = ady / al
  const headLen = Math.max(Math.min(len / 5, SIZE * 4), SIZE * 1.5)
  const angle = Math.PI / 6
  const cos = Math.cos(angle), sin = Math.sin(angle)
  
  const lx = p2.x - headLen * (ax * cos + ay * sin)
  const ly = p2.y - headLen * (ay * cos - ax * sin)
  const rx = p2.x - headLen * (ax * cos - ay * sin)
  const ry = p2.y - headLen * (ay * cos + ax * sin)
  
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
    // Limit aspect ratio to prevent pointy ends on very wide/flat cards
    let rawRx = r.w / 2 + 20, rawRy = r.h / 2 + 16
    const ratio = rawRx / rawRy
    if (ratio > 1.8) rawRy = rawRx / 1.8 // don't let it get too flat
    if (ratio < 0.55) rawRx = rawRy * 0.55 // don't let it get too tall
    rx = rawRx; ry = rawRy
  } else if (sk.cx != null) {
    cx = pctX(sk.cx); cy = pctY(sk.cy)
    rx = pctX(sk.r || 5); ry = pctY(sk.r || 5)
  } else return null

  // Smooth hand-drawn circle: gentle shape variation, NO jitter/wobble.
  // Like a confident single pen stroke — smooth but not mathematically perfect.

  const seed = (sk.target || sk.id || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0)

  const steps = 72
  // Tiny gap or slight overlap — feels hand-drawn but nearly closed
  const gapSign = (seed % 3 === 0) ? -1 : 1 // sometimes overlap, sometimes gap
  const gapSize = (0.008 + (seed % 3) * 0.005) * Math.PI * 2 // ~3-8°
  const totalAngle = Math.PI * 2 - gapSign * gapSize

  // Multiple layers of smooth distortion — each circle looks unique
  const rawPts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * totalAngle
    // Layer 1: broad shape (2-3 lobes) — gentle overall asymmetry
    const d1 = 0.03 * Math.sin(t * (2 + seed % 2) + seed * 0.3)
    // Layer 2: medium detail (3-4 lobes) — subtle character
    const d2 = 0.015 * Math.sin(t * (3 + seed % 2) + seed * 1.7)
    
    const shape = 1 + d1 + d2
    rawPts.push({
      x: cx + rx * shape * Math.cos(t),
      y: cy + ry * shape * Math.sin(t),
    })
  }

  // Upsample with Catmull-Rom for silky smooth curves before freehand
  const smooth = []
  for (let i = 0; i < rawPts.length - 1; i++) {
    const p0 = rawPts[Math.max(0, i - 1)]
    const p1 = rawPts[i]
    const p2 = rawPts[i + 1]
    const p3 = rawPts[Math.min(rawPts.length - 1, i + 2)]
    // 3 sub-samples per segment
    for (let s = 0; s < 3; s++) {
      const t = s / 3
      const t2 = t * t, t3 = t2 * t
      smooth.push({
        x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
        y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
      })
    }
  }
  smooth.push(rawPts[rawPts.length - 1])

  // Open freehand path — tldraw-style filled polygon
  return pathToFreehand(smooth, SIZE, false)
}



// ═══════════════════════════════════════════════
// Label
// ═══════════════════════════════════════════════

function labelPos(sk) {
  if (sk.target) {
    const r = cardRect(sk.target)
    if (r) {
      const offsetX = sk.offsetX || 0
      const offsetY = sk.offsetY || -20
      return [r.cx + offsetX, r.y + offsetY]
    }
  }
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
.sketch-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}
.sk-text {
  font-family: 'Shantell Sans', 'Caveat', cursive;
  font-weight: 400;
}
</style>
