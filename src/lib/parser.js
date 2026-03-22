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
    if (m[1] === 'sketch') {
      try { sketches.push(JSON.parse(m[2])) } catch {}
      continue
    }
    try {
      const data = JSON.parse(m[2])
      const type = m[1]
      // Normalize items to string arrays for card/list types
      // Steps items are {time, title, detail} objects — don't flatten them
      // Chart items are {label, value} objects — don't flatten them either
      if (Array.isArray(data.items) && type !== 'steps' && type !== 'chart') {
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
      blocks.push({ type, data })
    } catch {}
  }
  return { speech: speech ? speech[1].trim() : null, blocks, commands, sketches }
}
