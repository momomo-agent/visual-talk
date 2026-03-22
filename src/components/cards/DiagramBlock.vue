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
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
    // Background & text
    primaryColor: '#f5ede0',
    primaryTextColor: '#4a3520',
    primaryBorderColor: '#c4a060',
    // Secondary
    secondaryColor: '#faf3e8',
    secondaryTextColor: '#5a4a38',
    secondaryBorderColor: '#d4b88a',
    // Tertiary
    tertiaryColor: '#f0e8d8',
    tertiaryTextColor: '#4a3520',
    tertiaryBorderColor: '#b89860',
    // Lines & edges
    lineColor: '#b08040',
    // Fonts
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: '13px',
    // Flowchart specific
    nodeBorder: '#c4a060',
    mainBkg: '#f5ede0',
    clusterBkg: '#faf3e8',
    clusterBorder: '#d4b88a',
    // Sequence diagram
    actorBorder: '#c4a060',
    actorBkg: '#f5ede0',
    actorTextColor: '#4a3520',
    signalColor: '#b08040',
    signalTextColor: '#4a3520',
    labelBoxBkgColor: '#faf3e8',
    labelBoxBorderColor: '#d4b88a',
    labelTextColor: '#4a3520',
    noteBkgColor: '#f5ede0',
    noteBorderColor: '#e8a849',
    noteTextColor: '#4a3520',
    // Misc
    edgeLabelBackground: '#faf3e8',
    // Critical / done / active
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
  color: #7a6a50;
  font-size: 11px;
  margin: 8px 0 0;
  text-align: right;
}
</style>
