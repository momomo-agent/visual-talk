<template>
  <div
    ref="blockRef"
    class="v-block"
    :class="{ selected: card.selected, 'glow-breathe': card.selected && glowBreathing }"
    :style="cardStyle"
    :data-content-key="card.contentKey || card.data?.key || ''"
    :data-block-key="card.data?.key || ''"
    @click.stop="onClick"
    @dblclick.stop="onDblClick"
    @mousedown="onMouseDown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div v-if="typeLabel" class="win-bar">
      <div class="win-dot"></div>
      <span>{{ typeLabel }}</span>
    </div>

    <!-- Blocks mode: free composition of elements -->
    <BlocksRenderer
      v-if="card.data?.blocks"
      :blocks="card.data.blocks"
    />

    <!-- Legacy mode: fixed type → component mapping -->
    <component
      :is="blockComponent"
      v-else-if="blockComponent"
      :data="card.data"
      v-bind="extraProps"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Z_HOVER } from '../lib/z-layers.js'
import BlocksRenderer from './cards/BlocksRenderer.vue'
import CardBlock from './cards/CardBlock.vue'
import MetricBlock from './cards/MetricBlock.vue'
import StepsBlock from './cards/StepsBlock.vue'
import ColumnsBlock from './cards/ColumnsBlock.vue'
import CalloutBlock from './cards/CalloutBlock.vue'
import CodeBlock from './cards/CodeBlock.vue'
import MarkdownBlock from './cards/MarkdownBlock.vue'
import MediaBlock from './cards/MediaBlock.vue'
import ChartBlock from './cards/ChartBlock.vue'
import ListBlock from './cards/ListBlock.vue'
import TableBlock from './cards/TableBlock.vue'
import MapBlock from './cards/MapBlock.vue'
import DiagramBlock from './cards/DiagramBlock.vue'
import AudioBlock from './cards/AudioBlock.vue'
import ProfileBlock from './cards/ProfileBlock.vue'
import HtmlBlock from './cards/HtmlBlock.vue'

const props = defineProps({
  card: { type: Object, required: true },
})

const emit = defineEmits(['toggle-select', 'update-position', 'drag-end', 'toggle-dock'])
const blockRef = ref(null)
const glowBreathing = ref(false)

const typeLabels = {
  card: 'card', metric: 'data', steps: 'timeline', columns: 'compare',
  callout: 'quote', code: 'code', markdown: 'note', media: 'media',
  chart: 'chart', list: 'list', embed: 'embed', table: 'table',
  diagram: 'diagram', audio: 'audio', profile: 'profile', html: 'demo',
}

const componentMap = {
  card: CardBlock,
  metric: MetricBlock,
  steps: StepsBlock,
  columns: ColumnsBlock,
  callout: CalloutBlock,
  code: CodeBlock,
  markdown: MarkdownBlock,
  media: MediaBlock,
  embed: MediaBlock,
  chart: ChartBlock,
  list: ListBlock,
  table: TableBlock,
  map: MapBlock,
  diagram: DiagramBlock,
  audio: AudioBlock,
  profile: ProfileBlock,
  html: HtmlBlock,
}

const typeLabel = computed(() => {
  if (props.card.data?.blocks) return props.card.data?.label || null
  return typeLabels[props.card.type] || props.card.type
})
const blockComponent = computed(() => componentMap[props.card.type] || null)

// MediaBlock needs the type prop to distinguish media vs embed
const extraProps = computed(() => {
  if (props.card.type === 'media' || props.card.type === 'embed') {
    return { type: props.card.type }
  }
  return {}
})

const cardStyle = computed(() => {
  const c = props.card
  const hasImage = c.type === 'media' || (c.type === 'card' && c.data.image)

  // Docked cards: fly to left side, absolute positioned in canvas-space
  if (c._isDocked) {
    const isSelected = c.selected
    return {
      left: '24px',
      top: `${c._dockTop || 36}px`,
      width: '276px',
      maxWidth: '276px',
      transform: `translateZ(0px) scale(${isHovered.value || isSelected ? 1.02 : 1})`,
      opacity: 1,
      zIndex: isSelected ? 999 : (isHovered.value ? 950 : 900),
      filter: 'none',
      pointerEvents: 'auto',
      transition: 'left 0.6s cubic-bezier(.22,1,.36,1), top 0.6s cubic-bezier(.22,1,.36,1), width 0.6s cubic-bezier(.22,1,.36,1), transform 0.3s, opacity 0.3s',
    }
  }

    return {
      left: `${c._mappedX ?? c.x}%`,
      top: `${c.y}%`,
      width: c.w ? `${c.w}%` : undefined,
      maxWidth: hasImage ? '340px' : undefined,
    transform: `translateZ(${isHovered.value && !c.selected ? Z_HOVER : c.z}px) scale(${isHovered.value && !c.selected ? 1.02 : c.scale})`,
    opacity: isHovered.value && !c.selected ? 1 : c.opacity,
    zIndex: isHovered.value && !c.selected ? 150 : c.zIndex,
    filter: isHovered.value && !c.selected ? 'none' : (c.blur > 0 ? `blur(${c.blur}px)` : 'none'),
    pointerEvents: c.pointerEvents || 'auto',
    transitionDelay: c.entranceDelay > 0 ? `${c.entranceDelay}s` : '0s',
    transition: dragging.value ? 'transform 0.15s, opacity 0.3s, filter 0.3s, box-shadow 0.3s' : undefined,
  }
})

// Interaction state
const dragging = ref(false)
const isHovered = ref(false)
let isDragging = false
let startX = 0, startY = 0, origLeft = 0, origTop = 0

function onMouseEnter() {
  if (props.card.selected || isDragging) return
  isHovered.value = true
}

function onMouseLeave() {
  if (isDragging) return
  isHovered.value = false
}

function onClick(e) {
  if (isDragging) return
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    emit('toggle-select', { multi: true })
  } else {
    emit('toggle-select', { multi: false })
  }
  if (props.card.selected) {
    setTimeout(() => { glowBreathing.value = true }, 500)
  } else {
    glowBreathing.value = false
  }
}

function onDblClick(e) {
  e.stopPropagation()
  emit('toggle-dock')
}

function onMouseDown(e) {
  if (e.target.tagName === 'A' || e.target.tagName === 'INPUT' || e.target.tagName === 'IFRAME') return
  // Don't initiate drag from interactive content (maps, audio players, etc.)
  if (e.target.closest('.map-block, .audio-block, .map-container, audio, video, canvas, .maplibregl-canvas')) return
  isDragging = false
  startX = e.clientX
  startY = e.clientY
  origLeft = props.card.x
  origTop = props.card.y

  const onMove = (e2) => {
    const dx = e2.clientX - startX
    const dy = e2.clientY - startY
    if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isDragging = true
      dragging.value = true
    }
    if (isDragging) {
      const el = blockRef.value
      const cw = el?.parentElement?.offsetWidth || window.innerWidth
      const ch = el?.parentElement?.offsetHeight || window.innerHeight
      emit('update-position', origLeft + (dx / cw) * 100, origTop + (dy / ch) * 100)
    }
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    if (isDragging) {
      emit('drag-end', props.card.x, props.card.y)
    }
    setTimeout(() => { isDragging = false; dragging.value = false }, 10)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>
