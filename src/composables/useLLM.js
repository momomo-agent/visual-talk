import { ref } from 'vue'
import { useConfigStore } from '../stores/config.js'
import { SYSTEM } from '../lib/system-prompt.js'

// Skills
import tmdbSkill from '../skills/tmdb.js'
import tavilySkill from '../skills/tavily.js'

const SKILLS = [tavilySkill, tmdbSkill]

let claw = null
let clawConfigKey = null

/**
 * Expand skills into customTools array for agentic-claw.
 * Each tool.execute receives the skill's config slice.
 */
function buildTools(skills, cfg) {
  const tools = []
  for (const skill of skills) {
    const skillConfig = {
      tavilyKey: cfg.tavilyKey,
      tmdbKey: cfg.tmdbKey,
    }
    for (const tool of skill.tools) {
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

    claw = AgenticClaw.createClaw({
      apiKey: cfg.apiKey,
      provider: cfg.provider || 'openai',
      baseUrl: cfg.baseUrl || undefined,
      model: cfg.model || undefined,
      proxyUrl: cfg.proxyUrl || undefined,
      systemPrompt: SYSTEM,
      maxTokens: 4096,
      stream: true,
      persist: 'localStorage',
      tools: buildTools(SKILLS, cfg),
    })
    clawConfigKey = key
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

    console.log('[LLM] full response:', answer)
    return answer
  }

  return { callLLM, toolLogs }
}
