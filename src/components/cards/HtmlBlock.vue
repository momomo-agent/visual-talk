<template>
  <div class="html-block">
    <iframe
      ref="iframeRef"
      :srcdoc="data.html || data.code || ''"
      sandbox="allow-scripts allow-same-origin"
      class="html-iframe"
      :style="{ height: (data.height || 300) + 'px' }"
      @load="onLoad"
    ></iframe>
    <div v-if="data.caption" class="html-caption">{{ data.caption }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  data: { type: Object, required: true },
})

const iframeRef = ref(null)

function onLoad() {
  // Auto-resize iframe to content height if possible
  try {
    const iframe = iframeRef.value
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc?.body) {
      const h = doc.body.scrollHeight
      if (h > 50) iframe.style.height = Math.min(h + 16, 600) + 'px'
    }
  } catch {
    // sandbox blocks cross-origin access — use default height
  }
}
</script>

<style scoped>
.html-block {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.html-iframe {
  width: 100%;
  border: none;
  border-radius: 0;
  background: #fff;
}
.html-caption {
  font-size: 10px;
  color: var(--chart-label, #8a7a60);
  padding: 6px 16px 10px;
}
</style>
