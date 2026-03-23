/**
 * Web Fetch Skill — fetch.link2web.site
 * 
 * Provides: web_fetch
 * No API key needed — public service with CORS
 */

async function fetchUrl(args) {
  const url = args.url
  if (!url) return { error: 'URL is required' }

  const mode = args.mode || 'content'
  const maxChars = args.max_chars || 6000

  const endpoint = `https://fetch.link2web.site?url=${encodeURIComponent(url)}&mode=${mode}&max_chars=${maxChars}`

  try {
    const res = await fetch(endpoint)
    if (!res.ok) throw new Error(`fetch.link2web.site ${res.status}`)

    if (mode === 'json') {
      const data = await res.json()
      return {
        title: data.title,
        description: data.description,
        content: data.content?.slice(0, maxChars),
        url: data.url,
        wordCount: data.wordCount,
      }
    }

    const text = await res.text()
    return { content: text.slice(0, maxChars), url }
  } catch (err) {
    return { error: `Failed to fetch: ${err.message}`, url }
  }
}

export const tools = [
  {
    name: 'web_fetch',
    description: 'Fetch and read the content of a web page. Use when the user shares a URL or you need to read an article, blog post, documentation, or any web page. Returns the page content as clean text/markdown.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        mode: {
          type: 'string',
          enum: ['content', 'summary', 'json'],
          description: 'content = full article text (default), summary = condensed, json = structured with title/description',
        },
        max_chars: {
          type: 'number',
          description: 'Maximum characters to return (default 6000)',
        },
      },
      required: ['url'],
    },
    execute: async (input) => fetchUrl(input),
  },
]

export default { name: 'web-fetch', tools }
