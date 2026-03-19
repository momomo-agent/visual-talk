<template>
  <div
    class="v-block"
    :class="{ selected: card.selected, 'glow-breathe': card.selected && glowBreathing }"
    :style="cardStyle"
    @click.stop="onClick"
    @mousedown="onMouseDown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="win-bar">
      <div class="win-dot"></div>
      <span>{{ typeLabel }}</span>
    </div>

    <!-- card -->
    <template v-if="card.type === 'card'">
      <img
        v-if="card.data.image"
        :src="card.data.image"
        :data-original-src="card.data.image"
        loading="eager"
        referrerpolicy="no-referrer"
        style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)"
        @error="handleImageError"
      />
      <div class="win-body">
        <h2 v-if="card.data.title">{{ card.data.title }}</h2>
        <div v-if="card.data.sub" class="sub">{{ card.data.sub }}</div>
        <div v-if="card.data.tags?.length" class="tags">
          <span v-for="(t, i) in card.data.tags" :key="i" class="tag">{{ t }}</span>
        </div>
        <div v-if="card.data.progress != null" class="progress-track">
          <div class="progress-bar" :style="{ width: card.data.progress + '%' }"></div>
        </div>
        <div v-for="(it, i) in (card.data.items || [])" :key="i" class="list-item">
          {{ typeof it === 'string' ? it : it.title }}
        </div>
        <div v-if="card.data.footer" class="footer">{{ card.data.footer }}</div>
      </div>
    </template>

    <!-- metric -->
    <template v-else-if="card.type === 'metric'">
      <div class="win-body">
        <div class="big-num">
          {{ card.data.value }}<span v-if="card.data.unit" style="font-size:18px;color:#8a7a60">{{ card.data.unit }}</span>
        </div>
        <div class="big-label">{{ card.data.label || '' }}</div>
      </div>
    </template>

    <!-- steps -->
    <template v-else-if="card.type === 'steps'">
      <div class="win-body">
        <h3 v-if="card.data.title">{{ card.data.title }}</h3>
        <div v-for="(ev, i) in (card.data.items || [])" :key="i" class="tl-item">
          <div v-if="ev.time" class="tl-time">{{ ev.time }}</div>
          <div class="tl-title">{{ ev.title || '' }}</div>
          <div v-if="ev.detail" class="tl-detail">{{ ev.detail }}</div>
        </div>
      </div>
    </template>

    <!-- columns -->
    <template v-else-if="card.type === 'columns'">
      <div class="win-body">
        <h3 v-if="card.data.title">{{ card.data.title }}</h3>
        <div class="cols" :style="{ gridTemplateColumns: `repeat(${(card.data.cols || []).length}, 1fr)` }">
          <div v-for="(c, i) in (card.data.cols || [])" :key="i" class="col">
            <h4 v-if="c.name">{{ c.name }}</h4>
            <div v-for="(it, j) in (c.items || [])" :key="j" class="col-item">{{ it }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- callout -->
    <template v-else-if="card.type === 'callout'">
      <div class="win-body">
        <template v-if="card.data.author || card.data.source">
          <div class="quote">"{{ card.data.text }}"</div>
          <div class="attribution">{{ card.data.author || '' }}{{ card.data.source ? ` — ${card.data.source}` : '' }}</div>
        </template>
        <template v-else>
          <div class="highlight">{{ card.data.text }}</div>
        </template>
      </div>
    </template>

    <!-- code -->
    <template v-else-if="card.type === 'code'">
      <div class="win-body">
        <pre style="background:rgba(0,0,0,0.06);padding:14px;border-radius:4px;overflow-x:auto;font-size:12px;color:#4a3a2a"><code>{{ card.data.code || '' }}</code></pre>
      </div>
    </template>

    <!-- markdown -->
    <template v-else-if="card.type === 'markdown'">
      <div class="win-body">
        <div class="md-body" v-html="renderedMarkdown"></div>
      </div>
    </template>

    <!-- media -->
    <template v-else-if="card.type === 'media'">
      <template v-if="card.data.images?.length">
        <div class="win-body">
          <div class="img-grid">
            <img
              v-for="(u, i) in card.data.images"
              :key="i"
              :src="typeof u === 'string' ? u : u.url"
              loading="eager"
              referrerpolicy="no-referrer"
              style="object-fit:cover;background:rgba(0,0,0,0.05)"
              @error="handleImageError"
            />
          </div>
          <div v-if="card.data.caption" class="footer">{{ card.data.caption }}</div>
        </div>
      </template>
      <template v-else-if="card.data.url">
        <img
          :src="card.data.url"
          :data-original-src="card.data.url"
          loading="eager"
          referrerpolicy="no-referrer"
          style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)"
          @error="handleImageError"
        />
        <div class="win-body">
          <div v-if="card.data.caption" class="footer">{{ card.data.caption }}</div>
        </div>
      </template>
    </template>

    <!-- chart -->
    <template v-else-if="card.type === 'chart'">
      <div class="win-body">
        <h3 v-if="card.data.title">{{ card.data.title }}</h3>
        <ChartRenderer :data="card.data" />
      </div>
    </template>

    <!-- list -->
    <template v-else-if="card.type === 'list'">
      <div class="win-body">
        <h3 v-if="card.data.title">{{ card.data.title }}</h3>
        <div v-for="(it, idx) in (card.data.items || [])" :key="idx">
          <!-- todo -->
          <div v-if="listStyle === 'todo'" style="display:flex;align-items:flex-start;gap:8px;padding:3px 0">
            <span style="font-size:14px;line-height:1.4">{{ itemDone(it) ? '✅' : '⬜' }}</span>
            <span :style="{ fontSize: '13px', color: itemDone(it) ? '#8a7a60' : '#4a3a2a', textDecoration: itemDone(it) ? 'line-through' : 'none', opacity: itemDone(it) ? 0.6 : 1 }">{{ itemText(it) }}</span>
          </div>
          <!-- ordered -->
          <div v-else-if="listStyle === 'ordered'" style="display:flex;align-items:flex-start;gap:8px;padding:3px 0">
            <span style="font-size:12px;color:#8a7a60;min-width:18px;font-weight:600">{{ idx + 1 }}.</span>
            <span style="font-size:13px;color:#4a3a2a">{{ itemText(it) }}</span>
          </div>
          <!-- unordered -->
          <div v-else style="display:flex;align-items:flex-start;gap:8px;padding:3px 0">
            <span style="font-size:8px;color:#8a7a60;margin-top:5px">●</span>
            <span style="font-size:13px;color:#4a3a2a">{{ itemText(it) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- embed -->
    <template v-else-if="card.type === 'embed'">
      <template v-if="youtubeId">
        <iframe
          :src="`https://www.youtube.com/embed/${youtubeId}`"
          style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px 8px 0 0;display:block"
          allowfullscreen
        ></iframe>
      </template>
      <template v-else-if="bilibiliId">
        <iframe
          :src="`https://player.bilibili.com/player.html?bvid=${bilibiliId}&page=1`"
          style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px 8px 0 0;display:block"
          allowfullscreen
        ></iframe>
      </template>
      <template v-else-if="isMap">
        <iframe
          :src="`https://maps.google.com/maps?q=${encodeURIComponent(card.data.query || card.data.title || '')}&output=embed`"
          style="width:100%;height:200px;border:none;border-radius:8px 8px 0 0;display:block"
        ></iframe>
      </template>
      <template v-else>
        <a
          :href="card.data.url"
          target="_blank"
          rel="noopener"
          style="display:block;padding:12px;background:rgba(0,0,0,0.04);border-radius:6px;text-decoration:none;color:#4a3a2a"
        >
          <img
            v-if="card.data.image"
            :src="card.data.image"
            style="width:100%;border-radius:4px;margin-bottom:8px;object-fit:cover"
            @error="handleImageError"
          />
          <div style="font-weight:600;font-size:14px">{{ card.data.title || card.data.url }}</div>
          <div v-if="card.data.description" style="font-size:12px;color:#8a7a60;margin-top:4px">{{ card.data.description }}</div>
          <div style="font-size:11px;color:#a09080;margin-top:4px">{{ embedHostname }}</div>
        </a>
      </template>
      <div class="win-body">
        <div v-if="card.data.caption" class="footer">{{ card.data.caption }}</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { handleImageError as imgErr } from '../lib/imageProxy.js'
import ChartRenderer from './ChartRenderer.vue'

const props = defineProps({
  card: { type: Object, required: true },
})

const emit = defineEmits(['toggle-select', 'update-position'])

const glowBreathing = ref(false)

const typeLabels = {
  card: 'card', metric: 'data', steps: 'timeline', columns: 'compare',
  callout: 'quote', code: 'code', markdown: 'note', media: 'media',
  chart: 'chart', list: 'list', embed: 'embed',
}

const typeLabel = computed(() => typeLabels[props.card.type] || props.card.type)

const cardStyle = computed(() => {
  const c = props.card
  const hasImage = c.type === 'media' || (c.type === 'card' && c.data.image)
  return {
    left: `${c.x}%`,
    top: `${c.y}%`,
    width: c.w ? `${c.w}%` : undefined,
    maxWidth: hasImage ? '380px' : undefined,
    transform: `translateZ(${c.z}px) scale(${c.scale})`,
    opacity: c.opacity,
    zIndex: c.zIndex,
    filter: c.blur > 0 ? `blur(${c.blur}px)` : 'none',
    pointerEvents: c.pointerEvents || 'auto',
  }
})

// Markdown rendering
const renderedMarkdown = computed(() => {
  if (props.card.type !== 'markdown') return ''
  if (window.marked) {
    return window.marked.parse(props.card.data.content || '')
  }
  return props.card.data.content || ''
})

// List helpers
const listStyle = computed(() => props.card.data.style || 'unordered')
function itemText(it) {
  return typeof it === 'string' ? it : it.text || it.title || ''
}
function itemDone(it) {
  return typeof it === 'object' && it.done
}

// Embed helpers
const youtubeId = computed(() => {
  const url = props.card.data.url || ''
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
})
const bilibiliId = computed(() => {
  const url = props.card.data.url || ''
  if (!url.includes('bilibili.com/video/')) return null
  const m = url.match(/(BV[\w]+)/)
  return m ? m[1] : null
})
const isMap = computed(() => {
  const url = props.card.data.url || ''
  return url.includes('maps') || props.card.data.type === 'map'
})
const embedHostname = computed(() => {
  try {
    return new URL(props.card.data.url || '').hostname
  } catch { return '' }
})

function handleImageError(e) {
  imgErr(e)
}

// Interaction state
let isDragging = false
let startX = 0, startY = 0, origLeft = 0, origTop = 0
let preHover = null

function onMouseEnter() {
  if (props.card.selected || isDragging) return
  preHover = {
    z: props.card.z,
    scale: props.card.scale,
    opacity: props.card.opacity,
    zIndex: props.card.zIndex,
    blur: props.card.blur,
  }
  // Direct mutation through reactive proxy
  props.card.z = 60
  props.card.scale = 1.04
  props.card.opacity = 1
  props.card.zIndex = 150
  props.card.blur = 0
}

function onMouseLeave() {
  if (props.card.selected || isDragging) return
  if (preHover) {
    props.card.z = preHover.z
    props.card.scale = preHover.scale
    props.card.opacity = preHover.opacity
    props.card.zIndex = preHover.zIndex
    props.card.blur = preHover.blur
    preHover = null
  }
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

function onMouseDown(e) {
  if (e.target.tagName === 'A' || e.target.tagName === 'INPUT' || e.target.tagName === 'IFRAME') return
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
    }
    if (isDragging) {
      const cw = window.innerWidth
      const ch = window.innerHeight
      emit('update-position', origLeft + (dx / cw) * 100, origTop + (dy / ch) * 100)
    }
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    setTimeout(() => { isDragging = false }, 10)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>
