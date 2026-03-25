<template>
  <div class="html-block">
    <iframe
      ref="iframeRef"
      :srcdoc="shellHTML"
      sandbox="allow-scripts"
      class="html-iframe"
      :style="{ height: iframeHeight + 'px' }"
      @load="onIframeLoad"
    />
    <div v-if="streaming" class="widget-shimmer" />
    <div v-if="data.caption" class="html-caption">{{ data.caption }}</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useConfigStore } from '../../stores/config.js'
import { WIDGET_SHELL_HTML } from '../../lib/widget-shell.js'
import { sanitizeForStreaming } from '../../lib/widget-sanitize.js'

const props = defineProps({
  data: { type: Object, required: true },
  streaming: { type: Boolean, default: false },
})

const iframeRef = ref(null)
const iframeReady = ref(false)
const iframeHeight = ref(props.data.height || 400)
let pendingCode = null
let updateTimer = null
let firstHeight = true

const shellHTML = computed(() => WIDGET_SHELL_HTML)

function onIframeLoad() {
  // Fallback ready signal
  iframeReady.value = true
  if (pendingCode) {
    sendContent(pendingCode, !props.streaming)
    pendingCode = null
  }
}

function sendContent(html, finalize = false) {
  const iframe = iframeRef.value
  if (!iframe?.contentWindow) return

  try {
    iframe.contentWindow.postMessage({
      type: finalize ? 'widget:finalize' : 'widget:update',
      html: html,
    }, '*')
  } catch {
    // Sandbox may block
  }
}

function getCode() {
  return props.data.html || props.data.code || ''
}

function sendTheme() {
  const iframe = iframeRef.value
  if (!iframe?.contentWindow) return
  const config = useConfigStore()
  const theme = config.theme === 'mercury' || config.theme === 'dot' ? 'light' : 'dark'
  try {
    iframe.contentWindow.postMessage({ type: 'widget:theme', theme }, '*')
  } catch {}
}

// Watch for code changes (streaming updates)
watch(() => getCode(), (newCode) => {
  if (!newCode || newCode.length < 10) return

  if (props.streaming) {
    if (updateTimer) return
    updateTimer = setTimeout(() => {
      updateTimer = null
      const safe = sanitizeForStreaming(getCode())
      if (iframeReady.value) {
        sendContent(safe, false)
      } else {
        pendingCode = safe
      }
    }, 120)
  } else {
    if (iframeReady.value) {
      sendContent(newCode, true)
    } else {
      pendingCode = newCode
    }
  }
}, { immediate: true })

// When streaming ends, finalize
watch(() => props.streaming, (now, was) => {
  if (was && !now) {
    if (updateTimer) { clearTimeout(updateTimer); updateTimer = null }
    const code = getCode()
    if (code) {
      if (iframeReady.value) sendContent(code, true)
      else pendingCode = code
    }
  }
})

// Listen for messages from iframe
function onMessage(e) {
  if (e.source !== iframeRef.value?.contentWindow) return

  if (e.data?.type === 'widget:resize') {
    const h = Math.max(100, Math.min(2000, e.data.height))
    // First height report — no transition
    if (firstHeight) {
      firstHeight = false
      iframeHeight.value = h
    } else {
      iframeHeight.value = h
    }
  }
  if (e.data?.type === 'widget:ready') {
    iframeReady.value = true
    // Send current theme
    sendTheme()
    if (pendingCode) {
      sendContent(pendingCode, !props.streaming)
      pendingCode = null
    }
  }
  if (e.data?.type === 'widget:sendPrompt') {
    window.dispatchEvent(new CustomEvent('widget-prompt', { detail: e.data.text }))
  }
  if (e.data?.type === 'widget:openLink') {
    window.open(e.data.url, '_blank')
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  if (updateTimer) clearTimeout(updateTimer)
})
</script>

<style scoped>
.html-block {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.html-iframe {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  transition: height 0.3s ease;
}
.html-caption {
  font-size: 10px;
  color: var(--chart-label, #8a7a60);
  padding: 6px 16px 10px;
}
.widget-shimmer {
  position: absolute;
  bottom: 0; left: 0; right: 0;
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
