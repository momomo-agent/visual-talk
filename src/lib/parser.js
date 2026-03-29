export function parseResponse(text) {
  // Extract first speech for backward compat
  const speechMatch = text.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  const speech = speechMatch ? speechMatch[1].trim() : null
  
  const blocks = []
  const commands = []
  const sketches = []
  const speechSegments = [] // [{ text, charPos, blockIndices }]

  // Find all markers in order to track interleaving
  const markerRegex = /<!--vt:(\w+)\s+/g
  let m
  while ((m = markerRegex.exec(text)) !== null) {
    const type = m[1]
    const jsonStart = m.index + m[0].length

    if (type === 'speech') {
      // Extract speech text (not JSON)
      const endIdx = text.indexOf('-->', jsonStart)
      if (endIdx > jsonStart) {
        const speechText = text.substring(jsonStart, endIdx).trim()
        speechSegments.push({
          text: speechText,
          charPos: m.index,
          blockIndices: [], // will be filled as we parse following blocks
        })
      }
      continue
    }

    // Find the JSON object by counting braces
    const jsonStr = extractJSON(text, jsonStart)
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
      console.log('[parser] Parsed card:', type, data)
      const normalizedType = type === 'data' ? 'metric' : type === 'quote' ? 'callout' : type
      
      // Fix diagram code: replace literal \n with actual newlines
      if (normalizedType === 'diagram' && data.code) {
        data.code = data.code.replace(/\\n/g, '\n')
      }
      
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
        console.log('[parser] Skipping empty card:', data)
        continue
      }
      blocks.push({ type: normalizedType, data })
      
      // Associate this block with the most recent speech segment
      if (speechSegments.length > 0) {
        const lastSeg = speechSegments[speechSegments.length - 1]
        lastSeg.blockIndices.push(blocks.length - 1)
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
