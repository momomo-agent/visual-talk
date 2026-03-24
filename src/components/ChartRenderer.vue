<template>
  <div>
    <!-- Pie / Donut -->
    <template v-if="chartType === 'pie' || chartType === 'donut'">
      <svg viewBox="0 0 140 140" style="width:100%;max-height:140px" v-html="pieSlices"></svg>
      <div class="chart-legend" v-html="pieLegend"></div>
    </template>

    <!-- Line -->
    <template v-else-if="chartType === 'line'">
      <svg :viewBox="`0 0 ${lineW} ${lineH}`" style="width:100%" v-html="lineSvg"></svg>
      <div class="chart-x-labels" v-html="lineLabelsHtml"></div>
      <div v-if="isMulti" class="chart-legend" v-html="lineLegend"></div>
    </template>

    <!-- Column -->
    <template v-else-if="chartType === 'column'">
      <template v-if="isMulti">
        <div class="chart-columns">
          <div v-for="(label, li) in labels" :key="li" class="chart-col-group">
            <div class="chart-col-bars">
              <div
                v-for="(s, si) in series"
                :key="si"
                class="chart-col-bar"
                :style="{ height: barPct(s, li) + '%', '--bar-color': chartColor(si) }"
                :title="`${esc(s.name || '')}: ${getVal(s, li)}`"
              ></div>
            </div>
            <span class="chart-col-label">{{ label }}</span>
          </div>
        </div>
        <div class="chart-legend" v-html="multiLegend"></div>
      </template>
      <template v-else-if="hasNeg">
        <div class="chart-columns">
          <div v-for="(d, i) in items" :key="i" class="chart-col-group">
            <span class="chart-col-value" :style="{ order: parseFloat(d.value) < 0 ? 3 : undefined }">{{ d.value }}</span>
            <div class="chart-col-neg-wrap">
              <div class="chart-col-bar chart-col-bar--pos" :style="{ height: (parseFloat(d.value) >= 0 ? (Math.abs(parseFloat(d.value)||0)/absMax)*50 : 0)+'%' }"></div>
              <div class="chart-axis-line"></div>
              <div class="chart-col-bar chart-col-bar--neg" :style="{ height: (parseFloat(d.value) < 0 ? (Math.abs(parseFloat(d.value)||0)/absMax)*50 : 0)+'%' }"></div>
            </div>
            <span class="chart-col-label">{{ d.label || '' }}</span>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="chart-columns">
          <div v-for="(d, i) in items" :key="i" class="chart-col-group">
            <span class="chart-col-value">{{ d.value }}</span>
            <div style="flex:1;width:100%;display:flex;align-items:flex-end">
              <div class="chart-col-bar chart-col-bar--single" :style="{ height: ((parseFloat(d.value)||0)/absMax*100)+'%' }"></div>
            </div>
            <span class="chart-col-label">{{ d.label || '' }}</span>
          </div>
        </div>
      </template>
    </template>

    <!-- Bar (horizontal) -->
    <template v-else>
      <template v-if="isMulti">
        <div class="chart-bars">
          <div v-for="(label, li) in labels" :key="li" class="chart-bar-group">
            <span class="chart-bar-label">{{ label }}</span>
            <div class="chart-bar-series">
              <div v-for="(s, si) in series" :key="si" class="chart-bar-row">
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" :style="{ width: barPct(s, li)+'%', '--bar-color': chartColor(si) }"></div>
                </div>
                <span class="chart-bar-value">{{ getVal(s, li) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="chart-legend" v-html="multiLegend"></div>
      </template>
      <template v-else>
        <div class="chart-bars">
          <div v-for="(d, i) in items" :key="i" class="chart-bar-row">
            <span class="chart-bar-label">{{ d.label || '' }}</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill" :class="{ 'chart-bar-fill--neg': parseFloat(d.value) < 0 }" :style="{ width: ((Math.abs(parseFloat(d.value)||0)/absMax)*100)+'%' }"></div>
            </div>
            <span class="chart-bar-value">{{ d.value }}</span>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const chartType = computed(() => props.data.chartType || props.data.type || 'bar')

function normalizeItems(raw) {
  if (!Array.isArray(raw) || !raw.length) return []
  if (typeof raw[0] === 'string') return raw.map(s => ({ label: String(s), value: 0 }))
  return raw.map(d => {
    if (typeof d !== 'object' || d === null) return { label: String(d), value: 0 }
    const label = d.label || d.name || d.title || d.country || d.category || ''
    let value = d.value ?? d.amount ?? d.total ?? d.gdp ?? d.count ?? d.score ?? d.num ?? 0
    value = parseFloat(value) || 0
    return { ...d, label, value }
  })
}

const series = computed(() => {
  if (props.data.series?.length) {
    return props.data.series.map(s => ({ ...s, items: normalizeItems(s.items || []) }))
  }
  const rawItems = props.data.items || props.data.data || props.data.values || props.data.bars || []
  const normalized = normalizeItems(rawItems)
  return normalized.length ? [{ name: '', items: normalized }] : []
})
const items = computed(() => series.value[0]?.items || [])
const isMulti = computed(() => series.value.length > 1)
const labels = computed(() => items.value.map(d => d.label || d.name || d.title || ''))

const allValues = computed(() => series.value.flatMap(s => (s.items || []).map(d => parseFloat(d.value) || 0)))
const absMax = computed(() => Math.max(...allValues.value.map(Math.abs), 1))
const hasNeg = computed(() => allValues.value.some(v => v < 0))

function esc(s) { return String(s || '') }
function getVal(s, li) { return parseFloat(s.items?.[li]?.value) || 0 }
function barPct(s, li) { return (Math.abs(getVal(s, li)) / absMax.value) * 100 }

// Get chart color by index — reads CSS variable at runtime
function chartColor(i) {
  const el = document.documentElement
  const varName = `--chart-color-${(i % 10) + 1}`
  return getComputedStyle(el).getPropertyValue(varName).trim() || ['#c8a96e','#8a7a60','#e8856a','#6aad8e','#7a9ec8','#b87acc','#d4a85c','#5cb8b2','#c76a6a','#8aae5c'][i % 10]
}

// For SVG we need resolved colors
function svgColor(i) { return chartColor(i) }

const multiLegend = computed(() => buildMultiLegend(series.value))
function buildMultiLegend(seriesData) {
  return seriesData.map((s, i) =>
    `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:${svgColor(i)}"></span><span>${esc(s.name || '')}</span></div>`
  ).join('')
}

// ── Pie / Donut ──
const pieSlices = computed(() => buildPieSlices(items.value, chartType.value))
const pieLegend = computed(() => buildPieLegend(items.value))

function buildPieSlices(itemsData, type) {
  if (type !== 'pie' && type !== 'donut') return ''
  const total = itemsData.reduce((s, d) => s + (parseFloat(d.value) || 0), 0) || 1
  const r = 55, cx = 70, cy = 70
  const innerR = type === 'donut' ? 30 : 0
  let cumAngle = -90

  if (itemsData.length === 1) {
    const c = svgColor(0)
    if (innerR > 0) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${r - innerR}" opacity="0.85"><title>${esc(itemsData[0].label || '')}: ${itemsData[0].value}</title></circle>`
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" opacity="0.85"><title>${esc(itemsData[0].label || '')}: ${itemsData[0].value}</title></circle>`
  }

  return itemsData.map((d, i) => {
    const val = parseFloat(d.value) || 0
    const angle = (val / total) * 360
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const largeArc = angle > 180 ? 1 : 0
    const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad)
    const c = svgColor(i)
    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(startRad), iy1 = cy + innerR * Math.sin(startRad)
      const ix2 = cx + innerR * Math.cos(endRad), iy2 = cy + innerR * Math.sin(endRad)
      return `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} L${ix2},${iy2} A${innerR},${innerR} 0 ${largeArc},0 ${ix1},${iy1}Z" fill="${c}" opacity="0.85"><title>${esc(d.label || '')}: ${d.value}</title></path>`
    }
    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2}Z" fill="${c}" opacity="0.85"><title>${esc(d.label || '')}: ${d.value}</title></path>`
  }).join('')
}

function buildPieLegend(itemsData) {
  return itemsData.map((d, i) =>
    `<div class="chart-legend-item"><span class="chart-legend-dot chart-legend-dot--round" style="background:${svgColor(i)}"></span><span>${esc(d.label || '')} ${d.value}</span></div>`
  ).join('')
}

// ── Line chart ──
const lineW = 280, lineH = 100, padL = 10, padR = 10, padT = 15, padB = 5
const pw = lineW - padL - padR, ph = lineH - padT - padB

const lineSvg = computed(() => buildLineSvg(series.value, allValues.value))
const lineLabelsHtml = computed(() => buildLineLabels(labels.value))
const lineLegend = computed(() => buildLineLegend(series.value))

function buildLineSvg(seriesData, allVals) {
  if (chartType.value !== 'line') return ''
  const gradId = 'ag' + Math.random().toString(36).slice(2, 8)
  const absM = Math.max(...allVals.map(Math.abs), 1)
  const c0 = svgColor(0)

  const defs = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c0}"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>`

  const lines = seriesData.map((s, si) => {
    const sItems = s.items || []
    const pts = sItems.map((d, i) => {
      const x = padL + (sItems.length > 1 ? (i / (sItems.length - 1)) * pw : pw / 2)
      const y = padT + ph - ((parseFloat(d.value) || 0) / absM) * ph
      return { x, y, value: d.value }
    })
    const color = svgColor(si)
    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
    const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"><title>${esc(s.name || '')}: ${p.value}</title></circle>`).join('')
    const valLabels = isMulti.value ? '' : pts.map(p => `<text x="${p.x}" y="${p.y - 6}" text-anchor="middle" font-size="8" fill="var(--chart-value,#8a7a60)">${p.value}</text>`).join('')
    const area = !isMulti.value ? `<polyline points="${padL},${padT + ph} ${polyline} ${padL + pw},${padT + ph}" fill="url(#${gradId})" opacity="0.15"/>` : ''
    return `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${area}${dots}${valLabels}`
  }).join('')

  return defs + lines
}

function buildLineLabels(labelsData) {
  return labelsData.map(l =>
    `<span class="chart-x-label">${esc(l || '')}</span>`
  ).join('')
}

function buildLineLegend(seriesData) {
  return seriesData.map((s, i) =>
    `<div class="chart-legend-item"><span class="chart-legend-line" style="background:${svgColor(i)}"></span><span>${esc(s.name || '')}</span></div>`
  ).join('')
}
</script>
