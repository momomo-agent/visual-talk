export function parseResponse(text) {
  const speech = text.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  const blocks = []
  const commands = []
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
    try { blocks.push({ type: m[1], data: JSON.parse(m[2]) }) } catch {}
  }
  return { speech: speech ? speech[1].trim() : null, blocks, commands }
}
