import { ref } from 'vue'
import { useConfigStore } from '../stores/config.js'

/**
 * useSTT — Speech-to-Text
 * 
 * Two modes:
 * 1. Web Speech API (browser built-in, no API key needed)
 * 2. Whisper API (OpenAI-compatible, uses TTS config)
 * 
 * Push-to-talk: mousedown → start, mouseup → stop
 * Spacebar shortcut when input not focused
 */
export function useSTT({ onResult, onError, onStart, onStop, tts }) {
  const isRecording = ref(false)

  let mediaRecorder = null
  let webSpeechRecognition = null
  let micDownTime = 0
  let micReleased = false

  function startRecording() {
    // User is speaking — AI shuts up
    if (tts) {
      tts.stopTTS()
      tts.isRecording.value = true
    }
    onStart?.()

    const config = useConfigStore()
    if (config.webSpeech) return startWebSpeech()
    return startWhisper()
  }

  function stopRecording() {
    micReleased = true
    if (tts) tts.isRecording.value = false
    onStop?.()

    if (webSpeechRecognition) {
      const held = Date.now() - micDownTime
      if (held < 300) {
        webSpeechRecognition.abort()
        webSpeechRecognition = null
        isRecording.value = false
        onError?.('长按说话')
      } else {
        webSpeechRecognition.stop()
      }
      return
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }
  }

  // ── Web Speech API ──
  function startWebSpeech() {
    if (webSpeechRecognition) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { onError?.('浏览器不支持 Web Speech'); return }

    micDownTime = Date.now()
    const recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false

    recognition.onresult = e => {
      const text = e.results[0]?.[0]?.transcript?.trim()
      webSpeechRecognition = null
      isRecording.value = false
      if (text) {
        onResult?.(text)
      } else {
        onError?.('没听清，再说一次？')
      }
    }
    recognition.onerror = e => {
      webSpeechRecognition = null
      isRecording.value = false
      onError?.('识别错误: ' + e.error)
    }
    recognition.onend = () => {
      webSpeechRecognition = null
      isRecording.value = false
    }

    webSpeechRecognition = recognition
    recognition.start()
    isRecording.value = true
  }

  // ── Whisper API ──

  // Convert webm → wav (some providers don't support webm)
  async function webmToWav(blob) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const samples = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }
    ctx.close()
    return new Blob([buffer], { type: 'audio/wav' })
  }

  async function startWhisper() {
    if (mediaRecorder) return
    micDownTime = Date.now()
    micReleased = false

    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('需要 HTTPS 才能使用麦克风')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (micReleased) {
        stream.getTracks().forEach(t => t.stop())
        onError?.('长按说话')
        return
      }

      const chunks = []
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorder.ondataavailable = e => chunks.push(e.data)
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const held = Date.now() - micDownTime
        mediaRecorder = null
        isRecording.value = false

        if (held < 300) {
          onError?.('长按说话')
          return
        }

        const blob = new Blob(chunks, { type: 'audio/webm' })
        await transcribe(blob)
      }

      mediaRecorder.start()
      isRecording.value = true
    } catch (e) {
      onError?.('麦克风不可用: ' + e.message)
    }
  }

  async function transcribe(blob) {
    const config = useConfigStore()
    if (!config.ttsBaseUrl || !config.ttsApiKey) {
      onError?.('请先配置 TTS Base URL 和 API Key')
      return
    }

    try {
      const wavBlob = await webmToWav(blob)
      const form = new FormData()
      form.append('file', wavBlob, 'audio.wav')
      form.append('model', 'whisper-1')
      form.append('language', 'zh')

      const res = await fetch(`${config.ttsBaseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.ttsApiKey}` },
        body: form,
      })

      if (!res.ok) { onError?.('识别失败: ' + res.status); return }
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('json')) { onError?.('识别服务不可用'); return }

      const { text } = await res.json()
      if (text?.trim()) {
        onResult?.(text.trim())
      } else {
        onError?.('没听清，再说一次？')
      }
    } catch (e) {
      onError?.('识别错误: ' + e.message)
    }
  }

  return {
    isRecording,
    startRecording,
    stopRecording,
  }
}
