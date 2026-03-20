<template>
  <div class="win-body">
    <div class="md-body" v-html="renderedMarkdown"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const renderedMarkdown = computed(() => {
  if (window.marked) {
    return window.marked.parse(props.data.content || '')
  }
  return props.data.content || ''
})
</script>
