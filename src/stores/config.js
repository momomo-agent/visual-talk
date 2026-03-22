import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'visual-talk-config'

export const useConfigStore = defineStore('config', () => {
  const provider = ref('openai')
  const apiKey = ref('')
  const baseUrl = ref('')
  const model = ref('')
  const tavilyKey = ref('')
  const showToolCalls = ref(true)
  const ttsEnabled = ref(false)
  const webSpeech = ref(false)
  const ttsBaseUrl = ref('')
  const ttsApiKey = ref('')
  const ttsModel = ref('')
  const ttsVoice = ref('nova')
  const proxyEnabled = ref(false)
  const proxyUrl = ref('')
  const sketchEnabled = ref(true)
  const sketchFont = ref('Yozai')

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (s.provider) provider.value = s.provider
      if (s.apiKey) apiKey.value = s.apiKey
      if (s.baseUrl) baseUrl.value = s.baseUrl
      if (s.model) model.value = s.model
      if (s.tavilyKey) tavilyKey.value = s.tavilyKey
      if (s.showToolCalls != null) showToolCalls.value = !!s.showToolCalls
      if (s.ttsEnabled != null) ttsEnabled.value = !!s.ttsEnabled
      if (s.webSpeech != null) webSpeech.value = !!s.webSpeech
      if (s.ttsBaseUrl) ttsBaseUrl.value = s.ttsBaseUrl
      if (s.ttsApiKey) ttsApiKey.value = s.ttsApiKey
      if (s.ttsModel) ttsModel.value = s.ttsModel
      if (s.ttsVoice) ttsVoice.value = s.ttsVoice
      if (s.proxyEnabled != null) proxyEnabled.value = !!s.proxyEnabled
      if (s.proxyUrl) proxyUrl.value = s.proxyUrl
      if (s.sketchEnabled != null) sketchEnabled.value = !!s.sketchEnabled
      if (s.sketchFont) sketchFont.value = s.sketchFont
    } catch {}
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      provider: provider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      tavilyKey: tavilyKey.value,
      showToolCalls: showToolCalls.value,
      ttsEnabled: ttsEnabled.value,
      webSpeech: webSpeech.value,
      ttsBaseUrl: ttsBaseUrl.value,
      ttsApiKey: ttsApiKey.value,
      ttsModel: ttsModel.value,
      ttsVoice: ttsVoice.value,
      proxyEnabled: proxyEnabled.value,
      proxyUrl: proxyUrl.value,
      sketchEnabled: sketchEnabled.value,
      sketchFont: sketchFont.value,
    }))
  }

  function cleanBaseUrl(url) {
    if (!url) return undefined
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  function getConfig() {
    return {
      provider: provider.value || 'openai',
      apiKey: apiKey.value.trim(),
      baseUrl: cleanBaseUrl(baseUrl.value),
      model: model.value.trim() || undefined,
      tavilyKey: tavilyKey.value.trim() || undefined,
      showToolCalls: showToolCalls.value,
      ttsEnabled: ttsEnabled.value,
      webSpeech: webSpeech.value,
      ttsBaseUrl: cleanBaseUrl(ttsBaseUrl.value),
      ttsApiKey: ttsApiKey.value.trim() || undefined,
      ttsModel: ttsModel.value.trim() || undefined,
      ttsVoice: ttsVoice.value || 'nova',
      proxyUrl: proxyEnabled.value ? (proxyUrl.value.trim() || 'https://companion-ui.momomo.dev/api/proxy') : undefined,
    }
  }

  // Auto-save on any change
  watch([provider, apiKey, baseUrl, model, tavilyKey, showToolCalls,
    ttsEnabled, webSpeech, ttsBaseUrl, ttsApiKey, ttsModel, ttsVoice,
    proxyEnabled, proxyUrl, sketchEnabled, sketchFont], save)

  // Load on creation
  load()

  return {
    provider, apiKey, baseUrl, model, tavilyKey, showToolCalls,
    ttsEnabled, webSpeech, ttsBaseUrl, ttsApiKey, ttsModel, ttsVoice,
    proxyEnabled, proxyUrl, sketchEnabled, sketchFont,
    load, save, getConfig,
  }
})
