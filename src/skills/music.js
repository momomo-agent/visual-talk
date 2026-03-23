/**
 * Music Skill — iTunes Search API (free, no key)
 * 
 * Provides: search_music
 */

async function searchMusic(args) {
  const query = args.query?.trim()
  if (!query) return { error: 'Search query required' }

  const limit = args.limit || 5
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`

  try {
    let data
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`iTunes ${res.status}`)
      data = await res.json()
    } catch (e) {
      // GFW fallback
      const proxyRes = await fetch('https://proxy.link2web.site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'GET', mode: 'raw' }),
      })
      const proxyData = await proxyRes.json()
      if (!proxyData.success) throw new Error(proxyData.error || 'Proxy failed')
      data = typeof proxyData.body === 'string' ? JSON.parse(proxyData.body) : proxyData.body
    }

    return {
      results: (data.results || []).map(t => ({
        track: t.trackName,
        artist: t.artistName,
        album: t.collectionName,
        artwork: t.artworkUrl100?.replace('100x100', '600x600'),
        previewUrl: t.previewUrl,
        genre: t.primaryGenreName,
        releaseDate: t.releaseDate?.slice(0, 10),
        durationMs: t.trackTimeMillis,
        trackUrl: t.trackViewUrl,
      })),
    }
  } catch (e) {
    return { error: `Music search failed: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'search_music',
    description: 'Search for songs via iTunes. Returns track name, artist, album, cover art URL (high-res), 30-second preview audio URL, and genre. Use for music recommendations, "play me a song", or any music-related query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song, artist, or album name' },
        limit: { type: 'number', description: 'Max results (default 5, max 25)' },
      },
      required: ['query'],
    },
    execute: async (input) => searchMusic(input),
  },
]

export default { name: 'music', tools }
