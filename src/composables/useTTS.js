import { ref } from 'vue'
import { useConfigStore } from '../stores/config.js'

/**
 * useTTS — Text-to-Speech via OpenAI-compatible API
 * 
 * Features:
 * - Generation counter to cancel stale requests
 * - AudioContext decode with Audio element fallback
 * - Retry with backoff for intermittent CORS
 * - Skips playback while user is recording
 * - Calls onEnd callback when playback finishes (for bubble dismissal)
 * - Exposes playback progress (0-1) for card sync
 */
export function useTTS() {
  const isPlaying = ref(false)
  const progress = ref(0)   // 0-1 playback progress
  const duration = ref(0)   // audio duration in seconds
  
  let currentAudio = null
  let audioCtx = null
  let generation = 0
  let onEndCallback = null
  let progressRAF = null

  // External flag — set by useSTT when recording
  const isRecording = ref(false)

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    return audioCtx
  }

  function unlockAudio() {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
  }

  function stopProgressLoop() {
    if (progressRAF) {
      cancelAnimationFrame(progressRAF)
      progressRAF = null
    }
  }

  function stopTTS() {
    generation++
    stopProgressLoop()
    if (currentAudio) {
      try { currentAudio.pause() } catch {}
      currentAudio = null
    }
    isPlaying.value = false
    progress.value = 0
    duration.value = 0
  }

  /** Set callback for when playback ends (used for bubble dismissal) */
  function onPlaybackEnd(cb) {
    onEndCallback = cb
  }

  function cleanUrl(url) {
    if (!url) return ''
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  /**
   * Fetch TTS audio and return the ArrayBuffer without playing.
   * Returns null if TTS is disabled or fetch fails.
   */
  async function fetchTTSAudio(text) {
    const config = useConfigStore()
    if (!config.ttsEnabled || !config.ttsApiKey || !config.ttsBaseUrl || !text?.trim()) return null

    const baseUrl = cleanUrl(config.ttsBaseUrl)
    const ttsUrl = `${baseUrl}/v1/audio/speech`
    const headers = {
      'Authorization': `Bearer ${config.ttsApiKey}`,
      'Content-Type': 'application/json',
    }
    const body = JSON.stringify({
      model: config.ttsModel || 'tts-1',
      voice: config.ttsVoice || 'nova',
      input: text,
      response_format: 'mp3',
    })

    let res, lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(ttsUrl, { method: 'POST', headers, body })
        break
      } catch (err) {
        lastErr = err
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }
    if (!res || !res.ok) return null

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength === 0) return null
    return arrayBuffer
  }

  /**
   * Play an already-fetched audio buffer.
   * Returns a promise that resolves with { duration } when playback starts,
   * or null if playback fails.
   */
  async function playBuffer(arrayBuffer) {
    const gen = ++generation
    if (isRecording.value) return null

    // Stop previous
    stopProgressLoop()
    if (currentAudio) {
      try { currentAudio.pause() } catch {}
      currentAudio = null
    }

    isPlaying.value = true
    progress.value = 0

    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      if (gen !== generation) { isPlaying.value = false; return null }

      duration.value = audioBuffer.duration
      const startTime = ctx.currentTime
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.start(0)

      // Progress tracking via RAF
      const trackProgress = () => {
        if (gen !== generation) return
        const elapsed = ctx.currentTime - startTime
        progress.value = Math.min(elapsed / audioBuffer.duration, 1)
        if (progress.value < 1 && isPlaying.value) {
          progressRAF = requestAnimationFrame(trackProgress)
        }
      }
      progressRAF = requestAnimationFrame(trackProgress)

      source.onended = () => {
        stopProgressLoop()
        progress.value = 1
        currentAudio = null
        isPlaying.value = false
        onEndCallback?.()
      }
      currentAudio = { pause: () => { try { source.stop() } catch {} } }
      return { duration: audioBuffer.duration }
    } catch {
      // Fallback: Audio element (no precise progress tracking via AudioContext)
      if (gen !== generation) { isPlaying.value = false; return null }
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
      const blobUrl = URL.createObjectURL(blob)
      const audio = new Audio(blobUrl)

      return new Promise((resolve) => {
        audio.onloadedmetadata = () => {
          duration.value = audio.duration
          resolve({ duration: audio.duration })
        }
        audio.ontimeupdate = () => {
          if (audio.duration > 0) {
            progress.value = audio.currentTime / audio.duration
          }
        }
        audio.onended = () => {
          URL.revokeObjectURL(blobUrl)
          progress.value = 1
          currentAudio = null
          isPlaying.value = false
          onEndCallback?.()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(blobUrl)
          isPlaying.value = false
          resolve(null)
        }
        audio.play()
        currentAudio = audio
      })
    }
  }

  /**
   * Original all-in-one: fetch + play.
   * Kept for backward compat (config panel voice preview etc.)
   */
  async function playTTS(text) {
    const gen = ++generation
    const config = useConfigStore()
    if (!config.ttsEnabled || !config.ttsApiKey || !config.ttsBaseUrl || !text?.trim()) return false
    if (isRecording.value) return false

    try {
      const arrayBuffer = await fetchTTSAudio(text)
      if (!arrayBuffer || gen !== generation) return false
      const result = await playBuffer(arrayBuffer)
      return !!result
    } catch (e) {
      console.error('[TTS]', e)
      isPlaying.value = false
      onEndCallback?.()
      return false
    }
  }

  /**
   * Transcribe audio buffer via Whisper to get word-level timestamps.
   * Returns { words: [{ word, start, end }], duration } or null on failure.
   */
  async function transcribeForTimestamps(arrayBuffer) {
    const config = useConfigStore()
    const baseUrl = cleanUrl(config.ttsBaseUrl)
    if (!baseUrl || !config.ttsApiKey) return null

    try {
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
      const form = new FormData()
      form.append('file', blob, 'speech.mp3')
      form.append('model', 'whisper-1')
      form.append('response_format', 'verbose_json')
      form.append('timestamp_granularities[]', 'word')
      form.append('language', 'zh')

      const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.ttsApiKey}` },
        body: form,
      })

      if (!res.ok) {
        console.warn('[TTS] Whisper timestamps failed:', res.status)
        return null
      }

      const data = await res.json()
      if (!data.words?.length) return null

      return {
        words: data.words, // [{ word, start, end }, ...]
        duration: data.duration,
      }
    } catch (err) {
      console.warn('[TTS] Whisper timestamps error:', err)
      return null
    }
  }

  return {
    playTTS,
    fetchTTSAudio,
    transcribeForTimestamps,
    playBuffer,
    stopTTS,
    unlockAudio,
    onPlaybackEnd,
    cleanUrl,
    isPlaying,
    isRecording, // shared with useSTT
    progress,    // 0-1 playback progress
    duration,    // audio duration in seconds
    generation: () => generation,
    bumpGeneration: () => ++generation,
  }
}
