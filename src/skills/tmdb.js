/**
 * TMDB Skill — Movie & TV search via The Movie Database API
 * 
 * Provides: search_movie, get_movie_detail
 * Config: tmdbKey (API v3 key, free at themoviedb.org)
 */

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG = 'https://image.tmdb.org/t/p'

// Genre ID → name mapping (TMDB uses IDs in search results)
const GENRES = {
  28:'动作',12:'冒险',16:'动画',35:'喜剧',80:'犯罪',
  99:'纪录',18:'剧情',10751:'家庭',14:'奇幻',36:'历史',
  27:'恐怖',10402:'音乐',9648:'悬疑',10749:'爱情',
  878:'科幻',10770:'电视电影',53:'惊悚',10752:'战争',37:'西部',
}

export async function tmdbFetch(path, apiKey, params = {}, proxyUrl) {
  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'zh-CN')
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v)
  })

  const targetUrl = url.toString()

  // Try direct first, fall back to proxy (GFW blocks TMDB)
  try {
    const res = await fetch(targetUrl)
    if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`)
    return res.json()
  } catch (err) {
    if (!proxyUrl) throw err
    console.warn('TMDB direct failed, trying proxy:', err.message)
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, method: 'GET', mode: 'raw' }),
    })
    const result = await res.json()
    if (!result.success) throw new Error(result.error || `Proxy failed: ${result.status}`)
    return typeof result.body === 'string' ? JSON.parse(result.body) : result.body
  }
}

export function posterUrl(path, size = 'w500') {
  return path ? `${TMDB_IMG}/${size}${path}` : null
}

export const tools = [
  {
    name: 'search_movie',
    description: 'Search movies via TMDB database. Returns real poster image URLs (from image.tmdb.org CDN), accurate ratings, release dates, genres, and overviews. Poster URLs from this tool are reliable and will actually load — unlike guessed URLs which return 404.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Movie search query (title, keyword, actor name)' },
        year: { type: 'number', description: 'Filter by release year (optional)' },
      },
      required: ['query'],
    },
    requiresConfig: (cfg) => !!cfg?.tmdbKey,
    execute: async (input, config) => {
      if (!config?.tmdbKey) return { error: 'TMDB API key not configured. Add it in Settings.' }
      const data = await tmdbFetch('/search/movie', config.tmdbKey, {
        query: input.query,
        year: input.year,
      }, config.proxyUrl)
      return {
        results: (data.results || []).slice(0, 6).map(m => ({
          id: m.id,
          title: m.title,
          originalTitle: m.original_title,
          year: m.release_date?.slice(0, 4),
          overview: m.overview?.slice(0, 150),
          rating: m.vote_average,
          voteCount: m.vote_count,
          poster: posterUrl(m.poster_path),
          backdrop: posterUrl(m.backdrop_path, 'w780'),
          genres: (m.genre_ids || []).map(id => GENRES[id] || id),
        })),
        totalResults: data.total_results,
      }
    },
  },

  {
    name: 'get_movie_detail',
    description: 'Get detailed info about a specific movie: full cast, crew, runtime, budget. Use after search_movie when user wants more details.',
    parameters: {
      type: 'object',
      properties: {
        movie_id: { type: 'number', description: 'TMDB movie ID (from search_movie results)' },
      },
      required: ['movie_id'],
    },
    requiresConfig: (cfg) => !!cfg?.tmdbKey,
    execute: async (input, config) => {
      if (!config?.tmdbKey) return { error: 'TMDB API key not configured' }
      const m = await tmdbFetch(`/movie/${input.movie_id}`, config.tmdbKey, {
        append_to_response: 'credits',
      }, config.proxyUrl)
      return {
        title: m.title,
        originalTitle: m.original_title,
        year: m.release_date?.slice(0, 4),
        runtime: m.runtime,
        genres: m.genres?.map(g => g.name),
        overview: m.overview,
        rating: m.vote_average,
        voteCount: m.vote_count,
        poster: posterUrl(m.poster_path),
        backdrop: posterUrl(m.backdrop_path, 'w780'),
        budget: m.budget,
        revenue: m.revenue,
        tagline: m.tagline,
        director: m.credits?.crew?.find(c => c.job === 'Director')?.name,
        cast: m.credits?.cast?.slice(0, 8).map(c => ({
          name: c.name,
          character: c.character,
          photo: posterUrl(c.profile_path, 'w185'),
        })),
      }
    },
  },

  {
    name: 'search_tv',
    description: 'Search TV shows/series via TMDB database. Returns real poster URLs, ratings, and overviews. Use this for reliable show data and poster images.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'TV show search query' },
      },
      required: ['query'],
    },
    requiresConfig: (cfg) => !!cfg?.tmdbKey,
    execute: async (input, config) => {
      if (!config?.tmdbKey) return { error: 'TMDB API key not configured' }
      const data = await tmdbFetch('/search/tv', config.tmdbKey, { query: input.query }, config.proxyUrl)
      return {
        results: (data.results || []).slice(0, 6).map(s => ({
          id: s.id,
          title: s.name,
          originalTitle: s.original_name,
          firstAir: s.first_air_date?.slice(0, 4),
          overview: s.overview?.slice(0, 150),
          rating: s.vote_average,
          poster: posterUrl(s.poster_path),
          genres: (s.genre_ids || []).map(id => GENRES[id] || id),
        })),
      }
    },
  },
]

export default { name: 'tmdb', tools }
