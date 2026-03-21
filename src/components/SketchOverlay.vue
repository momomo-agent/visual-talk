<template>
  <svg
    class="sketch-overlay"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
  >
    <g v-for="[id, sk] in sketches" :key="id" :style="{ color: sk.color || sketchColor }">
      <!-- Arrow between cards -->
      <template v-if="sk.type === 'arrow' && arrowData(sk)">
        <path
          :d="arrowData(sk).path"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || strokeW"
          stroke-linecap="round"
        />
        <!-- Open V arrowhead -->
        <path
          :d="arrowData(sk).head"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || strokeW"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          v-if="sk.label && arrowData(sk).labelPos"
          :x="arrowData(sk).labelPos[0]"
          :y="arrowData(sk).labelPos[1]"
          fill="currentColor"
          font-size="14"
          text-anchor="middle"
          class="sk-text"
        >{{ sk.label }}</text>
      </template>

      <!-- Free-form line -->
      <template v-else-if="sk.type === 'line' && sk.points?.length >= 2">
        <path
          :d="lineD(sk)"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || strokeW"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </template>

      <!-- Circle / ellipse -->
      <template v-else-if="sk.type === 'circle' && circleD(sk)">
        <path
          :d="circleD(sk)"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || strokeW"
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
      <template v-else-if="sk.type === 'underline' && underD(sk)">
        <path
          :d="underD(sk)"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || strokeW"
          stroke-linecap="round"
        />
      </template>

      <!-- Bracket -->
      <template v-else-if="sk.type === 'bracket' && bracketData(sk)">
        <path
          :d="bracketData(sk).path"
          fill="none"
          stroke="currentColor"
          :stroke-width="sk.width || strokeW"
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

const sketchColor = '#d4930d'  // warm orange like tldraw
const strokeW = 2

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

// Point on card edge toward a target
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

function f(n) { return n.toFixed(1) }

// --- Arrow (tldraw style: big natural arc) ---
function arrowData(sk) {
  const fromR = cardRect(sk.from)
  const toR = cardRect(sk.to)
  if (!fromR || !toR) return null

  const p1 = edgePoint(fromR, toR.cx, toR.cy)
  const p2 = edgePoint(toR, fromR.cx, fromR.cy)

  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return null

  // Big swooping arc — perpendicular offset proportional to distance
  const curvature = Math.max(len * 0.25, 30)
  const nx = -dy / len, ny = dx / len  // perpendicular
  const cpx = (p1.x + p2.x) / 2 + nx * curvature
  const cpy = (p1.y + p2.y) / 2 + ny * curvature

  const path = `M${f(p1.x)},${f(p1.y)} Q${f(cpx)},${f(cpy)} ${f(p2.x)},${f(p2.y)}`

  // Open V arrowhead at p2 (tldraw: PI/6 = 30°, length = clamp(totalLen/5, sw, sw*3))
  const adx = p2.x - cpx, ady = p2.y - cpy
  const al = Math.sqrt(adx * adx + ady * ady)
  const ax = adx / al, ay = ady / al
  const headLen = Math.max(Math.min(len / 5, strokeW * 3), strokeW)
  const headAngle = Math.PI / 6  // 30 degrees, same as tldraw
  const cos = Math.cos(headAngle), sin = Math.sin(headAngle)
  const lx = p2.x - headLen * (ax * cos + ay * sin)
  const ly = p2.y - headLen * (ay * cos - ax * sin)
  const rx = p2.x - headLen * (ax * cos - ay * sin)
  const ry = p2.y - headLen * (ay * cos + ax * sin)
  const head = `M${f(lx)},${f(ly)} L${f(p2.x)},${f(p2.y)} L${f(rx)},${f(ry)}`

  // Label position: near the control point
  const labelPos = [cpx, cpy - 6]

  return { path, head, labelPos }
}

// --- Free line (smooth through points) ---
function lineD(sk) {
  const pts = sk.points.map(([x, y]) => [pctX(x), pctY(y)])
  if (pts.length < 2) return ''
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 1; i < pts.length; i++) {
    if (i < pts.length - 1) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      d += ` Q${f(pts[i][0])},${f(pts[i][1])} ${f(mx)},${f(my)}`
    } else {
      d += ` L${f(pts[i][0])},${f(pts[i][1])}`
    }
  }
  return d
}

// --- Circle (organic ellipse, single path) ---
function circleD(sk) {
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

  // Single smooth ellipse with slight organic variation
  const k = 0.5522848
  return `M${f(cx)},${f(cy - ry)} `
    + `C${f(cx + rx * k)},${f(cy - ry)} ${f(cx + rx)},${f(cy - ry * k)} ${f(cx + rx)},${f(cy)} `
    + `C${f(cx + rx)},${f(cy + ry * k)} ${f(cx + rx * k)},${f(cy + ry)} ${f(cx)},${f(cy + ry)} `
    + `C${f(cx - rx * k)},${f(cy + ry)} ${f(cx - rx)},${f(cy + ry * k)} ${f(cx - rx)},${f(cy)} `
    + `C${f(cx - rx)},${f(cy - ry * k)} ${f(cx - rx * k)},${f(cy - ry)} ${f(cx)},${f(cy - ry)}Z`
}

// --- Underline (gentle wave) ---
function underD(sk) {
  const r = cardRect(sk.target)
  if (!r) return null
  const y = r.y + r.h + 6
  const x1 = r.x + 6, x2 = r.x + r.w - 6
  const mid = (x1 + x2) / 2
  return `M${f(x1)},${f(y)} Q${f(mid)},${f(y + 4)} ${f(x2)},${f(y)}`
}

// --- Bracket ---
function bracketData(sk) {
  if (!sk.targets?.length) return null
  const rects = sk.targets.map(cardRect).filter(Boolean)
  if (!rects.length) return null

  const right = sk.side === 'right'
  const minY = Math.min(...rects.map(r => r.y)) - 10
  const maxY = Math.max(...rects.map(r => r.y + r.h)) + 10
  const edge = right
    ? Math.max(...rects.map(r => r.x + r.w)) + 14
    : Math.min(...rects.map(r => r.x)) - 14
  const bump = right ? 16 : -16
  const midY = (minY + maxY) / 2

  const path = `M${f(edge)},${f(minY)} Q${f(edge + bump)},${f(minY)} ${f(edge + bump)},${f(midY)} Q${f(edge + bump)},${f(maxY)} ${f(edge)},${f(maxY)}`
  const labelPos = [edge + bump * 2.2, midY + 5]
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
  font-family: 'Shantell Sans', 'Caveat', cursive;
  font-weight: 400;
}
</style>
