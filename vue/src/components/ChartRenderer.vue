<template>
  <div>
    <!-- Pie / Donut -->
    <template v-if="chartType === 'pie' || chartType === 'donut'">
      <svg viewBox="0 0 140 140" style="width:100%;max-height:140px" v-html="pieSlices"></svg>
      <div style="display:flex;flex-wrap:wrap;gap:4px 12px;padding-top:6px" v-html="pieLegend"></div>
    </template>

    <!-- Line -->
    <template v-else-if="chartType === 'line'">
      <svg :viewBox="`0 0 ${lineW} ${lineH}`" style="width:100%" v-html="lineSvg"></svg>
      <div style="display:flex;gap:0;padding:2px 0 0" v-html="lineLabelsHtml"></div>
      <div v-if="isMulti" style="display:flex;flex-wrap:wrap;gap:4px 12px;padding-top:4px" v-html="lineLegend"></div>
    </template>

    <!-- Column -->
    <template v-else-if="chartType === 'column'">
      <template v-if="isMulti">
        <div style="display:flex;align-items:flex-end;gap:4px;height:160px;padding:8px 0">
          <div v-for="(label, li) in labels" :key="li" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;height:100%">
            <div style="flex:1;width:100%;display:flex;align-items:flex-end;gap:1px">
              <div
                v-for="(s, si) in series"
                :key="si"
                :style="{ flex: 1, height: barPct(s, li) + '%', background: colors[si % colors.length], borderRadius: '2px', minHeight: '2px', transition: 'height 0.6s' }"
                :title="`${esc(s.name || '')}: ${getVal(s, li)}`"
              ></div>
            </div>
            <span style="font-size:9px;color:#6a5a4a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">{{ label }}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px 12px;padding-top:4px" v-html="multiLegend"></div>
      </template>
      <template v-else-if="hasNeg">
        <div style="display:flex;gap:8px;height:160px;padding:8px 0">
          <div v-for="(d, i) in items" :key="i" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0;height:100%">
            <span :style="{ fontSize: '10px', color: '#8a7a60', order: parseFloat(d.value) < 0 ? 3 : undefined }">{{ d.value }}</span>
            <div style="flex:1;width:100%;display:flex;flex-direction:column;justify-content:center">
              <div :style="{ width: '100%', height: (parseFloat(d.value) >= 0 ? (Math.abs(parseFloat(d.value)||0)/absMax)*50 : 0)+'%', background: 'linear-gradient(180deg,#c8a96e,#8a7a60)', borderRadius: '3px 3px 0 0', minHeight: parseFloat(d.value) >= 0 ? '2px' : '0', transition: 'height 0.6s', alignSelf: 'flex-end' }"></div>
              <div style="width:100%;height:1px;background:rgba(138,122,96,0.3)"></div>
              <div :style="{ width: '100%', height: (parseFloat(d.value) < 0 ? (Math.abs(parseFloat(d.value)||0)/absMax)*50 : 0)+'%', background: 'linear-gradient(180deg,#e8856a,#c76a6a)', borderRadius: '0 0 3px 3px', minHeight: parseFloat(d.value) < 0 ? '2px' : '0', transition: 'height 0.6s' }"></div>
            </div>
            <span style="font-size:9px;color:#6a5a4a">{{ d.label || '' }}</span>
          </div>
        </div>
      </template>
      <template v-else>
        <div style="display:flex;align-items:flex-end;gap:8px;height:160px;padding:8px 0">
          <div v-for="(d, i) in items" :key="i" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;height:100%">
            <span style="font-size:10px;color:#8a7a60">{{ d.value }}</span>
            <div style="flex:1;width:100%;display:flex;align-items:flex-end">
              <div :style="{ width: '100%', height: ((parseFloat(d.value)||0)/absMax*100)+'%', background: 'linear-gradient(180deg,#c8a96e,#8a7a60)', borderRadius: '3px', minHeight: '4px', transition: 'height 0.6s' }"></div>
            </div>
            <span style="font-size:9px;color:#6a5a4a">{{ d.label || '' }}</span>
          </div>
        </div>
      </template>
    </template>

    <!-- Bar (horizontal) -->
    <template v-else>
      <template v-if="isMulti">
        <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
          <div v-for="(label, li) in labels" :key="li">
            <span style="font-size:11px;color:#6a5a4a">{{ label }}</span>
            <div style="display:flex;flex-direction:column;gap:2px;padding-top:2px">
              <div v-for="(s, si) in series" :key="si" style="display:flex;align-items:center;gap:4px">
                <div style="flex:1;height:12px;background:rgba(0,0,0,0.04);border-radius:2px;overflow:hidden">
                  <div :style="{ width: barPct(s, li)+'%', height: '100%', background: colors[si % colors.length], borderRadius: '2px', transition: 'width 0.6s' }"></div>
                </div>
                <span style="font-size:10px;color:#8a7a60;min-width:25px">{{ getVal(s, li) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px 12px;padding-top:4px" v-html="multiLegend"></div>
      </template>
      <template v-else>
        <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0">
          <div v-for="(d, i) in items" :key="i" style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:#6a5a4a;min-width:60px;text-align:right">{{ d.label || '' }}</span>
            <div style="flex:1;height:18px;background:rgba(0,0,0,0.06);border-radius:3px;overflow:hidden">
              <div :style="{ width: ((Math.abs(parseFloat(d.value)||0)/absMax)*100)+'%', height: '100%', background: parseFloat(d.value) < 0 ? 'linear-gradient(90deg,#e8856a,#c76a6a)' : 'linear-gradient(90deg,#c8a96e,#8a7a60)', borderRadius: '3px', transition: 'width 0.6s' }"></div>
            </div>
            <span style="font-size:11px;color:#8a7a60;min-width:35px">{{ d.value }}</span>
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

const colors = ['#c8a96e','#8a7a60','#e8856a','#6aad8e','#7a9ec8','#b87acc','#d4a85c','#5cb8b2','#c76a6a','#8aae5c']

const chartType = computed(() => props.data.chartType || 'bar')
const series = computed(() => props.data.series || (props.data.items?.length ? [{ name: '', items: props.data.items }] : []))
const items = computed(() => series.value[0]?.items || [])
const isMulti = computed(() => series.value.length > 1)
const labels = computed(() => items.value.map(d => d.label))

const allValues = computed(() => series.value.flatMap(s => (s.items || []).map(d => parseFloat(d.value) || 0)))
const absMax = computed(() => Math.max(...allValues.value.map(Math.abs), 1))
const hasNeg = computed(() => allValues.value.some(v => v < 0))

function esc(s) { return String(s || '') }
function getVal(s, li) { return parseFloat(s.items?.[li]?.value) || 0 }
function barPct(s, li) { return (Math.abs(getVal(s, li)) / absMax.value) * 100 }

// Multi-series legend HTML
const multiLegend = computed(() =>
  series.value.map((s, i) =>
    `<div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:${colors[i % colors.length]}"></span><span style="font-size:10px;color:#6a5a4a">${esc(s.name || '')}</span></div>`
  ).join('')
)

// Pie/Donut
const pieSlices = computed(() => {
  if (chartType.value !== 'pie' && chartType.value !== 'donut') return ''
  const total = items.value.reduce((s, d) => s + (parseFloat(d.value) || 0), 0) || 1
  const r = 55, cx = 70, cy = 70
  const innerR = chartType.value === 'donut' ? 30 : 0
  let cumAngle = -90

  if (items.value.length === 1) {
    if (innerR > 0) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[0]}" stroke-width="${r - innerR}" opacity="0.85"><title>${esc(items.value[0].label || '')}: ${items.value[0].value}</title></circle>`
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors[0]}" opacity="0.85"><title>${esc(items.value[0].label || '')}: ${items.value[0].value}</title></circle>`
  }

  return items.value.map((d, i) => {
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
    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(startRad), iy1 = cy + innerR * Math.sin(startRad)
      const ix2 = cx + innerR * Math.cos(endRad), iy2 = cy + innerR * Math.sin(endRad)
      return `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} L${ix2},${iy2} A${innerR},${innerR} 0 ${largeArc},0 ${ix1},${iy1}Z" fill="${colors[i % colors.length]}" opacity="0.85"><title>${esc(d.label || '')}: ${d.value}</title></path>`
    }
    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2}Z" fill="${colors[i % colors.length]}" opacity="0.85"><title>${esc(d.label || '')}: ${d.value}</title></path>`
  }).join('')
})

const pieLegend = computed(() =>
  items.value.map((d, i) =>
    `<div style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${colors[i % colors.length]};flex-shrink:0"></span><span style="font-size:11px;color:#6a5a4a">${esc(d.label || '')} ${d.value}</span></div>`
  ).join('')
)

// Line chart
const lineW = 280, lineH = 100, padL = 10, padR = 10, padT = 15, padB = 5
const pw = lineW - padL - padR, ph = lineH - padT - padB

const lineSvg = computed(() => {
  if (chartType.value !== 'line') return ''
  const gradId = 'ag' + Math.random().toString(36).slice(2, 8)
  const absM = Math.max(...allValues.value.map(Math.abs), 1)

  const defs = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c8a96e"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>`

  const lines = series.value.map((s, si) => {
    const sItems = s.items || []
    const pts = sItems.map((d, i) => {
      const x = padL + (sItems.length > 1 ? (i / (sItems.length - 1)) * pw : pw / 2)
      const y = padT + ph - ((parseFloat(d.value) || 0) / absM) * ph
      return { x, y, value: d.value }
    })
    const color = colors[si % colors.length]
    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
    const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"><title>${esc(s.name || '')}: ${p.value}</title></circle>`).join('')
    const valLabels = isMulti.value ? '' : pts.map(p => `<text x="${p.x}" y="${p.y - 6}" text-anchor="middle" font-size="8" fill="#8a7a60">${p.value}</text>`).join('')
    const area = !isMulti.value ? `<polyline points="${padL},${padT + ph} ${polyline} ${padL + pw},${padT + ph}" fill="url(#${gradId})" opacity="0.15"/>` : ''
    return `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${area}${dots}${valLabels}`
  }).join('')

  return defs + lines
})

const lineLabelsHtml = computed(() =>
  labels.value.map(l =>
    `<span style="flex:1;text-align:center;font-size:9px;color:#6a5a4a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l || '')}</span>`
  ).join('')
)

const lineLegend = computed(() =>
  series.value.map((s, i) =>
    `<div style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:2px;background:${colors[i % colors.length]};border-radius:1px"></span><span style="font-size:10px;color:#6a5a4a">${esc(s.name || '')}</span></div>`
  ).join('')
)
</script>
