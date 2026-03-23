/**
 * Wikipedia Skill — Wikimedia REST API (free, no key)
 * 
 * Provides: get_wikipedia
 */

async function getWikipedia(args) {
  const query = args.query?.trim()
  if (!query) return { error: 'Query required' }

  const lang = args.language || 'en'
  const encoded = encodeURIComponent(query)

  try {
    // Try direct page summary first
    let res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`)
    
    // If not found, try search
    if (res.status === 404) {
      const searchRes = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=1&format=json`)
      const searchData = await searchRes.json()
      const firstResult = searchData?.[1]?.[0]
      if (!firstResult) return { error: `No Wikipedia article found for "${query}"` }
      res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult)}`)
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
