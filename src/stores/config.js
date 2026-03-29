import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'visual-talk-config'

export const useConfigStore = defineStore('config', () => {
  const provider = ref('openai')
  const apiKey = ref('')
  const baseUrl = ref('')
  const model = ref('')
  const tavilyKey = ref('')
  const tmdbKey = ref('')
  const showToolCalls = ref(true)
  
  // TTS config
  const ttsEnabled = ref(false)
  const ttsProvider = ref('elevenlabs') // 'openai' | 'elevenlabs'
  const ttsBaseUrl = ref('')
  const ttsApiKey = ref('')
  const ttsModel = ref('')
  const ttsVoice = ref('nova')
  const elevenLabsApiKey = ref('')
  const elevenLabsVoiceId = ref('9lHjugDhwqoxA5MhX0az')
  
  // STT config
  const sttProvider = ref('elevenlabs') // 'openai' | 'elevenlabs'
  const sttBaseUrl = ref('')
  const sttApiKey = ref('')
  const sttModel = ref('')
  const elevenLabsSttApiKey = ref('')
  const elevenLabsSttModel = ref('scribe_v2')
  
  const proxyEnabled = ref(false)
  const proxyUrl = ref('')
  const sketchEnabled = ref(true)
  const sketchFont = ref('Yozai')
  const customSystemPrompt = ref('')
  const imageBaseUrl = ref('')
  const imageApiKey = ref('')
  const imageModel = ref('')
  const theme = ref('mercury')
  const widgetsEnabled = ref(false)

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (s.provider) provider.value = s.provider
      if (s.apiKey) apiKey.value = s.apiKey
      if (s.baseUrl) baseUrl.value = s.baseUrl
      if (s.model) model.value = s.model
      if (s.tavilyKey) tavilyKey.value = s.tavilyKey
      if (s.tmdbKey) tmdbKey.value = s.tmdbKey
      if (s.showToolCalls != null) showToolCalls.value = !!s.showToolCalls
      if (s.ttsEnabled != null) ttsEnabled.value = !!s.ttsEnabled
      if (s.ttsProvider) ttsProvider.value = s.ttsProvider
      if (s.ttsBaseUrl) ttsBaseUrl.value = s.ttsBaseUrl
      if (s.ttsApiKey) ttsApiKey.value = s.ttsApiKey
      if (s.ttsModel) ttsModel.value = s.ttsModel
      if (s.ttsVoice) ttsVoice.value = s.ttsVoice
      if (s.elevenLabsApiKey) elevenLabsApiKey.value = s.elevenLabsApiKey
      if (s.elevenLabsVoiceId) elevenLabsVoiceId.value = s.elevenLabsVoiceId
      if (s.sttProvider) sttProvider.value = s.sttProvider
      if (s.sttBaseUrl) sttBaseUrl.value = s.sttBaseUrl
      if (s.sttApiKey) sttApiKey.value = s.sttApiKey
      if (s.sttModel) sttModel.value = s.sttModel
      if (s.elevenLabsSttApiKey) elevenLabsSttApiKey.value = s.elevenLabsSttApiKey
      if (s.elevenLabsSttModel) elevenLabsSttModel.value = s.elevenLabsSttModel
      if (s.proxyEnabled != null) proxyEnabled.value = !!s.proxyEnabled
      if (s.proxyUrl) proxyUrl.value = s.proxyUrl
      if (s.sketchEnabled != null) sketchEnabled.value = !!s.sketchEnabled
      if (s.sketchFont) sketchFont.value = s.sketchFont
      if (s.customSystemPrompt != null) customSystemPrompt.value = s.customSystemPrompt
      if (s.imageBaseUrl) imageBaseUrl.value = s.imageBaseUrl
      if (s.imageApiKey) imageApiKey.value = s.imageApiKey
      if (s.imageModel) imageModel.value = s.imageModel
      if (s.theme) theme.value = s.theme
      if (s.widgetsEnabled != null) widgetsEnabled.value = !!s.widgetsEnabled
    } catch {}
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      provider: provider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      tavilyKey: tavilyKey.value,
      tmdbKey: tmdbKey.value,
      showToolCalls: showToolCalls.value,
      ttsEnabled: ttsEnabled.value,
      ttsProvider: ttsProvider.value,
      ttsBaseUrl: ttsBaseUrl.value,
      ttsApiKey: ttsApiKey.value,
      ttsModel: ttsModel.value,
      ttsVoice: ttsVoice.value,
      elevenLabsApiKey: elevenLabsApiKey.value,
      elevenLabsVoiceId: elevenLabsVoiceId.value,
      sttProvider: sttProvider.value,
      sttBaseUrl: sttBaseUrl.value,
      sttApiKey: sttApiKey.value,
      sttModel: sttModel.value,
      elevenLabsSttApiKey: elevenLabsSttApiKey.value,
      elevenLabsSttModel: elevenLabsSttModel.value,
      proxyEnabled: proxyEnabled.value,
      proxyUrl: proxyUrl.value,
      sketchEnabled: sketchEnabled.value,
      sketchFont: sketchFont.value,
      customSystemPrompt: customSystemPrompt.value,
      imageBaseUrl: imageBaseUrl.value,
      imageApiKey: imageApiKey.value,
      imageModel: imageModel.value,
      theme: theme.value,
      widgetsEnabled: widgetsEnabled.value,
    }))
  }

  function cleanBaseUrl(url) {
    if (!url) return undefined
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  function ensureHttps(url) {
    if (!url) return url
    if (!/^https?:\/\//i.test(url)) return 'https://' + url
    return url
  }

  function getConfig() {
    return {
      provider: provider.value || 'openai',
      apiKey: apiKey.value.trim(),
      baseUrl: cleanBaseUrl(baseUrl.value),
      model: model.value.trim() || undefined,
      tavilyKey: tavilyKey.value.trim() || undefined,
      tmdbKey: tmdbKey.value.trim() || undefined,
      showToolCalls: showToolCalls.value,
      ttsEnabled: ttsEnabled.value,
      ttsBaseUrl: cleanBaseUrl(ttsBaseUrl.value),
      ttsApiKey: ttsApiKey.value.trim() || undefined,
      ttsModel: ttsModel.value.trim() || undefined,
      ttsVoice: ttsVoice.value || 'nova',
      elevenLabsApiKey: elevenLabsApiKey.value.trim() || undefined,
      elevenLabsVoiceId: elevenLabsVoiceId.value || 'pNInz6obpgDQGcFmaJgB',
      proxyUrl: proxyEnabled.value ? ensureHttps(proxyUrl.value.trim() || 'proxy.link2web.site') : undefined,
      imageBaseUrl: cleanBaseUrl(imageBaseUrl.value) || undefined,
      imageApiKey: imageApiKey.value.trim() || undefined,
      imageModel: imageModel.value.trim() || undefined,
    }
  }

  // Auto-save on any change
  watch([provider, apiKey, baseUrl, model, tavilyKey, tmdbKey, showToolCalls,
    ttsEnabled, ttsProvider, ttsBaseUrl, ttsApiKey, ttsModel, ttsVoice,
    elevenLabsApiKey, elevenLabsVoiceId,
    sttProvider, sttBaseUrl, sttApiKey, sttModel, elevenLabsSttApiKey, elevenLabsSttModel,
    proxyEnabled, proxyUrl, sketchEnabled, sketchFont, customSystemPrompt,
    imageBaseUrl, imageApiKey, imageModel, theme, widgetsEnabled], save)

  // Apply theme class to body
  watch(theme, (t) => {
    document.body.className = t === 'basic' ? '' : `theme-${t}`
  }, { immediate: true })

  // Load on creation
  load()

  return {
    provider, apiKey, baseUrl, model, tavilyKey, tmdbKey, showToolCalls,
    ttsEnabled, ttsProvider, ttsBaseUrl, ttsApiKey, ttsModel, ttsVoice,
    elevenLabsApiKey, elevenLabsVoiceId,
    sttProvider, sttBaseUrl, sttApiKey, sttModel, elevenLabsSttApiKey, elevenLabsSttModel,
    proxyEnabled, proxyUrl, sketchEnabled, sketchFont, customSystemPrompt,
    imageBaseUrl, imageApiKey, imageModel,
    theme,
    widgetsEnabled,
    load, save, getConfig,
  }
})
