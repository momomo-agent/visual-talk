/**
 * Xiaoyuzhou / Podcast Skill — iTunes Podcast API + RSS (no key needed)
 * 
 * Provides: search_podcast
 * 
 * Strategy:
 * 1. iTunes Podcast API to search podcasts (free, returns feedUrl)
 * 2. Fetch RSS feed to get episodes with audio URLs
 * 
 * Works for any podcast on Apple Podcasts, including 小宇宙 shows
 * (most 小宇宙 podcasts submit to Apple Podcasts for discoverability)
 */

const PROXY_BASE = 'https://proxy.link2web.site/api/proxy'
const ITUNES_PODCAST_URL = 'https://itunes.apple.com/search'

async function fetchWithFallback(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    // GFW/CORS fallback via proxy
    const proxyRes = await fetch(`${PROXY_BASE}?url=${encodeURIComponent(url)}`)
    if (!proxyRes.ok) throw new Error(`Proxy ${proxyRes.status}`)
    return await proxyRes.text()
  }
}

function parseRSS(xml, limit = 5) {
  const episodes = []
  // Extract podcast-level image
  const podImageMatch = xml.match(/<itunes:image\s+href="([^"]+)"/)
  const podImage = podImageMatch?.[1] || null

  // Extract items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) && episodes.length < limit) {
    const item = match[1]
    const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || ''
    const encUrl = item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || ''
    const duration = item.match(/<itunes:duration>(.*?)<\/itunes:duration>/)?.[1] || ''
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
    
    // Episode-level image (if any)
    const epImage = item.match(/<itunes:image\s+href="([^"]+)"/)?.[1] || null
    
    // Description — strip HTML, take first 200 chars
    let desc = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || ''
    desc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)

    if (title) {
      episodes.push({
        title: title.trim(),
        audioUrl: encUrl,
        duration,
        pubDate: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : '',
        description: desc,
        image: epImage || podImage,
        link: link.trim(),
      })
    }
  }
  return { episodes, podImage }
}

async function searchPodcast(args) {
  const query = args.query?.trim()
  if (!query) return { error: 'Search query required' }

  const limit = Math.min(args.limit || 3, 10)
  const episodeLimit = args.episodes || 5

  try {
    // Step 1: Search podcasts via iTunes
    const searchUrl = `${ITUNES_PODCAST_URL}?term=${encodeURIComponent(query)}&media=podcast&limit=${limit}`
    const searchText = await fetchWithFallback(searchUrl)
    const searchData = JSON.parse(searchText)

    if (!searchData.results?.length) return { results: [], message: 'No podcasts found' }

    // Step 2: For each podcast, optionally fetch RSS for episodes
    const results = []
    for (const p of searchData.results) {
      const podcast = {
        name: p.collectionName || p.trackName,
        artist: p.artistName,
        artwork: p.artworkUrl600 || p.artworkUrl100?.replace('100x100', '600x600'),
        genre: p.primaryGenreName,
        episodeCount: p.trackCount,
        feedUrl: p.feedUrl,
        itunesUrl: p.collectionViewUrl,
        episodes: [],
      }

      // Fetch RSS to get episodes with audio URLs
      if (p.feedUrl && args.episodes !== 0) {
        try {
          const rssText = await fetchWithFallback(p.feedUrl)
          const { episodes } = parseRSS(rssText, episodeLimit)
          podcast.episodes = episodes
        } catch (e) {
          podcast.rssError = e.message
        }
      }

      results.push(podcast)
    }

    return { results, source: 'itunes+rss' }
  } catch (e) {
    return { error: `Podcast search failed: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'search_podcast',
    description: 'Search podcasts and get episodes with playable audio URLs. Works for 小宇宙, Apple Podcasts, Spotify-listed shows, and any podcast with an RSS feed. Returns podcast info, cover art, and recent episodes with audio URLs. Use when user asks about podcasts (播客), 小宇宙, or wants to listen to a show.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Podcast name, topic, or host name (Chinese or English)' },
        limit: { type: 'number', description: 'Max podcasts to return (default 3, max 10)' },
        episodes: { type: 'number', description: 'Max episodes per podcast (default 5, set 0 to skip episodes)' },
      },
      required: ['query'],
    },
    execute: async (input) => searchPodcast(input),
  },
]

export default { name: 'podcast', tools }
