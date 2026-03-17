// ── Tool definitions for LLM ──

const TOOLS_OPENAI = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information, images, news. Use for ANY question needing real-world facts, current events, image URLs, or verification.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          search_depth: { type: 'string', enum: ['basic', 'advanced'] },
          include_images: { type: 'boolean', description: 'Include image URLs' }
        },
        required: ['query']
      }
    }
  }
]

const TOOLS_ANTHROPIC = [
  {
    name: 'web_search',
    description: 'Search the web for information, images, news. Use for ANY question needing real-world facts, current events, image URLs, or verification.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        search_depth: { type: 'string', enum: ['basic', 'advanced'] },
        include_images: { type: 'boolean', description: 'Include image URLs' }
      },
      required: ['query']
    }
  }
]

// ── Execute tools ──

async function executeTool(name, args, tavilyKey) {
  if (name === 'web_search') return await tavilySearch(args, tavilyKey)
  return { error: `Unknown tool: ${name}` }
}

// ── Tavily search with CORS proxy fallback ──

async function tavilySearch(args, apiKey) {
  if (!apiKey) return { error: 'Tavily API key not configured' }

  const payload = {
    api_key: apiKey,
    query: args.query,
    search_depth: args.search_depth || 'basic',
    include_images: args.include_images !== false,
    max_results: 5
  }

  // Try direct first, fallback to proxy on CORS error
  let data
  try {
    data = await tavilyDirect(payload)
  } catch (err) {
    console.warn('Tavily direct failed, trying proxy:', err.message)
    data = await tavilyViaProxy(payload)
  }

  return {
    results: (data.results || []).map(r => ({
      title: r.title, url: r.url, content: r.content?.slice(0, 300)
    })),
    images: (data.images || []).slice(0, 8)
  }
}

async function tavilyDirect(payload) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json()
}

async function tavilyViaProxy(payload) {
  const res = await fetch('https://proxy.link2web.site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://api.tavily.com/search',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'raw'
    })
  })
  const result = await res.json()
  if (!result.success) throw new Error(result.error || `Proxy failed: ${result.status}`)
  const raw = typeof result.body === 'string' ? JSON.parse(result.body) : result.body
  if (result.status >= 400) throw new Error(`Tavily ${result.status}`)
  return raw
}
