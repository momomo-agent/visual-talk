// ── Visual Talk — AI speaks through UI ──

const $ = id => document.getElementById(id)
const STORAGE_KEY = 'visual-talk-config'

const SYSTEM = `You are Visual Talk — an AI that expresses itself through generated UI, not chat.

Your primary language is visual blocks. Text speech is secondary — use it sparingly, like a whisper.

When you respond, output two things:

1. **Speech** (optional): A brief, warm sentence. This appears as a floating bubble that fades away. Keep it under 20 words. Skip it if the visuals say enough.

2. **Visual blocks**: Your main expression. Use <!--vt:TYPE JSON--> annotations.

Available block types:
- card: {"title":"","sub":"","image":"url","tags":[""],"items":[""],"progress":75,"footer":"","size":"full|half|third"}
- metric: {"value":"42","label":"Growth","unit":"%","size":"third"}
- steps: {"title":"","items":[{"time":"","title":"","detail":""}]}
- columns: {"title":"","cols":[{"name":"A","items":["point"]}],"size":"full"}
- callout: {"text":"quote or highlight","author":"","source":""}
- code: {"code":"","language":"js"}
- markdown: {"content":"# Rich text"}
- media: {"url":"image-url","caption":""} or {"images":["url1","url2"]}

Block sizing: "size" can be "full" (default, 100%), "half" (50%), or "third" (33%).

Format your response as:
<!--vt:speech Your brief spoken words here-->
<!--vt:card {"title":"Example",...}-->
<!--vt:metric {"value":"99","label":"Score","size":"third"}-->

Rules:
- Lead with visuals, not words
- Multiple blocks = richer expression
- Use size to create layouts (3 metrics in a row = "third" each)
- Speech is a whisper, not a paragraph
- Never output plain text outside annotations — everything goes through vt: tags
- If someone says "hi", don't write an essay — a warm visual greeting is enough`

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
    proxyUrl: proxyEnabled ? ($('proxyUrl').value.trim() || 'https://proxy.link2web.site/proxy') : undefined,
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
  const size = data.size || 'full'
  el.className = `v-block ${size}`

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
  const inner = $('canvasInner')
  $('greeting').classList.add('hidden')

  blocks.forEach(({ type, data }, i) => {
    const el = renderBlock(type, data)
    el.style.animationDelay = `${i * 0.08}s`
    inner.appendChild(el)
  })

  setTimeout(() => $('canvas').scrollTop = $('canvas').scrollHeight, 100)
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

  // Proxy: forward via proxy URL with target in header
  let fetchUrl = targetUrl
  if (cfg.proxyUrl) {
    fetchUrl = cfg.proxyUrl
    headers['x-target-url'] = targetUrl
  }

  const res = await fetch(fetchUrl, { method: 'POST', headers, body })
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
