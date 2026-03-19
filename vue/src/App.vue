<template>
  <CanvasSpace />
  <SpeechBubble
    :text="timelineBubbleText || bubbleText"
    :visible="timelineBubbleVisible || bubbleVisible"
  />
  <ThinkingDots :visible="isThinking" />
  <InputBar @send="handleSend" />
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
import { ref, computed, watch } from 'vue'
import CanvasSpace from './components/CanvasSpace.vue'
import SpeechBubble from './components/SpeechBubble.vue'
import ThinkingDots from './components/ThinkingDots.vue'
import InputBar from './components/InputBar.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import { useSend } from './composables/useSend.js'
import { useTimeline } from './composables/useTimeline.js'
import { useConfigStore } from './stores/config.js'
import { useTimelineStore } from './stores/timeline.js'

const configOpen = ref(false)
const configStore = useConfigStore()
const timeline = useTimelineStore()

const { send, isThinking, bubbleText, bubbleVisible, toolLogs } = useSend()
const { isScrollingTimeline } = useTimeline()

// Timeline bubble — shows when navigating history
const timelineBubbleText = computed(() => {
  if (!isScrollingTimeline.value) return ''
  const info = timeline.getBubbleInfo()
  return info ? info.text : ''
})
const timelineBubbleVisible = computed(() => isScrollingTimeline.value && !!timelineBubbleText.value)

function handleSend(text) {
  if (!configStore.apiKey) {
    configOpen.value = true
    return
  }
  send(text)
}
</script>
