<template>
  <div class="config-overlay" :class="{ open: open }" @click.self="$emit('update:open', false)">
    <div class="config-container">
      <div class="config-box">

      <!-- ═══ Theme ═══ -->
      <fieldset class="config-section">
        <legend>🎨 主题</legend>
        <div class="voice-picker">
          <button
            v-for="t in themes"
            :key="t.id"
            class="voice-chip theme-chip"
            :class="{ active: config.theme === t.id }"
            @click="config.theme = t.id"
          >{{ t.label }}</button>
        </div>
      </fieldset>

      <!-- ═══ LLM ═══ -->
      <fieldset class="config-section">
        <legend>🧠 语言模型</legend>
        <div class="field">
          <label>Provider</label>
          <select v-model="config.provider">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <div class="field">
          <label>Base URL</label>
          <input v-model="config.baseUrl" placeholder="https://api.openai.com" />
        </div>
        <div class="field">
          <label>API Key</label>
          <input type="text" v-model="config.apiKey" placeholder="sk-..." />
        </div>
        <div class="field">
          <label>Model</label>
          <input v-model="config.model" placeholder="gpt-4o" />
        </div>
      </fieldset>

      <!-- ═══ Tools ═══ -->
      <fieldset class="config-section">
        <legend>🔧 工具 API</legend>
        <div class="field">
          <label>Tavily Key <span class="hint">搜索</span></label>
          <input type="text" v-model="config.tavilyKey" placeholder="tvly-..." />
        </div>
        <div class="field">
          <label>TMDB Key <span class="hint">电影</span></label>
          <input type="text" v-model="config.tmdbKey" placeholder="免费 themoviedb.org" />
        </div>
        <p class="section-note">天气 / 计算 / 定位 / 股票 / 维基 / 音乐 — 免费无需配置</p>
      </fieldset>

      <!-- ═══ Image Gen ═══ -->
      <fieldset class="config-section">
        <legend>🎨 图片生成</legend>
        <div class="field">
          <label>Base URL</label>
          <input type="text" v-model="config.imageBaseUrl" placeholder="https://api.openai.com" />
        </div>
        <div class="field">
          <label>API Key</label>
          <input type="text" v-model="config.imageApiKey" placeholder="sk-..." />
        </div>
        <div class="field">
          <label>Model</label>
          <input type="text" v-model="config.imageModel" placeholder="dall-e-3" />
        </div>
      </fieldset>

      <!-- ═══ Voice ═══ -->
      <fieldset class="config-section">
        <legend>🎙️ 语音</legend>
        <div class="field row">
          <label class="toggle">
            <input type="checkbox" v-model="config.ttsEnabled" />
            <span>启用语音</span>
          </label>
        </div>
        <template v-if="config.ttsEnabled">
          <div class="field">
            <label>TTS Provider</label>
            <select v-model="config.ttsProvider">
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </div>
          <template v-if="config.ttsProvider === 'openai'">
            <div class="field">
              <label>Base URL</label>
              <input v-model="config.ttsBaseUrl" placeholder="https://api.openai.com" />
            </div>
            <div class="field">
              <label>API Key</label>
              <input type="text" v-model="config.ttsApiKey" placeholder="sk-..." />
            </div>
            <div class="field">
              <label>Model</label>
              <input v-model="config.ttsModel" placeholder="tts-1" />
            </div>
            <div class="field">
              <label>Voice</label>
              <select v-model="config.ttsVoice">
                <option value="alloy">Alloy</option>
                <option value="echo">Echo</option>
                <option value="fable">Fable</option>
                <option value="onyx">Onyx</option>
                <option value="nova">Nova</option>
                <option value="shimmer">Shimmer</option>
              </select>
            </div>
          </template>
          <template v-else>
            <div class="field">
              <label>API Key</label>
              <input type="text" v-model="config.elevenLabsApiKey" placeholder="sk_..." />
            </div>
            <div class="field">
              <label>Voice</label>
              <select v-model="config.elevenLabsVoiceId" @change="previewVoice">
                <option value="93nuHbke4dTER9x2pDwE">Adam</option>
                <option value="9lHjugDhwqoxA5MhX0az">Anna Su</option>
                <option value="bhJUNIXWQQ94l8eI2VUf">Amy</option>
                <option value="rAmra0SCIYOxYmRNDSm3">Lana Weiss</option>
                <option value="dCnu06FiOZma2KVNUoPZ">Mila</option>
              </select>
            </div>
          </template>
          <div class="field">
            <label>STT Provider</label>
            <select v-model="config.sttProvider">
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </div>
          <template v-if="config.sttProvider === 'openai'">
            <div class="field">
              <label>Base URL</label>
              <input v-model="config.sttBaseUrl" placeholder="https://api.openai.com" />
            </div>
            <div class="field">
              <label>API Key</label>
              <input type="text" v-model="config.sttApiKey" placeholder="sk-..." />
            </div>
            <div class="field">
              <label>Model</label>
              <input v-model="config.sttModel" placeholder="whisper-1" />
            </div>
          </template>
          <template v-else>
            <div class="field">
              <label>API Key</label>
              <input type="text" v-model="config.elevenLabsSttApiKey" placeholder="sk_..." />
            </div>
            <div class="field">
              <label>Model</label>
              <input v-model="config.elevenLabsSttModel" placeholder="scribe_v2" />
            </div>
          </template>
        </template>
      </fieldset>

      <!-- ═══ Display ═══ -->
      <fieldset class="config-section">
        <legend>⚙️ 显示</legend>
        <div class="field row">
          <label class="toggle">
            <input type="checkbox" v-model="config.showToolCalls" />
            <span>显示 Tool 调用</span>
          </label>
          <label class="toggle">
            <input type="checkbox" v-model="config.sketchEnabled" />
            <span>Sketch 手绘标注</span>
          </label>
          <label class="toggle">
            <input type="checkbox" v-model="config.widgetsEnabled" />
            <span>交互式 Widget</span>
          </label>
        </div>
        <div class="field" v-if="config.sketchEnabled">
          <label>标注字体</label>
          <select v-model="config.sketchFont" class="input">
            <option value="Yozai">悠哉字體（简繁日英）</option>
            <option value="LXGWWenKai">霞鹜文楷（简繁日英）</option>
            <option value="ChenYuluoyan">辰宇落雁體（仅繁体）</option>
          </select>
        </div>
      </fieldset>

      <!-- ═══ Network ═══ -->
      <fieldset class="config-section">
        <legend>🌐 网络</legend>
        <div class="field row">
          <label class="toggle">
            <input type="checkbox" v-model="config.proxyEnabled" />
            <span>Proxy</span>
          </label>
          <input
            v-model="config.proxyUrl"
            placeholder="proxy.link2web.site"
            :disabled="!config.proxyEnabled"
            style="flex:1"
          />
        </div>
      </fieldset>

      <button class="config-danger" @click="clearMemory">清除记忆</button>
      <button class="config-close" @click="$emit('update:open', false)">Done</button>
    </div>
    <div class="prompt-box">
      <label class="prompt-label">System Prompt <span class="prompt-hint">编辑后生效，Reset 恢复默认</span></label>
      <textarea
        class="prompt-textarea"
        :value="config.customSystemPrompt || defaultPrompt"
        @input="config.customSystemPrompt = $event.target.value"
      ></textarea>
      <button class="prompt-reset" @click="resetPrompt">Reset</button>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useConfigStore } from '../stores/config.js'
import { useForestStore } from '../stores/forest.js'
import { SYSTEM } from '../lib/system-prompt.js'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'preview-voice'])

const config = useConfigStore()
const forest = useForestStore()
const voices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer']
const themes = [
  { id: 'basic', label: 'Basic' },
  { id: 'mercury', label: 'Mercury' },
  { id: 'dot', label: 'Dot' },
  { id: 'sunny', label: '☀ Sunny' },
  { id: 'rainy', label: '🌧 Rainy' },
  { id: 'moonlight', label: '🌙 Moonlight' },
  { id: 'snowy', label: '❄ Snowy' },
  { id: 'golden', label: '🌅 Golden' },
]
const previewingVoice = ref('')
const defaultPrompt = SYSTEM

function resetPrompt() {
  config.customSystemPrompt = ''
}

function clearMemory() {
  if (!window.confirm('确认清除所有对话记忆？此操作不可撤销。')) return
  forest.clearAll()
  emit('update:open', false)
}

function selectVoice(v) {
  config.ttsVoice = v
  previewingVoice.value = v
  setTimeout(() => { previewingVoice.value = '' }, 600)
  emit('preview-voice', 'Hello, this is ' + v)
}

function previewVoice() {
  const voiceNames = {
    '93nuHbke4dTER9x2pDwE': 'Adam',
    '9lHjugDhwqoxA5MhX0az': 'Anna Su',
    'bhJUNIXWQQ94l8eI2VUf': 'Amy',
    'rAmra0SCIYOxYmRNDSm3': 'Lana Weiss',
    'dCnu06FiOZma2KVNUoPZ': 'Mila'
  }
  const name = voiceNames[config.elevenLabsVoiceId] || 'Visual Talk'
  emit('preview-voice', `这里是Visual Talk，我是${name}`)
}
</script>
