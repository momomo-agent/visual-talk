const PROXY = 'https://proxy.link2web.site/?url='

/**
 * Three-layer image fallback:
 * 1. Direct URL
 * 2. CORS proxy
 * 3. images.weserv.nl
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
    // First failure: try CORS proxy
    img.dataset.retries = '1'
    img.src = getProxiedUrl(originalSrc, 1)
  } else if (retries === 1) {
    // Second failure: try weserv
    img.dataset.retries = '2'
    img.src = getProxiedUrl(originalSrc, 2)
  } else if (retries === 2) {
    // Third failure: retry original after 2s delay (network flake)
    img.dataset.retries = '3'
    img.removeAttribute('src')
    setTimeout(() => {
      img.src = originalSrc
    }, 2000)
  } else {
    // All retries exhausted — show placeholder
    img.style.objectFit = 'contain'
    img.style.background = 'rgba(0,0,0,0.06)'
    img.style.minHeight = '60px'
    img.removeAttribute('src')
    img.onerror = null
  }
}
