import { useConfigStore } from '../stores/config.js'
import { tmdbFetch, posterUrl } from '../skills/tmdb.js'

const PROXY = 'https://proxy.link2web.site/?url='

/**
 * Three-layer image fallback:
 * 1. Direct URL
 * 2. CORS proxy
 * 3. images.weserv.nl
 * 4. TMDB search (if card has a title — movie/show poster)
 */
export function getProxiedUrl(originalUrl, retryLevel = 0) {
  if (!originalUrl) return ''
  if (retryLevel === 1) {
    return PROXY + encodeURIComponent(originalUrl)
  }
  if (retryLevel === 2) {
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(originalUrl)
  }
  return originalUrl
}

export function handleImageError(event) {
  const img = event.target
  const retries = parseInt(img.dataset.retries || '0')
  const originalSrc = img.dataset.originalSrc || img.src

  if (!img.dataset.originalSrc) img.dataset.originalSrc = originalSrc

  if (retries === 0) {
    img.dataset.retries = '1'
    img.src = getProxiedUrl(originalSrc, 1)
  } else if (retries === 1) {
    img.dataset.retries = '2'
    img.src = getProxiedUrl(originalSrc, 2)
  } else if (retries === 2) {
    // Third failure: try TMDB search based on nearby card title
    img.dataset.retries = '3'
    tryTmdbFallback(img)
  } else {
    // All retries exhausted — show placeholder
    img.style.objectFit = 'contain'
    img.style.background = 'rgba(0,0,0,0.06)'
    img.style.minHeight = '60px'
    img.removeAttribute('src')
    img.onerror = null
  }
}

async function tryTmdbFallback(img) {
  // Find card title from DOM context
  const card = img.closest('.v-block')
  const titleEl = card?.querySelector('h2')
  const title = titleEl?.textContent?.trim()

  if (!title) {
    // No title to search — give up
    img.dataset.retries = '4'
    img.removeAttribute('src')
    img.onerror = null
    return
  }

  try {
    const config = useConfigStore()
    const apiKey = config.tmdbKey
    if (!apiKey) {
      img.dataset.retries = '4'
      img.removeAttribute('src')
      img.onerror = null
      return
    }

    const proxyUrl = (config.proxyEnabled && config.proxyUrl)
      ? config.proxyUrl
      : 'https://proxy.link2web.site'  // Always have a proxy for TMDB (GFW)

    // Search movie first, then TV
    let poster = null
    const movieData = await tmdbFetch('/search/movie', apiKey, { query: title }, proxyUrl)
    if (movieData?.results?.[0]?.poster_path) {
      poster = posterUrl(movieData.results[0].poster_path)
    } else {
      const tvData = await tmdbFetch('/search/tv', apiKey, { query: title }, proxyUrl)
      if (tvData?.results?.[0]?.poster_path) {
        poster = posterUrl(tvData.results[0].poster_path)
      }
    }

    if (poster) {
      img.src = poster
    } else {
      img.dataset.retries = '4'
      img.removeAttribute('src')
      img.onerror = null
    }
  } catch (e) {
    console.warn('[imageProxy] TMDB fallback failed:', e)
    img.dataset.retries = '4'
    img.removeAttribute('src')
    img.onerror = null
  }
}
