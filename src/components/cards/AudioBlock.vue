<template>
  <div class="audio-block" :class="{ playing: isPlaying }">
    <!-- Cover art — only show when image loads successfully, fallback icon otherwise -->
    <div class="audio-cover" :class="{ 'no-image': !imageLoaded }" @click="togglePlay">
      <img
        v-if="data.image"
        v-show="imageLoaded"
        :src="data.image"
        :data-original-src="data.image"
        referrerpolicy="no-referrer"
        @load="imageLoaded = true"
        @error="onImageError"
      />
      <div v-if="!imageLoaded" class="audio-cover-fallback">
        <span>{{ coverIcon }}</span>
      </div>
      <div class="play-overlay">
        <span class="play-icon">{{ isPlaying ? '⏸' : '▶' }}</span>
      </div>
    </div>

    <!-- Info -->
    <div class="audio-info">
      <div class="audio-title">{{ data.title }}</div>
      <div v-if="data.artist" class="audio-artist">{{ data.artist }}</div>
      <div v-if="data.album" class="audio-album">{{ data.album }}</div>
    </div>

    <!-- Progress bar -->
    <div v-if="data.duration || data.progress != null" class="audio-progress-wrap">
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { handleImageError as _handleImageError } from '../../lib/imageProxy.js'

const props = defineProps({
  data: { type: Object, required: true },
})

const hasImage = ref(!!props.data.image)
const imageLoaded = ref(false)
const isPlaying = ref(false)
const currentTime = ref(0)
let audioEl = null

const coverIcon = computed(() => {
  const kind = props.data.kind || 'music'
  return kind === 'podcast' ? '🎙' : kind === 'sound' ? '🔊' : '♪'
})

const totalDuration = computed(() => {
  // Use actual audio duration if available
  if (audioEl && audioEl.duration && isFinite(audioEl.duration)) return audioEl.duration
  if (typeof props.data.duration === 'number') return props.data.duration
  if (typeof props.data.duration === 'string') {
    const parts = props.data.duration.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  // Convert ms to seconds (iTunes returns trackTimeMillis)
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

// Real audio playback
const audioUrl = computed(() => props.data.url || props.data.previewUrl || props.data.src || null)

onMounted(() => {
  if (audioUrl.value) {
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
    // No audio URL — simulate
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

function onImageError(e) {
  hasImage.value = false
  _handleImageError(e)
}

onUnmounted(() => {
  if (audioEl) {
    audioEl.pause()
    audioEl.src = ''
    audioEl = null
  }
})
</script>
