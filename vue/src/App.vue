<template>
  <CanvasSpace @click-canvas="blurInput" />
  <SpeechBubble
    :text="isScrollingTimeline ? timelineBubbleText : bubbleText"
    :visible="isScrollingTimeline ? timelineBubbleVisible : bubbleVisible"
  />
  <ThinkingDots :visible="isThinking" />
  <InputBar
    ref="inputBar"
    :recording="sttRecording"
    :mic-active="spaceDown"
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
let lastInputWasVoice = false

// TTS
const tts = useTTS()

// Send — with TTS integration
const { send, isThinking, bubbleText, bubbleVisible, toolLogs, showBubble, dismissBubble } = useSend({ tts })

// Wire TTS → bubble dismissal (original behavior: bubble fades 3s after TTS ends)
tts.onPlaybackEnd(() => {
  dismissBubble(3000)
})

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
const { isRecording: sttRecording, startRecording: rawStartRecording, stopRecording: rawStopRecording } = useSTT({
  tts,
  onResult: (text) => {
    lastInputWasVoice = true
    handleSend(text)
  },
  onError: (msg) => {
    showBubble(msg, 3000)
  },
  onStart: (label) => {
    // Clear any existing bubble immediately, then show recording label
    dismissBubble(0)
    showBubble(label || '松开发送...')
  },
  onStop: () => {
    // Immediately clear "松开发送" bubble
    bubbleVisible.value = false
  },
  onThinkingStart: () => {
    isThinking.value = true
  },
  onThinkingEnd: () => {
    isThinking.value = false
  },
})

// Wrap start/stop to handle bubble clearing (matches original)
function startRecording() {
  // Clear bubble and stop TTS before recording
  bubbleVisible.value = false
  rawStartRecording()
}

function stopRecording() {
  // Immediately clear recording bubble
  bubbleVisible.value = false
  rawStopRecording()
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

// Timeline navigation
const { isScrollingTimeline } = useTimeline()

const timelineBubbleText = computed(() => {
  if (!isScrollingTimeline.value) return ''
  const info = timeline.getBubbleInfo()
  return info ? info.text : ''
})
const timelineBubbleVisible = computed(() => isScrollingTimeline.value && !!timelineBubbleText.value)

// Wire TTS into speech — watch bubbleText changes to trigger TTS
watch(bubbleText, async (text) => {
  if (text && !isScrollingTimeline.value && !sttRecording.value) {
    const played = await tts.playTTS(text)
    // If TTS didn't play (disabled or error), auto-dismiss after 3s
    if (!played) {
      dismissBubble(3000)
    }
    // If TTS played, onPlaybackEnd will dismissBubble
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

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>
