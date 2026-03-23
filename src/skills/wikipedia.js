/**
 * Wikipedia Skill — Wikimedia REST API (free, no key)
 * 
 * Provides: get_wikipedia
 * GFW fallback through fetch.link2web.site
 */

async function fetchWithFallback(url) {
  try {
    const res = await fetch(url)
    if (res.ok) return res
    throw new Error(`${res.status}`)
  } catch (e) {
    // GFW fallback — use fetch proxy
    const proxyUrl = `https://fetch.link2web.site?url=${encodeURIComponent(url)}&mode=json`
    const proxyRes = await fetch(proxyUrl)
    if (!proxyRes.ok) throw new Error(`Proxy also failed: ${proxyRes.status}`)
    return proxyRes
  }
}

async function getWikipedia(args) {
  const query = args.query?.trim()
  if (!query) return { error: 'Query required' }

  const lang = args.language || 'en'
  const encoded = encodeURIComponent(query)

  try {
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`
    let res
    try {
      res = await fetch(summaryUrl)
    } catch (e) {
      // Direct fetch failed (GFW), try proxy for the whole page content
      const proxyUrl = `https://fetch.link2web.site?url=${encodeURIComponent(summaryUrl)}&mode=raw`
      const proxyRes = await fetch(proxyUrl)
      if (!proxyRes.ok) throw new Error(`Wikipedia unreachable: ${e.message}`)
      const data = JSON.parse(await proxyRes.text())
      return {
        title: data.title,
        description: data.description,
        extract: data.extract?.slice(0, 1000),
        thumbnail: data.thumbnail?.source,
        url: data.content_urls?.desktop?.page,
      }
    }

    // Direct worked — check 404 for search fallback
    if (res.status === 404) {
      try {
        const searchRes = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=1&format=json`)
        const searchData = await searchRes.json()
        const firstResult = searchData?.[1]?.[0]
        if (!firstResult) return { error: `No Wikipedia article found for "${query}"` }
        res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult)}`)
      } catch (e) {
        return { error: `Wikipedia search failed: ${e.message}` }
      }
    }

    if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
    const data = await res.json()

    return {
      title: data.title,
      description: data.description,
      extract: data.extract?.slice(0, 1000),
      thumbnail: data.thumbnail?.source,
      url: data.content_urls?.desktop?.page,
    }
  } catch (e) {
    return { error: `Wikipedia failed: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'get_wikipedia',
    description: 'Get Wikipedia article summary, description, and thumbnail. Supports multiple languages. More precise than web_search for factual/encyclopedic queries about people, places, concepts, events.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Article title or search term' },
        language: { type: 'string', enum: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'], description: 'Wikipedia language (default: en)' },
      },
      required: ['query'],
    },
    execute: async (input) => getWikipedia(input),
  },
]

export default { name: 'wikipedia', tools }
