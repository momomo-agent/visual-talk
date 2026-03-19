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

  if (retries === 0) {
    img.dataset.retries = '1'
    img.src = getProxiedUrl(originalSrc, 1)
  } else if (retries === 1) {
    img.dataset.retries = '2'
    img.src = getProxiedUrl(originalSrc, 2)
  } else {
    img.style.display = 'none'
  }
}
