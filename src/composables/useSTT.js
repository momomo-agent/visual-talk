import { reactive } from 'vue'
import { useConfigStore } from '../stores/config.js'

/**
 * useSTT — Speech-to-Text via ElevenLabs
 * Push-to-talk: mousedown → start, mouseup → stop
 */
export function useSTT({ tts } = {}) {
  const state = reactive({
    isRecording: false,
    label: '',
    error: '',
    result: '',
    isTranscribing: false,
  })

  let mediaRecorder = null
  let micDownTime = 0
  let micReleased = false

  function startRecording() {
    state.error = ''
    state.result = ''

    if (tts) {
      tts.stopTTS()
      tts.isRecording.value = true
    }
    state.label = '松开发送...'
    startCapture()
  }

  function stopRecording() {
    micReleased = true
    if (tts) tts.isRecording.value = false
    state.label = ''

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }
  }

  async function startCapture() {
    if (mediaRecorder) return
    micDownTime = Date.now()
    micReleased = false

    if (!navigator.mediaDevices?.getUserMedia) {
      state.error = '需要 HTTPS 才能使用麦克风'
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (micReleased) {
        stream.getTracks().forEach(t => t.stop())
        state.error = '长按说话'
        return
      }

      const chunks = []
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorder.ondataavailable = e => chunks.push(e.data)
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const held = Date.now() - micDownTime
        mediaRecorder = null
        state.isRecording = false

        if (held < 300) {
          state.error = '长按说话'
          return
        }

        const blob = new Blob(chunks, { type: 'audio/webm' })
        await transcribe(blob)
      }

      mediaRecorder.start()
      state.isRecording = true
    } catch (e) {
      state.error = '麦克风不可用: ' + e.message
    }
  }

  async function transcribe(blob) {
    const config = useConfigStore()
    const apiKey = config.elevenLabsApiKey
    if (!apiKey) {
      state.error = '请先配置 ElevenLabs API Key'
      return
    }

    state.isTranscribing = true
    try {
      const form = new FormData()
      form.append('file', blob, 'audio.webm')
      form.append('model_id', 'scribe_v2')

      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      })

      if (!res.ok) {
        state.isTranscribing = false
        state.error = '识别失败: ' + res.status
        return
      }

      const result = await res.json()
      const text = result.text?.trim()
      if (text) {
        state.result = text
      } else {
        state.isTranscribing = false
        state.error = '没听清，再说一次？'
      }
    } catch (e) {
      state.isTranscribing = false
      state.error = '识别错误: ' + e.message
    }
  }

  return {
    state,
    startRecording,
    stopRecording,
  }
}
