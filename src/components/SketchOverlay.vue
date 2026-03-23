<template>
  <div v-if="sketchEnabled" style="position: absolute; inset: 0; pointer-events: none;">
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
        class="sk-draw-path"
      />
      <path
        :d="arrowData(sk).headOutline"
        :fill="sk.color || sketchColor"
        stroke="none"
        class="sk-draw-path"
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
        class="sk-draw-path"
      />
    </template>

    <!-- Circle / ellipse -->
    <template v-else-if="sk.type === 'circle' && circleStrokePath(sk)">
      <path
        :d="circleStrokePath(sk)"
        fill="none"
        :stroke="sk.color || sketchColor"
        :stroke-width="SIZE"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="sk-stroke-draw"
        :style="{ '--path-len': circlePathLen(sk) }"
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
        class="sk-draw-path"
      />
    </template>

    <!-- Bracket -->
    <template v-else-if="sk.type === 'bracket' && bracketData(sk)">
      <path
        :d="bracketData(sk).outline"
        :fill="sk.color || sketchColor"
        stroke="none"
        class="sk-draw-path"
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSketchStore } from '../stores/sketch.js'
import { useCanvasStore } from '../stores/canvas.js'
import { useConfigStore } from '../stores/config.js'

const sketchStore = useSketchStore()
const canvasStore = useCanvasStore()
const configStore = useConfigStore()
const { sketches } = storeToRefs(sketchStore)
const { cards } = storeToRefs(canvasStore)
const { sketchEnabled, sketchFont } = storeToRefs(configStore)

const fontFamily = computed(() => {
  const fonts = {
    ChenYuluoyan: "'ChenYuluoyan', 'Shantell Sans', cursive",
    Yozai: "'Yozai', 'Shantell Sans', cursive",
    LXGWWenKai: "'LXGW WenKai', 'Shantell Sans', cursive",
  }
  return fonts[sketchFont.value] || fonts.Yozai
})

const sketchColor = '#e8a849'
const SIZE = 5.5

// Track card positions reactively (used as dependency in template via data-card-pos)
const cardPositionVersion = computed(() => {
  let v = 0
  cards.value.forEach(c => { v += (c.x || 0) + (c.y || 0) + (c.z || 0) })
  return v
})

const width = ref(window.innerWidth)
const height = ref(window.innerHeight)

function onResize() {
  const canvas = document.querySelector('.canvas')
  if (canvas) {
    width.value = canvas.offsetWidth || window.innerWidth
    height.value = canvas.offsetHeight || window.innerHeight
  } else {
    width.value = window.innerWidth
    height.value = window.innerHeight
  }
}
onMounted(() => {
  window.addEventListener('resize', onResize)
  const canvas = document.querySelector('.canvas')
  if (canvas) {
    width.value = canvas.offsetWidth || window.innerWidth
    height.value = canvas.offsetHeight || window.innerHeight
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  observer?.disconnect()
  cancelAnimationFrame(measureRaf)
})

// ═══════════════════════════════════════════════
// Per-sketch Z: match the associated card's translateZ
// ═══════════════════════════════════════════════

function layerStyle(sk) {
  // Inside preserve-3d: match associated card's translateZ so sketch
  // participates in 3D z-ordering with cards.
  // Sketch renders slightly behind its card (-1px) so hover/select
  // brings the card above the sketch, but sketch still covers cards behind it.
  const z = getSketchZ(sk)
  return {
    transform: `translateZ(${z}px)`,
    transformStyle: 'preserve-3d',
  }
}

function getSketchZ(sk) {
  // Sketches render ABOVE all normal cards but below hover/selected
  // Normal cards: intraZ up to ~150. Hover: 200. Selected: 250.
  // Sketch at 180 = always visible, but hover/select still brings card on top
  return 180
}

function findCardByKey(key) {
  if (!key) return null
  const target = key.toLowerCase()
  let found = null
  cards.value.forEach(card => {
    const cardKey = (card.data?.key || '').toLowerCase()
    if (cardKey === target) found = card
  })
  return found
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
// Card geometry — getBoundingClientRect relative to .canvas
// SVG is outside 3D space, so we read projected screen coordinates
// which include perspective transforms. Reactive via cardPositionVersion.
// ═══════════════════════════════════════════════

// Cache measured dimensions by key (content-dependent, not in store)
const measuredDims = reactive({})

function measureDims() {
  const canvas = document.querySelector('.canvas')
  if (!canvas) return
  const cr = canvas.getBoundingClientRect()
  document.querySelectorAll('[data-block-key]').forEach(el => {
    const key = el.dataset.blockKey
    if (!key) return
    const er = el.getBoundingClientRect()
    measuredDims[key] = {
      x: er.left - cr.left, y: er.top - cr.top,
      w: er.width, h: er.height,
    }
  })
  document.querySelectorAll('[data-content-key]').forEach(el => {
    const key = el.dataset.contentKey
    if (!key) return
    const er = el.getBoundingClientRect()
    measuredDims[key] = {
      x: er.left - cr.left, y: er.top - cr.top,
      w: er.width, h: er.height,
    }
  })
}

// Measure after layout changes — MutationObserver for reliable detection
let measureRaf = 0
function scheduleMeasure() {
  cancelAnimationFrame(measureRaf)
  measureRaf = requestAnimationFrame(measureDims)
}

let observer = null
onMounted(() => {
  measureDims()
  // MutationObserver catches card DOM creation/removal reliably
  const canvas = document.querySelector('.canvas')
  if (canvas) {
    observer = new MutationObserver(scheduleMeasure)
    observer.observe(canvas, { childList: true, subtree: true })
  }
  // Also re-measure when card positions change (drag, animation)
  // Debounced — skip if we'll measure again next frame anyway
  watch(cardPositionVersion, scheduleMeasure)

  // Navigation (restoreFrom) replaces card positions — clear cache and re-measure
  // after CSS transitions complete (not a hardcoded delay)
  watch(() => [...cards.value.keys()].join(','), () => {
    // Clear stale positions immediately
    for (const key of Object.keys(measuredDims)) {
      delete measuredDims[key]
    }
    // Listen for transitionend on the canvas to re-measure when cards settle
    const canvas = document.querySelector('.canvas-space')
    if (canvas) {
      const onSettle = () => {
        canvas.removeEventListener('transitionend', onSettle)
        measureDims()
      }
      canvas.addEventListener('transitionend', onSettle)
    }
    // Fallback: also schedule an immediate measure for cards without transitions
    scheduleMeasure()
  })
})

function cardRect(key) {
  // Data-source-first: use store position (immune to CSS transition lag)
  // with DOM-measured dimensions for accurate sizing
  let storeCard = null
  cards.value.forEach(c => {
    if (c.contentKey === key || c.data?.key === key) storeCard = c
  })
  if (storeCard) {
    const dims = measuredDims[key]
    const x = pctX(storeCard.x)
    const y = pctY(storeCard.y)
    const w = dims?.w > 0 ? dims.w : (storeCard.w ? pctX(storeCard.w) : 200)
    const h = dims?.h > 0 ? dims.h : 130
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }
  }

  // No store entry — fall back to measured DOM position
  const dims = measuredDims[key]
  if (dims && dims.w > 0) {
    return {
      x: dims.x, y: dims.y, w: dims.w, h: dims.h,
      cx: dims.x + dims.w / 2, cy: dims.y + dims.h / 2,
    }
  }

  // Last resort — direct DOM read (new card not yet measured)
  const canvas = document.querySelector('.canvas')
  const el = document.querySelector(`[data-block-key="${key}"]`)
    || document.querySelector(`[data-content-key="${key}"]`)
  if (el && canvas) {
    const cr = canvas.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    const r = {
      x: er.left - cr.left, y: er.top - cr.top,
      w: er.width, h: er.height,
    }
    measuredDims[key] = r
    return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
  }

  return null
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

  const curvature = Math.max(len * 0.4, 50)
  const nx = -dy / len, ny = dx / len
  // Choose curve direction: bend away from canvas center for cleaner routing
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2
  const centerX = width.value / 2, centerY = height.value / 2
  const awayDot = (midX - centerX) * nx + (midY - centerY) * ny
  const sign = awayDot >= 0 ? 1 : -1
  const cpx = midX + nx * curvature * sign
  const cpy = midY + ny * curvature * sign

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

// ═══════════════════════════════════════════════
// Circle: stroke mode with dasharray draw animation
// ═══════════════════════════════════════════════

function circleGeometry(sk) {
  let cx, cy, rx, ry
  if (sk.target) {
    const r = cardRect(sk.target)
    if (!r) return null
    cx = r.cx; cy = r.cy
    let rawRx = r.w / 2 + 20, rawRy = r.h / 2 + 16
    const ratio = rawRx / rawRy
    if (ratio > 1.8) rawRy = rawRx / 1.8
    if (ratio < 0.55) rawRx = rawRy * 0.55
    rx = rawRx; ry = rawRy
  } else if (sk.cx != null) {
    cx = pctX(sk.cx); cy = pctY(sk.cy)
    rx = pctX(sk.r || 5); ry = pctY(sk.r || 5)
  } else return null

  const seed = (sk.target || sk.id || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const steps = 72
  const gapSign = (seed % 3 === 0) ? -1 : 1
  const gapSize = (0.008 + (seed % 3) * 0.005) * Math.PI * 2
  const totalAngle = Math.PI * 2 - gapSign * gapSize

  const rawPts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * totalAngle
    const d1 = 0.03 * Math.sin(t * (2 + seed % 2) + seed * 0.3)
    const d2 = 0.015 * Math.sin(t * (3 + seed % 2) + seed * 1.7)
    
    const shape = 1 + d1 + d2
    rawPts.push({ x: cx + rx * shape * Math.cos(t), y: cy + ry * shape * Math.sin(t) })
  }

  // Catmull-Rom smooth
  const smooth = []
  for (let i = 0; i < rawPts.length - 1; i++) {
    const p0 = rawPts[Math.max(0, i - 1)]
    const p1 = rawPts[i]
    const p2 = rawPts[i + 1]
    const p3 = rawPts[Math.min(rawPts.length - 1, i + 2)]
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

  // Compute path length
  let len = 0
  for (let i = 1; i < smooth.length; i++) {
    const dx = smooth[i].x - smooth[i-1].x, dy = smooth[i].y - smooth[i-1].y
    len += Math.sqrt(dx*dx + dy*dy)
  }

  return { pts: smooth, len }
}

function circleStrokePath(sk) {
  const geo = circleGeometry(sk)
  if (!geo) return null
  let d = `M ${geo.pts[0].x} ${geo.pts[0].y}`
  for (let i = 1; i < geo.pts.length; i++) {
    d += ` L ${geo.pts[i].x} ${geo.pts[i].y}`
  }
  return d
}

function circlePathLen(sk) {
  const geo = circleGeometry(sk)
  return geo ? geo.len : 1000
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
  animation: sketch-draw-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.sketch-layer:nth-child(2) { animation-delay: 0.15s; }
.sketch-layer:nth-child(3) { animation-delay: 0.3s; }
.sketch-layer:nth-child(4) { animation-delay: 0.45s; }
.sketch-layer:nth-child(5) { animation-delay: 0.6s; }
.sketch-layer:nth-child(6) { animation-delay: 0.75s; }

@keyframes sketch-draw-in {
  0% {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  100% {
    opacity: 1;
    clip-path: inset(0 0 0 0);
  }
}

/* Stroke-based draw animation (circle, etc.) — draws along the path */
.sk-stroke-draw {
  stroke-dasharray: var(--path-len);
  stroke-dashoffset: var(--path-len);
  animation: stroke-draw 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes stroke-draw {
  0% {
    stroke-dashoffset: var(--path-len);
    opacity: 0.3;
  }
  10% { opacity: 1; }
  100% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
.sk-text {
  font-family: v-bind('fontFamily');
  font-weight: 400;
}
</style>
