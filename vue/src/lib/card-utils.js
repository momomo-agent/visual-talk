/**
 * Pure utility functions for card data extraction.
 * No store dependencies — operates on plain card objects.
 */

// Strip emoji, numbering prefixes, and excess punctuation for fuzzy matching
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu
function normalizeForMatch(text) {
  return text
    .replace(EMOJI_RE, '')        // strip emoji
    .replace(/^[\d.)\]]+\s*/, '') // strip leading "1. " "2) " etc
    .replace(/^[-–—•*#]+\s*/, '') // strip leading bullets/hashes
    .trim()
}

/**
 * Extract a human-readable title from any card type.
 * Returns lowercase string.
 */
export function getCardTitle(card) {
  const d = card.data || card
  return (d.title || d.caption || d.text || d.content || d.label || d.code?.slice(0, 30) || '').toLowerCase()
}

/**
 * Match a query against a card title with noise tolerance.
 * Returns: 'exact' | 'partial' | null
 */
export function matchTitle(cardTitle, query) {
  if (!cardTitle || !query) return null
  if (cardTitle === query) return 'exact'

  // Normalize both for fuzzy comparison
  const normCard = normalizeForMatch(cardTitle)
  const normQuery = normalizeForMatch(query)

  if (normCard === normQuery) return 'exact'
  if (normCard.includes(normQuery) || normQuery.includes(normCard)) return 'partial'
  return null
}

/**
 * Extract full text content from a card for LLM context.
 * Returns plain text string (max 200 chars).
 */
export function getCardText(card) {
  const d = card.data || {}
  const parts = []
  if (d.title) parts.push(d.title)
  if (d.sub) parts.push(d.sub)
  if (d.label) parts.push(d.label)
  if (d.value != null) parts.push(String(d.value) + (d.unit || ''))
  if (d.text) parts.push(d.text)
  if (d.content) parts.push(d.content)
  if (d.caption) parts.push(d.caption)
  if (d.code) parts.push(d.code)
  if (d.author) parts.push(d.author)
  if (d.source) parts.push(d.source)
  if (d.footer) parts.push(d.footer)
  if (d.tags?.length) parts.push(d.tags.join(', '))
  if (d.items?.length) {
    d.items.forEach(it => {
      const t = typeof it === 'string' ? it : (it.text || it.title || it.label || '')
      if (t) parts.push(t)
    })
  }
  if (d.cols?.length) {
    d.cols.forEach(c => {
      if (c.name) parts.push(c.name)
      ;(c.items || []).forEach(it => { if (it) parts.push(String(it)) })
    })
  }
  return parts.join('\n').slice(0, 200)
}

/**
 * Build canvas context string for LLM from a card snapshot.
 * @param {Map} snapshot - Map of cardId → card objects (from computeCanvas or canvas.cards)
 * @returns {string|null}
 */
export function buildCanvasContext(snapshot) {
  const entries = Array.from(snapshot.entries())
  if (!entries.length) return null

  const maxDepth = Math.max(...entries.map(([, c]) => c.depth || 0), 0)
  const currentGroup = []
  const olderCards = []

  entries.forEach(([id, card]) => {
    if (card.depth === maxDepth) {
      try {
        currentGroup.push(`<!--vt:${card.type} ${JSON.stringify(card.data)}-->`)
      } catch { }
    } else {
      const title = getCardTitle(card)
      if (title) olderCards.push(`"${title}"`)
    }
  })

  if (!currentGroup.length && !olderCards.length) return null
  let ctx = '[Current canvas state]\n'
  if (currentGroup.length) ctx += `Latest cards:\n${currentGroup.join('\n')}\n`
  if (olderCards.length) ctx += `Older (receding): ${olderCards.join(', ')}\n`
  return ctx
}

/**
 * Build selected cards context for LLM.
 * @param {Map} snapshot - card snapshot
 * @param {Array} selectedIds - array of selected card IDs
 * @returns {string|null}
 */
export function buildSelectedContext(snapshot, selectedIds) {
  if (!selectedIds?.length) return null
  const texts = []
  selectedIds.forEach(id => {
    const card = snapshot.get(id)
    if (card) {
      const text = getCardText(card)
      if (text) texts.push(text)
    }
  })
  return texts.length ? texts.join('\n---\n') : null
}
