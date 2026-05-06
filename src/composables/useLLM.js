import { ref } from 'vue'
import { useConfigStore } from '../stores/config.js'
import { SYSTEM, getSystemPrompt } from '../lib/system-prompt.js'

// Skills
import tmdbSkill from '../skills/tmdb.js'
import tavilySkill from '../skills/tavily.js'
import webFetchSkill from '../skills/web-fetch.js'
import weatherSkill from '../skills/weather.js'
import calculateSkill from '../skills/calculate.js'
import locationSkill from '../skills/location.js'
import imageGenSkill from '../skills/image-gen.js'
import stockSkill from '../skills/stock.js'
import wikipediaSkill from '../skills/wikipedia.js'
import musicSkill from '../skills/music.js'
import neteaseSkill from '../skills/netease-music.js'
import podcastSkill from '../skills/podcast.js'

const SKILLS = [tavilySkill, tmdbSkill, webFetchSkill, weatherSkill, calculateSkill, locationSkill, imageGenSkill, stockSkill, wikipediaSkill, musicSkill, neteaseSkill, podcastSkill]

let claw = null
let clawConfigKey = null

/**
 * Expand skills into customTools array for agentic-claw.
 * Each tool.execute receives the skill's config slice.
 * Tools with requiresConfig are only registered when their config is present.
 */
function buildTools(skills, cfg) {
  const tools = []
  const skillConfig = {
    tavilyKey: cfg.tavilyKey,
    tmdbKey: cfg.tmdbKey,
    imageBaseUrl: cfg.imageBaseUrl,
    imageApiKey: cfg.imageApiKey,
    imageModel: cfg.imageModel,
    proxyUrl: 'https://proxy.link2web.site',  // Always available for GFW fallback
  }
  for (const skill of skills) {
    for (const tool of skill.tools) {
      // Skip tools whose required config is missing
      if (tool.requiresConfig && !tool.requiresConfig(skillConfig)) continue
      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: (input) => tool.execute(input, skillConfig),
      })
    }
  }
  return tools
}

export function useLLM() {
  const toolLogs = ref([])

  function ensureClaw(cfg) {
    const key = JSON.stringify([cfg.provider, cfg.apiKey, cfg.baseUrl, cfg.model, cfg.proxyUrl, cfg.tmdbKey])
    if (claw && clawConfigKey === key) return claw

    if (claw) claw.destroy()

    // Make agenticAsk available for claw
    if (window.AgenticCore) {
      globalThis.agenticAsk = window.AgenticCore.agenticAsk
    }

    const AgenticClaw = window.AgenticClaw
    if (!AgenticClaw) {
      throw new Error('AgenticClaw not loaded. Check CDN script tags.')
    }

    const now = new Date()
    const timeStr = now.toLocaleString('zh-CN', { 
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    const configStore = useConfigStore()
    const basePrompt = configStore.customSystemPrompt || getSystemPrompt({ widgetsEnabled: configStore.widgetsEnabled })
    const systemPrompt = `${basePrompt}\n\nCurrent time: ${timeStr}`

    claw = AgenticClaw.createClaw({
      apiKey: cfg.apiKey,
      provider: cfg.provider || 'openai',
      baseUrl: cfg.baseUrl || undefined,
      model: cfg.model || undefined,
      proxyUrl: cfg.proxyUrl || undefined,
      systemPrompt,
      maxTokens: 4096,
      stream: true,
      persist: 'localStorage',
      tools: buildTools(SKILLS, cfg),
      parallel: true,
    })
    clawConfigKey = key

    // Fire-and-forget warmup: pre-heat connection + prompt cache
    claw.warmup().then(r => {
      if (r.ok) console.log(`[warmup] ${r.provider} ${r.ms}ms — cache_created: ${r.cacheCreated ?? 'n/a'}, cache_hit: ${r.cacheHit ?? 'n/a'}`)
      else console.warn('[warmup]', r.reason || r.error)
    }).catch(e => console.warn('[warmup] failed:', e.message))

    return claw
  }

  function addToolLog(text) {
    const id = Date.now() + Math.random()
    toolLogs.value.push({ id, text, fading: false })
    while (toolLogs.value.length > 5) toolLogs.value.shift()
    setTimeout(() => {
      const item = toolLogs.value.find(l => l.id === id)
      if (item) {
        item.fading = true
        setTimeout(() => {
          const idx = toolLogs.value.findIndex(l => l.id === id)
          if (idx >= 0) toolLogs.value.splice(idx, 1)
        }, 400)
      }
    }, 8000)
  }

  async function callLLM(prompt, onToken, onSpeech) {
    const configStore = useConfigStore()
    const cfg = configStore.getConfig()

    if (!cfg.apiKey) return null

    const c = ensureClaw(cfg)
    let accumulated = ''
    let speechFired = false

    const { answer } = await c.chat(prompt, (type, data) => {
      if (type === 'token' && data.text) {
        accumulated += data.text
        if (onToken) onToken(accumulated)

        if (!speechFired && onSpeech) {
          const sm = accumulated.match(/<!--vt:speech\s+([\s\S]*?)-->/)
          if (sm) {
            speechFired = true
            onSpeech(sm[1].trim())
          }
        }
      }
      if (type === 'tool' && cfg.showToolCalls) {
        addToolLog(`${data.name}: ${(data.input?.query || data.input?.movie_id || '').toString().slice(0, 60)}`)
      }
    })

    
    return answer
  }

  return { callLLM, toolLogs }
}
