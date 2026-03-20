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
 */
export function useTTS() {
  const isPlaying = ref(false)
  
  let currentAudio = null
  let audioCtx = null
  let generation = 0
  let onEndCallback = null

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

  function stopTTS() {
    generation++
    if (currentAudio) {
      try { currentAudio.pause() } catch {}
      currentAudio = null
    }
    isPlaying.value = false
  }

  /** Set callback for when playback ends (used for bubble dismissal) */
  function onPlaybackEnd(cb) {
    onEndCallback = cb
  }

  function cleanUrl(url) {
    if (!url) return ''
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  async function playTTS(text) {
    const config = useConfigStore()
    const gen = ++generation

    if (!config.ttsEnabled) return false
    if (!config.ttsApiKey) return false
    if (!config.ttsBaseUrl) return false
    if (!text?.trim()) return false
    if (isRecording.value) return false

        // Stop previous
    if (currentAudio) {
      try { currentAudio.pause() } catch {}
      currentAudio = null
    }

    try {
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

      // Fetch with retry
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
      if (!res) throw lastErr
      if (gen !== generation) return
      if (!res.ok) return

      const arrayBuffer = await res.arrayBuffer()
      if (gen !== generation) return
      if (arrayBuffer.byteLength === 0) return

      isPlaying.value = true

      // Try AudioContext decode first
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') await ctx.resume()

      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
        if (gen !== generation) { isPlaying.value = false; return }
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        source.start(0)
        source.onended = () => { currentAudio = null; isPlaying.value = false; onEndCallback?.() }
        currentAudio = { pause: () => { try { source.stop() } catch {} } }
      } catch {
        // Fallback: Audio element
        if (gen !== generation) { isPlaying.value = false; return }
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
        const blobUrl = URL.createObjectURL(blob)
        const audio = new Audio(blobUrl)
        audio.onended = () => {
          URL.revokeObjectURL(blobUrl)
          currentAudio = null
          isPlaying.value = false
          onEndCallback?.()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(blobUrl)
          isPlaying.value = false
        }
        await audio.play()
        currentAudio = audio
      }
    } catch (e) {
      console.error('[TTS]', e)
      isPlaying.value = false
      onEndCallback?.()
    }
    return true
  }

  return {
    playTTS,
    stopTTS,
    unlockAudio,
    onPlaybackEnd,
    cleanUrl,
    isPlaying,
    isRecording, // shared with useSTT
    generation: () => generation,
    bumpGeneration: () => ++generation,
  }
}
