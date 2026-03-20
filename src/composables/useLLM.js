import { ref } from 'vue'
import { useConfigStore } from '../stores/config.js'
import { SYSTEM } from '../lib/system-prompt.js'

let claw = null
let clawConfigKey = null

// Tavily search implementation
async function tavilySearch(args, apiKey) {
  if (!apiKey) return { error: 'Tavily API key not configured' }
  const payload = {
    api_key: apiKey,
    query: args.query,
    search_depth: args.search_depth || 'basic',
    include_images: args.include_images !== false,
    max_results: 5,
  }
  let data
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Tavily ${res.status}`)
    data = await res.json()
  } catch (err) {
    console.warn('Tavily direct failed, trying proxy:', err.message)
    const res = await fetch('https://proxy.link2web.site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.tavily.com/search',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'raw',
      }),
    })
    const result = await res.json()
    if (!result.success) throw new Error(result.error || `Proxy failed: ${result.status}`)
    data = typeof result.body === 'string' ? JSON.parse(result.body) : result.body
    if (result.status >= 400) throw new Error(`Tavily ${result.status}`)
  }
  return {
    results: (data.results || []).map(r => ({
      title: r.title, url: r.url, content: r.content?.slice(0, 300),
    })),
    images: (data.images || []).slice(0, 8),
  }
}

export function useLLM() {
  const toolLogs = ref([])

  function ensureClaw(cfg) {
    const key = JSON.stringify([cfg.provider, cfg.apiKey, cfg.baseUrl, cfg.model, cfg.proxyUrl])
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
      tools: [{
        name: 'web_search',
        description: 'Search the web for information, images, news. Use for ANY question needing real-world facts, current events, image URLs, or verification.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            search_depth: { type: 'string', enum: ['basic', 'advanced'] },
            include_images: { type: 'boolean', description: 'Include image URLs' },
          },
          required: ['query'],
        },
        execute: async (input) => tavilySearch(input, cfg.tavilyKey),
      }],
    })
    clawConfigKey = key
    return claw
  }

  function addToolLog(text) {
    const id = Date.now() + Math.random()
    toolLogs.value.push({ id, text, fading: false })
    // Keep max 5
    while (toolLogs.value.length > 5) {
      toolLogs.value.shift()
    }
    // Auto fade after 8s
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

    if (!cfg.apiKey) {
      return null
    }

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
        addToolLog(`${data.name}: ${(data.input?.query || data.input?.url || '').slice(0, 60)}`)
      }
    })

    console.log('[LLM] full response:', answer)
    return answer
  }

  return { callLLM, toolLogs }
}
