<template>
  <CanvasSpace ref="canvasSpace" @click-canvas="blurInput" />
  <SpeechBubble
    :class="{ 'ui-hidden': isGalleryOpen }"
    :text="isScrollingTimeline ? timelineBubbleText : bubbleText"
    :visible="isScrollingTimeline ? timelineBubbleVisible : bubbleVisible"
  />
  <ThinkingDots :visible="isThinking && !isGalleryOpen" />
  <InputBar
    :class="{ 'ui-hidden': isGalleryOpen }"
    ref="inputBar"
    :recording="isRecording"
    :mic-active="spaceDown"
    :voice-enabled="voiceEnabled"
    @send="handleSend"
    @mic-down="startRecording"
    @mic-up="stopRecording"
  />
  <div :class="{ 'ui-hidden': isGalleryOpen }" class="tool-log">
    <div
      v-for="log in toolLogs"
      :key="log.id"
      class="tool-log-item"
      :class="{ fading: log.fading }"
    >{{ log.text }}</div>
  </div>
  <button :class="{ 'ui-hidden': isGalleryOpen }" class="gear-btn" style="right: 72px" @click="newTopic" title="新话题">+</button>
  <button :class="{ 'ui-hidden': isGalleryOpen }" class="gear-btn" style="right: 40px" @click="toggleGallery" title="话题">☰</button>
  <button :class="{ 'ui-hidden': isGalleryOpen }" class="gear-btn" @click="configOpen = true">⚙</button>
  <ConfigPanel v-model:open="configOpen" @preview-voice="previewVoice" />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { createVoice } from './lib/agentic-voice.js'
import CanvasSpace from './components/CanvasSpace.vue'
import SpeechBubble from './components/SpeechBubble.vue'
import ThinkingDots from './components/ThinkingDots.vue'
import InputBar from './components/InputBar.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import { useSend } from './composables/useSend.js'
import { useTimeline } from './composables/useTimeline.js'
import { useConfigStore } from './stores/config.js'
import { useSketchStore } from './stores/sketch.js'
import { useTimelineStore } from './stores/timeline.js'
import { useForestStore } from './stores/forest.js'

const configOpen = ref(false)
const canvasSpace = ref(null)
const isGalleryOpen = computed(() => canvasSpace.value?.galleryMode ?? false)

function newTopic() {
  forest.newTree()
}

function toggleGallery() {
  if (canvasSpace.value?.galleryMode) {
    canvasSpace.value.exitGallery()
  } else {
    canvasSpace.value?.enterGallery()
  }
}
const inputBar = ref(null)
const configStore = useConfigStore()
const timeline = useTimelineStore()
const forest = useForestStore()
let lastInputWasVoice = false

// Initialize forest (restore persisted state)
onMounted(async () => {
  await forest.init()
  // Start sketch watcher after forest is ready (timeline has data)
  useSketchStore().initWatcher()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  // Listen for sendPrompt from widget iframes
  window.addEventListener('widget-prompt', (e) => {
    if (e.detail) handleSend(e.detail)
  })
})

// Voice enabled
const voiceEnabled = computed(() => {
  if (!configStore.ttsEnabled) return false
  if (configStore.ttsProvider === 'elevenlabs') return !!configStore.elevenLabsApiKey
  return !!configStore.ttsApiKey
})

// Create voice instance
const voice = ref(null)
const isRecording = ref(false)
const isSpeaking = ref(false)

// Initialize voice
watch([
  () => configStore.ttsEnabled,
  () => configStore.ttsProvider, () => configStore.ttsApiKey, () => configStore.ttsBaseUrl, () => configStore.ttsModel, () => configStore.ttsVoice,
  () => configStore.elevenLabsApiKey, () => configStore.elevenLabsVoiceId,
  () => configStore.sttProvider, () => configStore.sttApiKey, () => configStore.sttBaseUrl, () => configStore.sttModel,
  () => configStore.elevenLabsSttApiKey, () => configStore.elevenLabsSttModel
], () => {
  if (voice.value) voice.value.destroy()
  if (!configStore.ttsEnabled) {
    voice.value = null
    return
  }

  // Build TTS config
  const ttsConfig = configStore.ttsProvider === 'elevenlabs' ? {
    provider: 'elevenlabs',
    apiKey: configStore.elevenLabsApiKey,
    voice: configStore.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB',
    model: 'eleven_turbo_v2_5',
  } : {
    provider: 'openai',
    apiKey: configStore.ttsApiKey,
    baseUrl: configStore.ttsBaseUrl,
    model: configStore.ttsModel || 'tts-1',
    voice: configStore.ttsVoice || 'nova',
  }

  // Build STT config
  const sttConfig = configStore.sttProvider === 'elevenlabs' ? {
    provider: 'elevenlabs',
    mode: 'whisper',
    apiKey: configStore.elevenLabsSttApiKey || configStore.elevenLabsApiKey,
    model: configStore.elevenLabsSttModel || 'scribe_v2',
  } : {
    provider: 'openai',
    mode: 'whisper',
    apiKey: configStore.sttApiKey,
    baseUrl: configStore.sttBaseUrl,
    model: configStore.sttModel || 'whisper-1',
  }

  voice.value = createVoice({ tts: ttsConfig, stt: sttConfig })
  
  voice.value.on('transcript', text => {
    if (text) {
      lastInputWasVoice = true
      handleSend(text)
    }
  })
  
  voice.value.on('error', err => {
    showBubble(err.message, 3000)
  })
  
  voice.value.on('speaking', speaking => {
    isSpeaking.value = speaking
    if (!speaking) dismissBubble(3000)
  })
  
  voice.value.on('listening', listening => {
    isRecording.value = listening
    if (listening) showBubble('松开发送...', 0)
    else dismissBubble()
  })
}, { immediate: true })

// Send
const { send, isThinking, bubbleText, bubbleVisible, toolLogs, showBubble, dismissBubble } = useSend({ 
  playTTS: async (text) => {
    if (voice.value && configStore.ttsEnabled) {
      await voice.value.speak(text)
    }
  },
  stopTTS: () => {
    if (voice.value) voice.value.stop()
  },
  isRecording
})

function previewVoice(text) {
  if (voice.value) {
    voice.value.stop()
    voice.value.speak(text)
  }
}

async function handleSend(text) {
  if (!configStore.apiKey) {
    configOpen.value = true
    return
  }
  if (voice.value) voice.value.unlock()
  send(text)
}

// Recording
function startRecording() {
  bubbleVisible.value = false
  if (voice.value) voice.value.startListening()
}

function stopRecording() {
  bubbleVisible.value = false
  if (voice.value) voice.value.stopListening()
}

// Spacebar = push-to-talk (when not typing)
const spaceDown = ref(false)

function handleKeyDown(e) {
  if (e.key !== ' ' || e.repeat) return
  if (document.activeElement?.matches('input, textarea, select')) return
  if (configOpen.value) return
  e.preventDefault()
  spaceDown.value = true
  startRecording()
}

function handleKeyUp(e) {
  if (e.key !== ' ') return
  if (!spaceDown.value) return
  e.preventDefault()
  spaceDown.value = false
  stopRecording()
}

function blurInput() {
  inputBar.value?.blur?.()
}

function handleNewChat() {
  forest.newTree()
}

// Timeline navigation
const { isScrollingTimeline } = useTimeline()

const timelineBubbleText = computed(() => {
  if (!isScrollingTimeline.value) return ''
  const info = timeline.getBubbleInfo()
  return info ? info.text : ''
})
const timelineBubbleVisible = computed(() => isScrollingTimeline.value && !!timelineBubbleText.value)

// Wire TTS into speech — watch bubbleText changes to auto-dismiss
watch(bubbleText, async (text) => {
  if (text && !isScrollingTimeline.value && !voice.value?.isListening) {
    // TTS is already triggered by useSend's playTTS callback
    // Only auto-dismiss if voice is not enabled
    if (!voice.value) {
      dismissBubble(3000)
    }
  }
})

// After send completes, focus input only if not voice input
watch(isThinking, (thinking, wasThinkin) => {
  if (wasThinkin && !thinking && !lastInputWasVoice) {
    inputBar.value?.focus?.()
  }
  if (wasThinkin && !thinking) {
    lastInputWasVoice = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<style>
/* Gallery show/hide animation for UI elements */
.gear-btn,
.tool-log,
.input-bar,
.speech-bubble {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.ui-hidden {
  opacity: 0 !important;
  pointer-events: none !important;
  transform: translateY(8px);
}
</style>
