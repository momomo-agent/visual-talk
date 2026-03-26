export function parseResponse(text) {
  // Legacy single speech — first match (kept for backward compat)
  const speechMatch = text.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  const speech = speechMatch ? speechMatch[1].trim() : null
  const blocks = []
  const commands = []
  const sketches = []

  // ── Speech segments: track interleaved speech + card associations ──
  // Each segment: { text: "...", charPos: N, blockIndices: [0, 1, ...] }
  const speechSegments = []

  // Collect ALL markers in order (including speech) to track interleaving
  const allMarkers = []
  const markerRegex = /<!--vt:(\w+)\s+/g
  let m
  while ((m = markerRegex.exec(text)) !== null) {
    allMarkers.push({ type: m[1], index: m.index, contentStart: m.index + m[0].length })
  }

  let currentSpeechSegment = null

  for (const marker of allMarkers) {
    const { type, contentStart } = marker

    if (type === 'speech') {
      // Extract speech text (raw text, terminated by -->)
      const endMatch = text.indexOf('-->', contentStart)
      if (endMatch === -1) {
        // Still streaming — partial speech
        currentSpeechSegment = {
          text: text.slice(contentStart).trim(),
          charPos: marker.index,
          blockIndices: [],
        }
      } else {
        currentSpeechSegment = {
          text: text.slice(contentStart, endMatch).trim(),
          charPos: marker.index,
          blockIndices: [],
        }
      }
      if (currentSpeechSegment.text) {
        speechSegments.push(currentSpeechSegment)
      }
      continue
    }

    // Find the JSON object by counting braces
    const jsonStr = extractJSON(text, contentStart)
    if (!jsonStr) continue

    if (type === 'move') {
      try { commands.push({ cmd: 'move', ...JSON.parse(jsonStr) }) } catch {}
      continue
    }
    if (type === 'update') {
      try { commands.push({ cmd: 'update', ...JSON.parse(jsonStr) }) } catch {}
      continue
    }
    if (type === 'dock') {
      try { commands.push({ cmd: 'dock', ...JSON.parse(jsonStr) }) } catch {}
      continue
    }
    if (type === 'undock') {
      try { commands.push({ cmd: 'undock', ...JSON.parse(jsonStr) }) } catch {}
      continue
    }
    if (type === 'sketch') {
      try {
        const sk = JSON.parse(jsonStr)
        if (sk.type === 'line' || sk.type === 'label') continue
        sketches.push(sk)
      } catch {}
      continue
    }
    try {
      const data = JSON.parse(jsonStr)
      const CARD_TYPES = new Set([
        'card', 'metric', 'data', 'steps', 'columns', 'callout', 'code',
        'markdown', 'media', 'embed', 'chart', 'list', 'table', 'map',
        'diagram', 'audio', 'quote', 'profile',
      ])
      if (!CARD_TYPES.has(type)) continue
      const normalizedType = type === 'data' ? 'metric' : type === 'quote' ? 'callout' : type
      if (Array.isArray(data.items) && normalizedType !== 'steps' && normalizedType !== 'chart') {
        data.items = data.items.map(it =>
          typeof it === 'string' ? it : (it.text || it.title || it.label || '')
        )
      }
      if (Array.isArray(data.cols)) {
        data.cols.forEach(c => {
          if (Array.isArray(c.items)) {
            c.items = c.items.map(it =>
              typeof it === 'string' ? it : (it.text || it.title || it.label || '')
            )
          }
        })
      }
      if (normalizedType === 'card' && !data.title && !data.sub && !data.image && (!data.items || data.items.length === 0) && (!data.blocks || data.blocks.length === 0)) {
        continue
      }
      const blockIndex = blocks.length
      blocks.push({ type: normalizedType, data })

      // Associate this block with the current speech segment
      if (currentSpeechSegment) {
        currentSpeechSegment.blockIndices.push(blockIndex)
      }
    } catch {}
  }

  return { speech, blocks, commands, sketches, speechSegments }
}

// Extract a JSON object starting at `pos` in `text` by counting braces.
// Handles strings (including escaped quotes) correctly.
function extractJSON(text, pos) {
  if (text[pos] !== '{') return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = pos; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.substring(pos, i + 1)
      }
    }
  }

  return null // unclosed — still streaming
}
