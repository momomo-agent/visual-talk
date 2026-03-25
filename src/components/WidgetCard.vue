<template>
  <div class="widget-card" :style="cardStyle">
    <iframe
      ref="iframeRef"
      :srcdoc="shellHTML"
      sandbox="allow-scripts"
      class="widget-iframe"
      @load="onIframeLoad"
    />
    <div v-if="isStreaming" class="widget-shimmer" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { WIDGET_SHELL_HTML } from '../lib/widget-shell.js'

const props = defineProps({
  code: { type: String, default: '' },
  isStreaming: { type: Boolean, default: false },
  title: { type: String, default: 'Widget' },
})

const iframeRef = ref(null)
const iframeReady = ref(false)
const iframeHeight = ref(400) // default height
let pendingCode = null

const shellHTML = computed(() => WIDGET_SHELL_HTML)

const cardStyle = computed(() => ({
  height: iframeHeight.value + 'px',
}))

function onIframeLoad() {
  // Fallback ready signal — iframe onload fires after receiver script runs
  iframeReady.value = true
  if (pendingCode) {
    sendContent(pendingCode, !props.isStreaming)
    pendingCode = null
  }
}

function sendContent(html, finalize = false) {
  const iframe = iframeRef.value
  if (!iframe?.contentWindow) return

  try {
    const escaped = html
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/<\/script>/gi, '<\\/script>')

    if (finalize) {
      iframe.contentWindow.postMessage({
        type: 'widget:finalize',
        html: html,
      }, '*')
    } else {
      iframe.contentWindow.postMessage({
        type: 'widget:update',
        html: html,
      }, '*')
    }
  } catch (e) {
    // Sandbox might block — fail silently
  }
}

// Strip <script> during streaming to prevent code leaking as text
function sanitizeForStreaming(html) {
  // Find last <script that doesn't have a matching </script>
  const lastScriptOpen = html.lastIndexOf('<script')
  if (lastScriptOpen === -1) return html

  const lastScriptClose = html.lastIndexOf('</script>')
  if (lastScriptClose > lastScriptOpen) return html // matched

  // Truncate at <script to avoid showing JS as text
  return html.substring(0, lastScriptOpen)
}

// Watch code changes — debounced updates during streaming
let updateTimer = null
watch(() => props.code, (newCode) => {
  if (!newCode || newCode.length < 10) return

  if (props.isStreaming) {
    // Debounce streaming updates
    if (updateTimer) return
    updateTimer = setTimeout(() => {
      updateTimer = null
      const safe = sanitizeForStreaming(props.code)
      if (iframeReady.value) {
        sendContent(safe, false)
      } else {
        pendingCode = safe
      }
    }, 120)
  } else {
    // Final render — send complete code with scripts
    if (iframeReady.value) {
      sendContent(newCode, true)
    } else {
      pendingCode = newCode
    }
  }
}, { immediate: true })

// When streaming ends, finalize
watch(() => props.isStreaming, (streaming, was) => {
  if (was && !streaming && props.code) {
    if (updateTimer) {
      clearTimeout(updateTimer)
      updateTimer = null
    }
    if (iframeReady.value) {
      sendContent(props.code, true)
    } else {
      pendingCode = props.code
    }
  }
})

// Listen for height reports from iframe
function onMessage(e) {
  if (e.source !== iframeRef.value?.contentWindow) return
  if (e.data?.type === 'widget:resize') {
    iframeHeight.value = Math.max(100, Math.min(2000, e.data.height))
  }
  if (e.data?.type === 'widget:ready') {
    iframeReady.value = true
    if (pendingCode) {
      sendContent(pendingCode, !props.isStreaming)
      pendingCode = null
    }
  }
  if (e.data?.type === 'widget:sendPrompt') {
    // Bubble up as custom event — InputBar can listen
    window.dispatchEvent(new CustomEvent('widget-prompt', { detail: e.data.text }))
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  if (updateTimer) clearTimeout(updateTimer)
})
</script>

<style scoped>
.widget-card {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  transition: height 0.3s ease;
}

.widget-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  display: block;
}

.widget-shimmer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: linear-gradient(transparent, rgba(26,24,18,0.6));
  pointer-events: none;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
</style>
