<template>
  <div class="config-overlay" :class="{ open: open }" @click.self="$emit('update:open', false)">
    <div class="config-box">
      <div class="field">
        <label>Provider</label>
        <select v-model="config.provider">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </div>
      <div class="field">
        <label>API Key</label>
        <input type="text" v-model="config.apiKey" placeholder="sk-..." />
      </div>
      <div class="field">
        <label>Base URL</label>
        <input v-model="config.baseUrl" placeholder="https://api.openai.com" />
      </div>
      <div class="field">
        <label>Model</label>
        <input v-model="config.model" placeholder="gpt-4o" />
      </div>
      <div class="field">
        <label>Tavily API Key (搜索)</label>
        <input type="text" v-model="config.tavilyKey" placeholder="tvly-..." />
      </div>
      <div class="field">
        <label>
          <input type="checkbox" v-model="config.showToolCalls" style="accent-color:#e8856a" />
          显示 Tool 调用
        </label>
      </div>
      <div class="field">
        <label>
          <input type="checkbox" v-model="config.ttsEnabled" style="accent-color:#e8856a" />
          TTS 语音
        </label>
      </div>
      <div class="field">
        <label>
          <input type="checkbox" v-model="config.webSpeech" style="accent-color:#e8856a" />
          Web Speech (免配置语音识别)
        </label>
      </div>
      <div class="field">
        <label>TTS Base URL</label>
        <input v-model="config.ttsBaseUrl" placeholder="https://yunwu.ai" />
      </div>
      <div class="field">
        <label>TTS API Key</label>
        <input type="text" v-model="config.ttsApiKey" placeholder="sk-..." />
      </div>
      <div class="field">
        <label>TTS Model</label>
        <input v-model="config.ttsModel" placeholder="tts-1-hd" />
      </div>
      <div class="field">
        <label>Voice</label>
        <div class="voice-picker">
          <button
            v-for="v in voices"
            :key="v"
            class="voice-chip"
            :class="{ active: config.ttsVoice === v }"
            @click="config.ttsVoice = v"
          >{{ v }}</button>
        </div>
      </div>
      <div class="field">
        <label>
          <input type="checkbox" v-model="config.proxyEnabled" style="accent-color:#e8856a" />
          Proxy
        </label>
        <input
          v-model="config.proxyUrl"
          placeholder="companion-ui.momomo.dev/api/proxy"
          :disabled="!config.proxyEnabled"
        />
      </div>
      <button class="config-close" @click="$emit('update:open', false)">Done</button>
    </div>
  </div>
</template>

<script setup>
import { useConfigStore } from '../stores/config.js'

defineProps({
  open: { type: Boolean, default: false },
})
defineEmits(['update:open'])

const config = useConfigStore()
const voices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer']
</script>
