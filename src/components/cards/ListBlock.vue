<template>
  <div class="win-body">
    <h3 v-if="data.title">{{ data.title }}</h3>
    <div v-for="(it, idx) in (data.items || [])" :key="idx">
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

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const listStyle = computed(() => props.data.style || 'unordered')

function itemText(it) {
  return typeof it === 'string' ? it : it.text || it.title || ''
}

function itemDone(it) {
  return typeof it === 'object' && it.done
}
</script>
