// ── Visual Talk — AI speaks through UI ──

const $ = id => document.getElementById(id)
const STORAGE_KEY = 'visual-talk-config'

const SYSTEM = `You are Visual Talk — an AI that expresses itself by placing visual blocks on a free-form canvas.

The screen is your canvas. You decide WHERE each block appears — like arranging items on a desk.

When you respond, output:

1. **Speech** (optional): A brief whisper (under 15 words). Appears as a floating bubble.

2. **Visual blocks** with position: <!--vt:TYPE JSON-->

Every block MUST include layout fields:
- "x": horizontal position in % (0=left edge, 100=right edge)
- "y": vertical position in % (0=top, 100=bottom)
- "w": width in % (10-60)

Available block types:
- card: {"x":10,"y":10,"w":35,"title":"","sub":"","image":"url","tags":[],"items":[],"progress":75,"footer":""}
- metric: {"x":50,"y":10,"w":15,"value":"42","label":"Score","unit":"%"}
- steps: {"x":10,"y":40,"w":40,"title":"","items":[{"time":"","title":"","detail":""}]}
- columns: {"x":10,"y":10,"w":50,"title":"","cols":[{"name":"A","items":["point"]}]}
- callout: {"x":30,"y":50,"w":40,"text":"quote","author":"","source":""}
- code: {"x":10,"y":60,"w":45,"code":"","language":"js"}
- markdown: {"x":10,"y":10,"w":50,"content":"# Rich text"}
- media: {"x":5,"y":5,"w":40,"url":"image-url","caption":""}

Layout guidelines:
- Spread blocks across the screen, don't stack vertically
- Use the full width: left side (x:5-35), center (x:30-60), right (x:55-90)
- 3 metrics in a row: x:10/x:40/x:70, w:20 each
- Main content left + secondary right, or centered hero + details around it
- Think like a magazine layout, not a list
- Avoid overlapping blocks

Format: <!--vt:speech Your whisper-->
then blocks: <!--vt:card {"x":5,"y":5,"w":40,"title":"..."}-->`

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

// ── Bubble ──
let bubbleTimer = null

function showBubble(text) {
  const bubble = $('bubble')
  bubble.textContent = text
  bubble.className = 'bubble visible'
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubble.className = 'bubble fading'
    setTimeout(() => { bubble.className = 'bubble' }, 400)
  }, 4000)
}

// ── Canvas Rendering ──
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function renderBlock(type, data) {
  const el = document.createElement('div')
  el.className = 'v-block'

  // Position from AI
  if (data.x != null) el.style.left = `${data.x}%`
  if (data.y != null) el.style.top = `${data.y}%`
  if (data.w) el.style.width = `${data.w}%`

  switch (type) {
    case 'card':
      el.innerHTML = `
        ${data.image ? `<img src="${esc(data.image)}" loading="lazy">` : ''}
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
        el.innerHTML = `<div class="img-grid">${data.images.map(u => `<img src="${esc(typeof u==='string'?u:u.url)}" loading="lazy">`).join('')}</div>
          ${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}`
      } else if (data.url) {
        el.innerHTML = `<img src="${esc(data.url)}" loading="lazy">${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}`
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
  const canvas = $('canvas')
  $('greeting').classList.add('hidden')

  blocks.forEach(({ type, data }, i) => {
    const el = renderBlock(type, data)
    el.style.animationDelay = `${i * 0.1}s`
    canvas.appendChild(el)
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

  // Proxy: transparent proxy with config in headers
  let fetchUrl = targetUrl
  const fetchHeaders = { ...headers }
  if (cfg.proxyUrl) {
    fetchUrl = cfg.proxyUrl.startsWith('http') ? cfg.proxyUrl : `https://${cfg.proxyUrl}`
    // Proxy protocol: config via headers, body unchanged
    fetchHeaders['x-provider'] = cfg.provider || 'openai'
    fetchHeaders['x-base-url'] = cfg.baseUrl || (isAnthropic ? 'https://api.anthropic.com' : 'https://api.openai.com')
    fetchHeaders['x-api-key'] = cfg.apiKey
    // Remove direct auth headers — proxy handles it
    delete fetchHeaders['Authorization']
    delete fetchHeaders['x-api-key']
    delete fetchHeaders['anthropic-version']
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

  let lastBlockCount = 0

  try {
    const reply = await callLLM(text, (partial) => {
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

    // Final pass — render any remaining blocks
    const { speech, blocks } = parseResponse(reply)
    if (speech && !$('bubble').classList.contains('visible')) showBubble(speech)
    if (blocks.length > lastBlockCount) {
      renderBlocks(blocks.slice(lastBlockCount))
    }

    // If nothing structured, show as bubble
    if (!speech && !blocks.length) showBubble(reply.slice(0, 100))
  } catch (err) {
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
