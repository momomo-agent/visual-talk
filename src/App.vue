<template>
  <CanvasSpace @click-canvas="blurInput" />
  <SpeechBubble
    :text="isScrollingTimeline ? timelineBubbleText : bubbleText"
    :visible="isScrollingTimeline ? timelineBubbleVisible : bubbleVisible"
  />
  <ThinkingDots :visible="isThinking" />
  <InputBar
    ref="inputBar"
    :recording="stt.state.isRecording"
    :mic-active="spaceDown"
    :voice-enabled="voiceEnabled"
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
  <button class="gear-btn" style="right: 40px" @click="handleNewChat" title="新对话">+</button>
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
import { useSketchStore } from './stores/sketch.js'
import { useTimelineStore } from './stores/timeline.js'
import { useForestStore } from './stores/forest.js'

const configOpen = ref(false)
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

// Voice enabled: TTS has baseUrl or webSpeech is on
const voiceEnabled = computed(() => {
  const cfg = configStore
  return !!(cfg.ttsEnabled && cfg.ttsBaseUrl?.trim()) || !!cfg.webSpeech
})

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

// STT — reactive state, watched below
const stt = useSTT({ tts })

// Watch STT result → trigger send
watch(() => stt.state.result, (text) => {
  if (text) {
    lastInputWasVoice = true
    handleSend(text)
  }
})

// Watch STT error → show bubble
watch(() => stt.state.error, (msg) => {
  if (msg) {
    showBubble(msg, 3000)
  }
})

// Watch STT label → show/clear recording bubble
watch(() => stt.state.label, (label) => {
  if (label) {
    dismissBubble(0)
    showBubble(label)
  }
})

// Watch STT isTranscribing → manage thinking dots
watch(() => stt.state.isTranscribing, (transcribing) => {
  if (transcribing) {
    isThinking.value = true
  }
  // isTranscribing=false is handled when result/error fires, or
  // when no result comes back (error path clears it)
})

// Wrap start/stop to handle bubble clearing (matches original)
function startRecording() {
  bubbleVisible.value = false
  stt.startRecording()
}

function stopRecording() {
  bubbleVisible.value = false
  stt.stopRecording()
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

// Wire TTS into speech — watch bubbleText changes to trigger TTS
watch(bubbleText, async (text) => {
  if (text && !isScrollingTimeline.value && !stt.state.isRecording) {
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

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>
