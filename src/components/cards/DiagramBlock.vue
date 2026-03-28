<template>
  <div class="win-body diagram-block">
    <h2 v-if="data.title">{{ data.title }}</h2>
    <div ref="mermaidEl" class="mermaid-container" v-html="svgContent"></div>
    <p v-if="data.footer" class="footer">{{ data.footer }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, shallowRef } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const svgContent = ref('')
const mermaidEl = ref(null)
const mermaidModule = shallowRef(null)

let idCounter = 0

async function loadMermaid() {
  if (mermaidModule.value) return mermaidModule.value
  const { default: mermaid } = await import('mermaid')

  // Read theme colors from CSS variables
  const cs = getComputedStyle(document.documentElement)
  const c1 = cs.getPropertyValue('--chart-color-1').trim() || '#c8a96e'
  const c2 = cs.getPropertyValue('--chart-color-2').trim() || '#8a7a60'
  const label = cs.getPropertyValue('--chart-label').trim() || '#6a5a4a'
  const cellColor = cs.getPropertyValue('--table-cell-color').trim() || '#5a4a38'
  const headerColor = cs.getPropertyValue('--table-header-color').trim() || '#3a2a18'

  // Use solid colors instead of color-mix (Mermaid doesn't support it well)
  const bgLight = '#f5f1ed'
  const bgLighter = '#faf8f6'
  const borderMid = '#d4c4b0'

  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
    primaryColor: bgLight,
    primaryTextColor: headerColor,
    primaryBorderColor: c1,
    secondaryColor: bgLighter,
    secondaryTextColor: cellColor,
    secondaryBorderColor: borderMid,
    tertiaryColor: bgLighter,
    tertiaryTextColor: headerColor,
    tertiaryBorderColor: c2,
    lineColor: c1,
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: '13px',
    nodeBorder: c1,
    mainBkg: bgLight,
    clusterBkg: bgLighter,
    clusterBorder: borderMid,
    actorBorder: c1,
    actorBkg: bgLight,
    actorTextColor: headerColor,
    signalColor: c1,
    signalTextColor: headerColor,
    labelBoxBkgColor: bgLighter,
    labelBoxBorderColor: borderMid,
    labelTextColor: headerColor,
    noteBkgColor: bgLight,
    noteBorderColor: c1,
    noteTextColor: headerColor,
    edgeLabelBackground: `color-mix(in srgb, ${c1} 8%, white 92%)`,
    crit0: '#ef8f6e',
    done0: '#7ec8a4',
    active0: '#8bacd4',
  },
  flowchart: { curve: 'basis', padding: 12 },
  sequence: { mirrorActors: false },
})
  mermaidModule.value = mermaid
  return mermaid
}

async function renderDiagram() {
  const code = props.data.code
  if (!code) return

  try {
    const mermaid = await loadMermaid()
    const id = `mermaid-${Date.now()}-${idCounter++}`
    const { svg } = await mermaid.render(id, code)
    svgContent.value = svg
  } catch (e) {
    console.warn('Mermaid render failed:', e)
    svgContent.value = `<pre style="color:#7a6a50;font-size:12px;white-space:pre-wrap">${code}</pre>`
  }
}

onMounted(renderDiagram)
watch(() => props.data.code, renderDiagram)
</script>

<style scoped>
.diagram-block {
  padding: 14px;
}
.mermaid-container {
  display: flex;
  justify-content: center;
  overflow: auto;
  max-height: 600px;
}
.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}
.footer {
  color: var(--chart-label, #7a6a50);
  font-size: 11px;
  margin: 8px 0 0;
  text-align: right;
}
</style>
