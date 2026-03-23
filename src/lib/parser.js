export function parseResponse(text) {
  const speech = text.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  const blocks = []
  const commands = []
  const sketches = []
  const blockRegex = /<!--vt:(\w+)\s+([\s\S]*?)-->/g
  let m
  while ((m = blockRegex.exec(text)) !== null) {
    if (m[1] === 'speech') continue
    if (m[1] === 'move') {
      try { commands.push({ cmd: 'move', ...JSON.parse(m[2]) }) } catch {}
      continue
    }
    if (m[1] === 'update') {
      try { commands.push({ cmd: 'update', ...JSON.parse(m[2]) }) } catch {}
      continue
    }
    if (m[1] === 'dock') {
      try { commands.push({ cmd: 'dock', ...JSON.parse(m[2]) }) } catch {}
      continue
    }
    if (m[1] === 'undock') {
      try { commands.push({ cmd: 'undock', ...JSON.parse(m[2]) }) } catch {}
      continue
    }
    if (m[1] === 'sketch') {
      try {
        const sk = JSON.parse(m[2])
        // Only allow card-bound sketch types (line/label have no card binding)
        if (sk.type === 'line' || sk.type === 'label') continue
        sketches.push(sk)
      } catch {}
      continue
    }
    try {
      const data = JSON.parse(m[2])
      const type = m[1]
      // Skip non-card types (e.g. web_search tool results that LLM echoes)
      const CARD_TYPES = new Set([
        'card', 'metric', 'data', 'steps', 'columns', 'callout', 'code',
        'markdown', 'media', 'embed', 'chart', 'list', 'table', 'map',
        'diagram', 'audio', 'quote',
      ])
      if (!CARD_TYPES.has(type)) continue
      // Normalize aliases
      const normalizedType = type === 'data' ? 'metric' : type === 'quote' ? 'callout' : type
      // Normalize items to string arrays for card/list types
      // Steps items are {time, title, detail} objects — don't flatten them
      // Chart items are {label, value} objects — don't flatten them either
      if (Array.isArray(data.items) && normalizedType !== 'steps' && normalizedType !== 'chart') {
        data.items = data.items.map(it =>
          typeof it === 'string' ? it : (it.text || it.title || it.label || '')
        )
      }
      // Normalize column items too
      if (Array.isArray(data.cols)) {
        data.cols.forEach(c => {
          if (Array.isArray(c.items)) {
            c.items = c.items.map(it =>
              typeof it === 'string' ? it : (it.text || it.title || it.label || '')
            )
          }
        })
      }
      // Skip empty cards — no title, no items, no image, no content
      if (normalizedType === 'card' && !data.title && !data.sub && !data.image && (!data.items || data.items.length === 0)) {
        continue
      }
      blocks.push({ type: normalizedType, data })
    } catch {}
  }
  return { speech: speech ? speech[1].trim() : null, blocks, commands, sketches }
}
