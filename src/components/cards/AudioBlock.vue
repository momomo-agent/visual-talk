<template>
  <div class="audio-block" :class="{ playing: isPlaying }">
    <!-- Compact player: play button + info + progress -->
    <div class="audio-player">
      <button class="audio-play-btn" @click="togglePlay">
        <span>{{ isPlaying ? '⏸' : '▶' }}</span>
      </button>
      <div class="audio-meta">
        <div class="audio-title">{{ data.title }}</div>
        <div v-if="data.artist" class="audio-artist">
          {{ data.artist }}<span v-if="data.album"> · {{ data.album }}</span>
        </div>
      </div>
    </div>

    <!-- Progress bar -->
    <div v-if="data.duration || data.progress != null || hasAudio" class="audio-progress-wrap">
      <div class="audio-progress-track" @click="seekTo">
        <div class="audio-progress-bar" :style="{ width: progressPercent + '%' }"></div>
        <div class="audio-progress-knob" :style="{ left: progressPercent + '%' }"></div>
      </div>
      <div class="audio-times">
        <span>{{ formatTime(currentTime) }}</span>
        <span>{{ formatTime(totalDuration) }}</span>
      </div>
    </div>

    <!-- Tags/source -->
    <div v-if="data.tags?.length" class="audio-tags">
      <span v-for="(t, i) in data.tags" :key="i" class="tag">{{ t }}</span>
    </div>
    <div v-if="data.source" class="audio-source">{{ data.source }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const isPlaying = ref(false)
const currentTime = ref(0)
const hasAudio = ref(false)
let audioEl = null

const totalDuration = computed(() => {
  if (audioEl && audioEl.duration && isFinite(audioEl.duration)) return audioEl.duration
  if (typeof props.data.duration === 'number') return props.data.duration
  if (typeof props.data.duration === 'string') {
    const parts = props.data.duration.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (typeof props.data.durationMs === 'number') return props.data.durationMs / 1000
  return 0
})

const progressPercent = computed(() => {
  if (props.data.progress != null) return props.data.progress
  if (totalDuration.value <= 0) return 0
  return Math.min(100, (currentTime.value / totalDuration.value) * 100)
})

function formatTime(secs) {
  if (!secs || secs <= 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const audioUrl = computed(() => props.data.url || props.data.previewUrl || props.data.src || null)

onMounted(() => {
  if (audioUrl.value) {
    hasAudio.value = true
    audioEl = new Audio(audioUrl.value)
    audioEl.addEventListener('timeupdate', () => {
      if (!audioEl) return
      currentTime.value = audioEl.currentTime
    })
    audioEl.addEventListener('ended', () => {
      isPlaying.value = false
      currentTime.value = 0
    })
    audioEl.addEventListener('error', () => {
      console.warn('Audio failed to load:', audioUrl.value)
    })
  }
})

function togglePlay() {
  if (audioEl) {
    if (isPlaying.value) {
      audioEl.pause()
      isPlaying.value = false
    } else {
      audioEl.play().then(() => {
        isPlaying.value = true
      }).catch(err => {
        console.warn('Audio play failed:', err)
        isPlaying.value = false
      })
    }
  } else {
    isPlaying.value = !isPlaying.value
  }
}

function seekTo(e) {
  const dur = audioEl?.duration || totalDuration.value
  if (dur <= 0) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  const newTime = Math.floor(pct * dur)
  if (audioEl) {
    audioEl.currentTime = newTime
  }
  currentTime.value = newTime
}

onUnmounted(() => {
  if (audioEl) {
    audioEl.pause()
    audioEl.src = ''
    audioEl = null
  }
})
</script>
