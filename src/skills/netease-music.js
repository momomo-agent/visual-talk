/**
 * NetEase Cloud Music Skill — Public API (no key needed)
 * 
 * Provides: search_netease_music
 * 
 * Uses music.163.com/api/cloudsearch/pc via CORS proxy.
 * Play URL: /song/media/outer/url?id=xxx.mp3 (302 → actual mp3)
 */

const PROXY_BASE = 'https://proxy.link2web.site/api/proxy'

async function proxyGet(url) {
  const res = await fetch(`${PROXY_BASE}?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`Proxy ${res.status}`)
  return res.json()
}

async function searchNeteaseMusic(args) {
  const query = args.query?.trim()
  if (!query) return { error: 'Search query required' }

  const limit = Math.min(args.limit || 5, 20)

  try {
    // Search via cloudsearch (works overseas, no encryption)
    const searchUrl = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1&limit=${limit}&offset=0`
    const data = await proxyGet(searchUrl)

    const songs = data.result?.songs
    if (!songs?.length) return { results: [], message: 'No results found' }

    const results = songs.map(s => {
      const durationSec = Math.round((s.dt || 0) / 1000)
      const min = Math.floor(durationSec / 60)
      const sec = durationSec % 60
      const artwork = s.al?.picUrl || null

      return {
        track: s.name,
        artist: (s.ar || []).map(a => a.name).join(' / '),
        album: s.al?.name || '',
        artwork,
        // Direct playable MP3 URL (302 redirect)
        playUrl: `https://music.163.com/song/media/outer/url?id=${s.id}.mp3`,
        duration: `${min}:${sec.toString().padStart(2, '0')}`,
        durationMs: s.dt,
        ncmId: s.id,
        ncmUrl: `https://music.163.com/song?id=${s.id}`,
      }
    })

    return { results, source: 'netease' }
  } catch (e) {
    return { error: `NetEase Music search failed: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'search_netease_music',
    description: 'Search songs on NetEase Cloud Music (网易云音乐). Returns track name, artist, album, cover art, and a playable MP3 URL. **Prefer this over search_music** when the user mentions 网易云, wants Chinese music, or wants playable audio. The playUrl redirects to an actual MP3 — put it in the audio block\'s "url" field.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song, artist, or album name (Chinese or English)' },
        limit: { type: 'number', description: 'Max results (default 5, max 20)' },
      },
      required: ['query'],
    },
    execute: async (input) => searchNeteaseMusic(input),
  },
]

export default { name: 'netease-music', tools }
