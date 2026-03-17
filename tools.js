// ── Tool definitions for LLM ──

const TOOLS_OPENAI = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information, images, news. Use for ANY question about real-world facts, current events, image URLs, or when you need to verify information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          search_depth: { type: 'string', enum: ['basic', 'advanced'], description: 'basic=fast, advanced=thorough' },
          include_images: { type: 'boolean', description: 'Include image URLs in results' }
        },
        required: ['query']
      }
    }
  }
]

const TOOLS_ANTHROPIC = [
  {
    name: 'web_search',
    description: 'Search the web for information, images, news. Use for ANY question about real-world facts, current events, image URLs, or when you need to verify information.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        search_depth: { type: 'string', enum: ['basic', 'advanced'], description: 'basic=fast, advanced=thorough' },
        include_images: { type: 'boolean', description: 'Include image URLs in results' }
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

async function tavilySearch(args, apiKey) {
  if (!apiKey) return { error: 'Tavily API key not configured' }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: args.query,
      search_depth: args.search_depth || 'basic',
      include_images: args.include_images !== false,
      max_results: 5
    })
  })

  if (!res.ok) {
    const text = await res.text()
    return { error: `Tavily ${res.status}: ${text.slice(0, 200)}` }
  }

  const data = await res.json()
  return {
    results: (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      content: r.content?.slice(0, 300)
    })),
    images: (data.images || []).slice(0, 8)
  }
}
