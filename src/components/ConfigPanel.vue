<template>
  <div class="config-overlay" :class="{ open: open }" @click.self="$emit('update:open', false)">
    <div class="config-container">
      <div class="config-box">

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
            <span>TTS 语音</span>
          </label>
          <label class="toggle">
            <input type="checkbox" v-model="config.webSpeech" />
            <span>Web Speech 语音识别</span>
          </label>
        </div>
        <template v-if="config.ttsEnabled">
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
                :class="{ active: config.ttsVoice === v, previewing: previewingVoice === v }"
                @click="selectVoice(v)"
              >{{ v }}</button>
            </div>
          </div>
        </template>
      </fieldset>

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
import { useTTS } from '../composables/useTTS.js'
import { SYSTEM } from '../lib/system-prompt.js'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const config = useConfigStore()
const forest = useForestStore()
const tts = useTTS()
const voices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer']
const themes = [
  { id: 'basic', label: 'Basic' },
  { id: 'mercury', label: 'Mercury' },
  { id: 'dot', label: 'Dot' },
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
  tts.playTTS('Hello, this is ' + v)
}
</script>
