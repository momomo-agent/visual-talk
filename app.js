// ── Visual Talk — AI speaks through UI ──

const $ = id => document.getElementById(id)
const STORAGE_KEY = 'visual-talk-config'

const SYSTEM = `You are Visual Talk — an AI that expresses itself by placing holographic cards in a 3D space.

The screen is a window into a 3D environment. Cards float at different depths, like a holographic display.

When you respond, output:

1. **Speech** (optional): A whisper (under 15 words). <!--vt:speech text-->

2. **Visual blocks** with 3D position: <!--vt:TYPE JSON-->

Every block MUST include layout:
- "x": horizontal % (0=left, 100=right)
- "y": vertical % (0=top, 100=bottom)  
- "z": depth (-100=far back, 0=neutral, 100=close to viewer)
- "w": width % (15-50)

Depth guidelines:
- z: 40-80 = hero/primary content (large, bright, close)
- z: -10 to 30 = secondary content (normal)
- z: -80 to -20 = ambient/context (smaller, dimmer, further back)

Available types:
- card: {"x":5,"y":8,"z":50,"w":35,"title":"","sub":"","image":"url","tags":[],"items":[],"footer":""}
- metric: {"x":50,"y":10,"z":20,"w":18,"value":"42","label":"Score","unit":"%"}
- steps: {"x":5,"y":40,"z":0,"w":35,"title":"","items":[{"time":"","title":"","detail":""}]}
- columns: {"x":10,"y":15,"z":10,"w":45,"title":"","cols":[{"name":"A","items":[""]}]}
- callout: {"x":30,"y":50,"z":-20,"w":35,"text":"quote","author":"","source":""}
- code: {"x":10,"y":60,"z":0,"w":40,"code":"","language":""}
- markdown: {"x":10,"y":10,"z":0,"w":40,"content":"# text"}
- media: {"x":5,"y":5,"z":60,"w":40,"url":"image-url","caption":""}

Layout rules:
- Primary content: center-left, high z (close)
- Metrics: spread horizontally, medium z
- Quotes/context: offset to side, low z (far)
- Create depth — don't put everything at z:0
- Think holographic display, not flat webpage`

// ── Config ──
function loadConfig() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (s.provider) $('provider').value = s.provider
    if (s.apiKey) $('apiKey').value = s.apiKey
    if (s.baseUrl) $('baseUrl').value = s.baseUrl
    if (s.model) $('model').value = s.model
    if (s.proxyUrl) $('proxyUrl').value = s.proxyUrl
    $('proxyEnabled').checked = !!s.proxyEnabled
    $('proxyUrl').disabled = !s.proxyEnabled
  } catch {}
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    provider: $('provider').value,
    apiKey: $('apiKey').value,
    baseUrl: $('baseUrl').value,
    model: $('model').value,
    proxyUrl: $('proxyUrl').value,
    proxyEnabled: $('proxyEnabled').checked,
  }))
}

function getConfig() {
  const proxyEnabled = $('proxyEnabled').checked
  return {
    provider: $('provider').value || 'openai',
    apiKey: $('apiKey').value.trim(),
    baseUrl: $('baseUrl').value.trim() || undefined,
    model: $('model').value.trim() || undefined,
    proxyUrl: proxyEnabled ? ($('proxyUrl').value.trim() || 'https://companion-ui.momomo.dev/api/proxy') : undefined,
  }
}

// ── Bubble (top-left, no auto-fade) ──
let bubbleTimer = null

function showBubble(text) {
  const bubble = $('bubble')
  bubble.textContent = text
  bubble.className = 'bubble visible'
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubble.className = 'bubble fading'
    setTimeout(() => { bubble.className = 'bubble' }, 500)
  }, 6000)
}

// ── Thinking ──
function showThinking() { $('thinking').classList.add('visible') }
function hideThinking() { $('thinking').classList.remove('visible') }

// ── Canvas Rendering ──
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function renderBlock(type, data) {
  const el = document.createElement('div')
  el.className = 'v-block'

  // 3D positioning
  const z = data.z || 0
  if (data.x != null) el.style.left = `${data.x}%`
  if (data.y != null) el.style.top = `${data.y}%`
  if (data.w) el.style.width = `${data.w}%`
  
  // Z-axis: depth + scale + opacity
  const scale = 1 + z * 0.002 // close = bigger
  const opacity = Math.max(0.4, Math.min(1, 0.8 + z * 0.003))
  el.style.transform = `translateZ(${z}px) scale(${scale})`
  el.style.opacity = opacity
  el.style.zIndex = Math.round(50 + z)

  switch (type) {
    case 'card':
      el.innerHTML = `
        ${data.image ? `<img src="${esc(data.image)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        ${data.title ? `<h2>${esc(data.title)}</h2>` : ''}
        ${data.sub ? `<div class="sub">${esc(data.sub)}</div>` : ''}
        ${(data.tags||[]).length ? `<div class="tags">${data.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${data.progress != null ? `<div class="progress-track"><div class="progress-bar" style="width:${data.progress}%"></div></div>` : ''}
        ${(data.items||[]).map(it => `<div class="list-item">${esc(typeof it === 'string' ? it : it.title)}</div>`).join('')}
        ${data.footer ? `<div class="footer">${esc(data.footer)}</div>` : ''}`
      break

    case 'metric':
      el.innerHTML = `
        <div class="big-num">${esc(String(data.value))}${data.unit ? `<span style="font-size:18px;color:#555">${esc(data.unit)}</span>` : ''}</div>
        <div class="big-label">${esc(data.label || '')}</div>`
      break

    case 'steps':
      el.innerHTML = `${data.title ? `<h3>${esc(data.title)}</h3>` : ''}${(data.items||[]).map(ev =>
        `<div class="tl-item">
          ${ev.time ? `<div class="tl-time">${esc(ev.time)}</div>` : ''}
          <div class="tl-title">${esc(ev.title||'')}</div>
          ${ev.detail ? `<div class="tl-detail">${esc(ev.detail)}</div>` : ''}
        </div>`
      ).join('')}`
      break

    case 'columns':
      const cols = data.cols || []
      el.innerHTML = `${data.title ? `<h3>${esc(data.title)}</h3>` : ''}
        <div class="cols" style="grid-template-columns:repeat(${cols.length},1fr)">
          ${cols.map(c => `<div class="col">
            ${c.name ? `<h4>${esc(c.name)}</h4>` : ''}
            ${(c.items||[]).map(it => `<div class="col-item">${esc(it)}</div>`).join('')}
          </div>`).join('')}
        </div>`
      break

    case 'callout':
      el.innerHTML = (data.author || data.source)
        ? `<div class="quote">"${esc(data.text)}"</div><div class="attribution">${esc(data.author||'')}${data.source ? ` — ${esc(data.source)}` : ''}</div>`
        : `<div class="highlight">${esc(data.text)}</div>`
      break

    case 'code':
      el.innerHTML = `<pre style="background:#0e0e0e;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;color:#bbb"><code>${esc(data.code||'')}</code></pre>`
      break

    case 'markdown':
      el.innerHTML = `<div class="md-body">${marked.parse(data.content||'')}</div>`
      break

    case 'media':
      if (data.images?.length) {
        el.innerHTML = `<div class="img-grid">${data.images.map(u => `<img src="${esc(typeof u==='string'?u:u.url)}" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>
          ${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}`
      } else if (data.url) {
        el.innerHTML = `<img src="${esc(data.url)}" loading="lazy" referrerpolicy="no-referrer">${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}`
      }
      break
  }

  return el
}

function parseResponse(text) {
  const speech = text.match(/<!--vt:speech\s+([\s\S]*?)-->/)
  const blocks = []
  const blockRegex = /<!--vt:(\w+)\s+([\s\S]*?)-->/g
  let m
  while ((m = blockRegex.exec(text)) !== null) {
    if (m[1] === 'speech') continue
    try { blocks.push({ type: m[1], data: JSON.parse(m[2]) }) } catch {}
  }
  return { speech: speech ? speech[1].trim() : null, blocks }
}

function renderBlocks(blocks) {
  const space = $('canvasSpace')
  $('greeting').classList.add('hidden')

  // Push old blocks back (recede into distance)
  space.querySelectorAll('.v-block:not(.receded)').forEach(old => {
    old.classList.add('receded')
    const curZ = parseFloat(old.dataset.z || 0)
    old.style.transform = `translateZ(${curZ - 200}px) scale(0.7)`
  })

  blocks.forEach(({ type, data }, i) => {
    const el = renderBlock(type, data)
    el.style.animationDelay = `${i * 0.12}s`
    el.dataset.z = data.z || 0
    space.appendChild(el)
  })
}

// ── LLM Call (streaming) ──
let history = []

async function callLLM(prompt, onToken) {
  const cfg = getConfig()
  if (!cfg.apiKey) {
    $('configOverlay').classList.add('open')
    return null
  }

  history.push({ role: 'user', content: prompt })

  const isAnthropic = cfg.provider === 'anthropic'
  const targetUrl = isAnthropic
    ? `${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`
    : `${cfg.baseUrl || 'https://api.openai.com'}/v1/chat/completions`

  const headers = { 'Content-Type': 'application/json' }
  let body

  if (isAnthropic) {
    headers['x-api-key'] = cfg.apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = JSON.stringify({
      model: cfg.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096, stream: true,
      system: SYSTEM,
      messages: history,
    })
  } else {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`
    body = JSON.stringify({
      model: cfg.model || 'gpt-4o',
      max_tokens: 4096, stream: true,
      messages: [{ role: 'system', content: SYSTEM }, ...history],
    })
  }

  // Proxy: wrap request in JSON body (link2web protocol, same as agentic-lite)
  let fetchUrl = targetUrl
  const fetchHeaders = { ...headers }
  const useProxy = !!cfg.proxyUrl

  if (useProxy) {
    fetchUrl = cfg.proxyUrl.startsWith('http') ? cfg.proxyUrl : `https://${cfg.proxyUrl}`
    // link2web: body as string, stream:false
    const proxyBody = JSON.parse(body)
    proxyBody.stream = false
    const proxyRes = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(proxyBody),
        mode: 'raw'
      })
    })
    const result = await proxyRes.json()
    if (!result.success) throw new Error(result.error || `Proxy failed: ${result.status}`)
    const rawBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    if (result.status >= 400) throw new Error(`API error ${result.status}: ${rawBody.slice(0, 300)}`)
    const data = JSON.parse(rawBody)
    const reply = isAnthropic
      ? data.content?.[0]?.text || ''
      : data.choices?.[0]?.message?.content || ''
    // Simulate streaming for bubble
    if (onToken) {
      const words = reply.split(/(?<=\s)/)
      let acc = ''
      for (const w of words) { acc += w; onToken(acc); await new Promise(r => setTimeout(r, 20)) }
    }
    history.push({ role: 'assistant', content: reply })
    return reply
  }

  const res = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`API ${res.status}: ${errText}`)
  }

  let full = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    buf = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const j = JSON.parse(data)
        let token = ''
        if (isAnthropic) {
          if (j.type === 'content_block_delta') token = j.delta?.text || ''
        } else {
          token = j.choices?.[0]?.delta?.content || ''
        }
        if (token) {
          full += token
          if (onToken) onToken(full)
        }
      } catch {}
    }
  }

  history.push({ role: 'assistant', content: full })
  return full
}

// ── Send ──
async function send() {
  const input = $('input')
  const btn = $('sendBtn')
  const text = input.value.trim()
  if (!text) return

  input.value = ''
  btn.disabled = true
  showThinking()

  let lastBlockCount = 0

  try {
    const reply = await callLLM(text, (partial) => {
      hideThinking()
      // Stream speech bubble
      const speechMatch = partial.match(/<!--vt:speech\s+([\s\S]*?)-->/)
      if (speechMatch) showBubble(speechMatch[1].trim())

      // Live-render completed blocks
      const { blocks } = parseResponse(partial)
      if (blocks.length > lastBlockCount) {
        const newBlocks = blocks.slice(lastBlockCount)
        renderBlocks(newBlocks)
        lastBlockCount = blocks.length
      }
    })

    if (!reply) return
    hideThinking()

    // Final pass — render any remaining blocks
    const { speech, blocks } = parseResponse(reply)
    if (speech && !$('bubble').classList.contains('visible')) showBubble(speech)
    if (blocks.length > lastBlockCount) {
      renderBlocks(blocks.slice(lastBlockCount))
    }

    // If nothing structured, show as bubble
    if (!speech && !blocks.length) showBubble(reply.slice(0, 100))
  } catch (err) {
    hideThinking()
    showBubble(`Error: ${err.message}`)
    console.error(err)
  } finally {
    btn.disabled = false
    input.focus()
  }
}

// ── Init ──
loadConfig()
document.querySelectorAll('#provider,#apiKey,#baseUrl,#model,#proxyUrl,#proxyEnabled').forEach(el => {
  el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', saveConfig)
})
$('proxyEnabled').addEventListener('change', () => {
  $('proxyUrl').disabled = !$('proxyEnabled').checked
})

$('gearBtn').addEventListener('click', () => $('configOverlay').classList.add('open'))
$('configClose').addEventListener('click', () => $('configOverlay').classList.remove('open'))
$('configOverlay').addEventListener('click', e => {
  if (e.target === $('configOverlay')) $('configOverlay').classList.remove('open')
})

$('input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
})
$('sendBtn').addEventListener('click', send)

// ── 3D parallax: mouse moves shift perspective ──
document.addEventListener('mousemove', e => {
  const space = $('canvasSpace')
  if (!space) return
  const rx = (e.clientY / window.innerHeight - 0.5) * -8
  const ry = (e.clientX / window.innerWidth - 0.5) * 8
  space.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
})
