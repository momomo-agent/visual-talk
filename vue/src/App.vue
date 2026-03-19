<template>
  <CanvasSpace @click-canvas="blurInput" />
  <SpeechBubble
    :text="timelineBubbleText || bubbleText"
    :visible="timelineBubbleVisible || bubbleVisible"
  />
  <ThinkingDots :visible="isThinking" />
  <InputBar
    ref="inputBar"
    :recording="sttRecording"
    @send="handleSend"
    @mic-down="startRecording"
    @mic-up="stopRecording"
  />
  <div class="tool-log">
    <div
      v-for="log in toolLogs"
      :key="log.id"
      class="tool-log-item"
      :class="{ fading: log.fading }"
    >{{ log.text }}</div>
  </div>
  <button class="gear-btn" @click="configOpen = true">⚙</button>
  <ConfigPanel v-model:open="configOpen" />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import CanvasSpace from './components/CanvasSpace.vue'
import SpeechBubble from './components/SpeechBubble.vue'
import ThinkingDots from './components/ThinkingDots.vue'
import InputBar from './components/InputBar.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import { useSend } from './composables/useSend.js'
import { useTTS } from './composables/useTTS.js'
import { useSTT } from './composables/useSTT.js'
import { useTimeline } from './composables/useTimeline.js'
import { useConfigStore } from './stores/config.js'
import { useTimelineStore } from './stores/timeline.js'

const configOpen = ref(false)
const inputBar = ref(null)
const configStore = useConfigStore()
const timeline = useTimelineStore()

// TTS
const tts = useTTS()

// Send — with TTS integration
const { send, isThinking, bubbleText, bubbleVisible, toolLogs, showBubble, dismissBubble } = useSend()

// Override useSend's onSpeech to also trigger TTS
const originalSend = send
async function handleSend(text) {
  if (!configStore.apiKey) {
    configOpen.value = true
    return
  }
  tts.unlockAudio()
  originalSend(text)
}

// STT
const { isRecording: sttRecording, startRecording, stopRecording } = useSTT({
  tts,
  onResult: (text) => {
    handleSend(text)
  },
  onError: (msg) => {
    showBubble(msg, 3000)
  },
  onStart: () => {
    showBubble('松开发送...')
  },
  onStop: () => {
    // Bubble dismissed naturally
  },
})

// Spacebar = push-to-talk (when not typing)
let spaceDown = false

function handleKeyDown(e) {
  if (e.key !== ' ' || e.repeat) return
  if (document.activeElement?.matches('input, textarea, select')) return
  if (configOpen.value) return
  e.preventDefault()
  spaceDown = true
  startRecording()
}

function handleKeyUp(e) {
  if (e.key !== ' ') return
  if (!spaceDown) return
  e.preventDefault()
  spaceDown = false
  stopRecording()
}

function blurInput() {
  inputBar.value?.blur?.()
}

// Timeline navigation
const { isScrollingTimeline } = useTimeline()

const timelineBubbleText = computed(() => {
  if (!isScrollingTimeline.value) return ''
  const info = timeline.getBubbleInfo()
  return info ? info.text : ''
})
const timelineBubbleVisible = computed(() => isScrollingTimeline.value && !!timelineBubbleText.value)

// Wire TTS into speech — watch bubbleText changes to trigger TTS
watch(bubbleText, (text) => {
  if (text && !isScrollingTimeline.value && !sttRecording.value) {
    tts.playTTS(text)
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>
