<template>
  <div class="blocks-renderer">
    <template v-for="(block, i) in blocks" :key="i">
      <!-- heading -->
      <div v-if="block.type === 'heading'" class="br-heading-group">
        <component
          :is="headingTag(block.level)"
          class="br-heading"
          v-html="renderMarkdown(block.text)"
        />
        <p v-if="block.sub" class="br-sub" v-html="renderMarkdown(block.sub)" />
      </div>

      <!-- text -->
      <p v-else-if="block.type === 'text'" class="br-text" v-html="renderMarkdown(block.text)" />

      <!-- image -->
      <figure v-else-if="block.type === 'image'" class="br-image">
        <img
          :src="proxyImage(block.url)"
          :alt="block.caption || ''"
          :style="{ objectFit: block.fit || 'cover' }"
          loading="lazy"
          @error="onImgError"
        />
        <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
      </figure>

      <!-- tags -->
      <div v-else-if="block.type === 'tags'" class="br-tags">
        <span v-for="tag in block.items" :key="tag" class="br-tag">{{ tag }}</span>
      </div>

      <!-- metric -->
      <div v-else-if="block.type === 'metric'" class="br-metric">
        <span class="br-metric-value">{{ block.value }}</span>
        <span v-if="block.unit" class="br-metric-unit">{{ block.unit }}</span>
        <span v-if="block.label" class="br-metric-label">{{ block.label }}</span>
      </div>

      <!-- list -->
      <component
        v-else-if="block.type === 'list'"
        :is="block.style === 'number' ? 'ol' : 'ul'"
        class="br-list"
        :class="{ 'br-todo': block.style === 'todo' }"
      >
        <li v-for="(item, j) in normalizeListItems(block.items)" :key="j">
          <input v-if="block.style === 'todo'" type="checkbox" :checked="item.done" disabled />
          <span v-html="renderMarkdown(item.text)" />
        </li>
      </component>

      <!-- quote -->
      <blockquote v-else-if="block.type === 'quote'" class="br-quote">
        <p v-html="renderMarkdown(block.text)" />
        <footer v-if="block.author">
          — {{ block.author }}<span v-if="block.source">, {{ block.source }}</span>
        </footer>
      </blockquote>

      <!-- code -->
      <pre v-else-if="block.type === 'code'" class="br-code"><code>{{ block.code }}</code></pre>

      <!-- divider -->
      <hr v-else-if="block.type === 'divider'" class="br-divider" />

      <!-- progress -->
      <div v-else-if="block.type === 'progress'" class="br-progress">
        <div class="br-progress-bar" :style="{ width: `${block.value}%` }" />
        <span v-if="block.label" class="br-progress-label">{{ block.label }} {{ block.value }}%</span>
      </div>

      <!-- spacer -->
      <div
        v-else-if="block.type === 'spacer'"
        class="br-spacer"
        :class="`br-spacer-${block.size || 'medium'}`"
      />

      <!-- chart / table / diagram / map / audio / video / embed / steps — delegate to existing components -->
      <ChartBlock v-else-if="block.type === 'chart'" :data="block" />
      <TableBlock v-else-if="block.type === 'table'" :data="block" />
      <DiagramBlock v-else-if="block.type === 'diagram'" :data="block" />
      <MapBlock v-else-if="block.type === 'map'" :data="block" />
      <AudioBlock v-else-if="block.type === 'audio'" :data="block" />
      <StepsBlock v-else-if="block.type === 'steps'" :data="block" />
      <div v-else-if="block.type === 'video'" class="br-video">
        <video
          :src="block.url"
          :poster="block.poster"
          controls
          preload="metadata"
          playsinline
        />
        <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
      </div>
      <MediaBlock v-else-if="block.type === 'embed'" :data="{ url: block.url, caption: block.caption }" type="embed" />
      <HtmlBlock v-else-if="block.type === 'html'" :data="block" />
    </template>
  </div>
</template>

<script setup>
import { getProxiedUrl } from '../../lib/imageProxy.js'
import ChartBlock from './ChartBlock.vue'
import TableBlock from './TableBlock.vue'
import DiagramBlock from './DiagramBlock.vue'
import MapBlock from './MapBlock.vue'
import AudioBlock from './AudioBlock.vue'
import StepsBlock from './StepsBlock.vue'
import MediaBlock from './MediaBlock.vue'
import HtmlBlock from './HtmlBlock.vue'

defineProps({
  blocks: { type: Array, required: true },
})

function headingTag(level) {
  const n = Math.min(Math.max(level || 1, 1), 3)
  return `h${n}`
}

function proxyImage(url) {
  return url ? getProxiedUrl(url) : ''
}

function onImgError(e) {
  e.target.style.display = 'none'
}

function renderMarkdown(text) {
  if (!text) return ''
  // Lightweight: bold, italic, inline code, links
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n/g, '<br>')
}

function normalizeListItems(items) {
  if (!items) return []
  return items.map(it =>
    typeof it === 'string' ? { text: it, done: false } : it
  )
}
</script>
