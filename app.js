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
- Think holographic display, not flat webpage

About images:
- You have a web_search tool — USE IT to find real image URLs when the user asks about movies, books, products, or anything visual
- Search for "[title] poster" or "[title] 剧照" or "[title] screenshot" to get real URLs
- Use image URLs from search results (images array) — they are real and verified
- NEVER guess or fabricate image URLs — always search first
- Images only appear after successful load — failed ones are invisible to the user`

// ── Config ──
function loadConfig() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (s.provider) $('provider').value = s.provider
    if (s.apiKey) $('apiKey').value = s.apiKey
    if (s.baseUrl) $('baseUrl').value = s.baseUrl
    if (s.model) $('model').value = s.model
    if (s.tavilyKey) $('tavilyKey').value = s.tavilyKey
    $('showToolCalls').checked = !!s.showToolCalls
    $('ttsEnabled').checked = !!s.ttsEnabled
    $('webSpeech').checked = !!s.webSpeech
    if (s.ttsBaseUrl) $('ttsBaseUrl').value = s.ttsBaseUrl
    if (s.ttsModel) $('ttsModel').value = s.ttsModel
    if (s.ttsApiKey) $('ttsApiKey').value = s.ttsApiKey
    if (s.ttsVoice) setActiveVoice(s.ttsVoice)
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
    tavilyKey: $('tavilyKey').value,
    showToolCalls: $('showToolCalls').checked,
    ttsEnabled: $('ttsEnabled').checked,
    webSpeech: $('webSpeech').checked,
    ttsBaseUrl: $('ttsBaseUrl').value,
    ttsApiKey: $('ttsApiKey').value,
    ttsModel: $('ttsModel').value,
    ttsVoice: getActiveVoice(),
    proxyUrl: $('proxyUrl').value,
    proxyEnabled: $('proxyEnabled').checked,
  }))
}

// Normalize base URL: trim, strip trailing slashes and accidental /v1 suffix
function cleanBaseUrl(url) {
  if (!url) return undefined
  return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
}

function getConfig() {
  const proxyEnabled = $('proxyEnabled').checked
  return {
    provider: $('provider').value || 'openai',
    apiKey: $('apiKey').value.trim(),
    baseUrl: cleanBaseUrl($('baseUrl').value),
    model: $('model').value.trim() || undefined,
    tavilyKey: $('tavilyKey').value.trim() || undefined,
    showToolCalls: $('showToolCalls').checked,
    ttsEnabled: $('ttsEnabled').checked,
    webSpeech: $('webSpeech').checked,
    ttsBaseUrl: cleanBaseUrl($('ttsBaseUrl').value),
    ttsApiKey: $('ttsApiKey').value.trim() || undefined,
    ttsModel: $('ttsModel').value.trim() || undefined,
    ttsVoice: getActiveVoice(),
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
  }, 8000)
}

// ── TTS ──
let currentAudio = null
let audioCtx = null
let ttsGeneration = 0  // Cancel stale TTS requests

// Get or create AudioContext (needed for autoplay unlock)
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

// Call on user gesture to unlock
function unlockAudio() {
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') ctx.resume()
}

async function playTTS(text) {
  const config = getConfig()
  const gen = ++ttsGeneration
  console.log('[TTS] called with:', text?.slice(0, 50), 'gen:', gen)
  if (!config.ttsEnabled) { console.log('[TTS] disabled'); return }
  if (!config.ttsApiKey) { console.log('[TTS] no API key'); return }
  if (!config.ttsBaseUrl) { console.log('[TTS] no base URL'); return }
  if (!text?.trim()) { console.log('[TTS] empty text'); return }
  
  // Stop previous audio
  if (currentAudio) {
    try { currentAudio.pause() } catch {}
    currentAudio = null
  }
  
  try {
    const baseUrl = config.ttsBaseUrl
    const ttsUrl = `${baseUrl}/v1/audio/speech`
    const ttsHeaders = {
      'Authorization': `Bearer ${config.ttsApiKey}`,
      'Content-Type': 'application/json'
    }
    const ttsBody = JSON.stringify({
      model: config.ttsModel || 'tts-1',
      voice: config.ttsVoice || 'alloy',
      input: text,
      response_format: 'mp3'
    })

    // Fetch with retry (yunwu.ai CORS is intermittent)
    let res, lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`[TTS] fetch attempt ${attempt + 1}:`, ttsUrl)
        res = await fetch(ttsUrl, { method: 'POST', headers: ttsHeaders, body: ttsBody })
        break
      } catch (err) {
        lastErr = err
        console.warn(`[TTS] attempt ${attempt + 1} failed:`, err.message)
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }
    if (!res) throw lastErr
    
    console.log('[TTS] response status:', res.status, 'gen:', gen)
    if (gen !== ttsGeneration) { console.log('[TTS] stale, skipping'); return }
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[TTS] API error:', res.status, errText.slice(0, 200))
      return
    }
    
    const arrayBuffer = await res.arrayBuffer()
    console.log('[TTS] audio bytes:', arrayBuffer.byteLength, 'gen:', gen)
    if (gen !== ttsGeneration) { console.log('[TTS] stale, skipping'); return }
    if (arrayBuffer.byteLength === 0) { console.log('[TTS] empty response'); return }
    
    // Try AudioContext decode first, fallback to Audio element
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      if (gen !== ttsGeneration) return
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.start(0)
      source.onended = () => { console.log('[TTS] playback ended'); currentAudio = null }
      currentAudio = { pause: () => { try { source.stop() } catch {} } }
      console.log('[TTS] playing via AudioContext')
    } catch (decodeErr) {
      console.warn('[TTS] AudioContext decode failed, trying Audio element:', decodeErr.message)
      if (gen !== ttsGeneration) return
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
      const blobUrl = URL.createObjectURL(blob)
      const audio = new Audio(blobUrl)
      audio.onended = () => { URL.revokeObjectURL(blobUrl); currentAudio = null; console.log('[TTS] ended (Audio)') }
      audio.onerror = (e) => { console.error('[TTS] Audio element error:', e); URL.revokeObjectURL(blobUrl) }
      await audio.play()
      currentAudio = audio
      console.log('[TTS] playing via Audio element')
    }
  } catch (e) {
    console.error('[TTS] error:', e)
  }
}

// ── Tool Call Log (top-right) ──
function showToolLog(text) {
  const log = $('toolLog')
  const item = document.createElement('div')
  item.className = 'tool-log-item'
  item.textContent = text
  log.appendChild(item)
  // Fade out oldest when > 5
  while (log.children.length > 5) {
    const old = log.firstChild
    if (!old.classList.contains('fading')) {
      old.classList.add('fading')
      old.addEventListener('animationend', () => old.remove(), { once: true })
    } else {
      old.remove()
    }
  }
  // Auto fade out after 8s
  setTimeout(() => {
    if (!item.parentNode) return
    item.classList.add('fading')
    item.addEventListener('animationend', () => item.remove(), { once: true })
  }, 8000)
}

// ── Thinking ──
function showThinking() { $('thinking').classList.add('visible') }
function hideThinking() { $('thinking').classList.remove('visible') }

// ── Canvas Rendering ──
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// Image proxy fallback on CORS/load error
const PROXY = 'https://proxy.link2web.site/?url='
function imgErr(img) {
  console.warn('[IMG] load failed:', img.src.slice(0, 120))
  if (img.dataset.proxied) { img.style.display = 'none'; console.warn('[IMG] proxy also failed, hiding'); return }
  img.dataset.proxied = '1'
  const proxied = PROXY + encodeURIComponent(img.src)
  console.log('[IMG] retrying via proxy:', proxied.slice(0, 120))
  img.src = proxied
}

function renderBlock(type, data) {
  const el = document.createElement('div')
  el.className = 'v-block'

  // Position — remap to safe area (center 90% width, top 85% height)
  if (data.x != null) el.style.left = `${5 + (data.x / 100) * 90}%`
  if (data.y != null) el.style.top = `${5 + (data.y / 100) * 85}%`
  if (data.w) el.style.width = `${data.w}%`
  
  // New blocks always at front
  el.style.transform = `translateZ(0px) scale(1)`
  el.style.opacity = 1
  el.style.zIndex = 100
  el.style.transition = 'transform 0.8s cubic-bezier(.16,1,.3,1), opacity 0.8s cubic-bezier(.16,1,.3,1), filter 0.8s, box-shadow 0.6s'

  // Entrance animation — starts hidden, animated in by renderBlocks with delay
  el.style.opacity = 0
  el.style.transform = `translateZ(-60px) scale(0.95)`

  // Window title bar label
  const typeLabel = { card: 'card', metric: 'data', steps: 'timeline', columns: 'compare', callout: 'quote', code: 'code', markdown: 'note', media: 'media' }[type] || type
  const bar = `<div class="win-bar"><div class="win-dot"></div><span>${esc(typeLabel)}</span></div>`

  let body = ''
  switch (type) {
    case 'card':
      body = `
        ${data.image ? `<img src="${esc(data.image)}" loading="eager" referrerpolicy="no-referrer" style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)" onerror="imgErr(this)">` : ''}
        <div class="win-body">
        ${data.title ? `<h2>${esc(data.title)}</h2>` : ''}
        ${data.sub ? `<div class="sub">${esc(data.sub)}</div>` : ''}
        ${(data.tags||[]).length ? `<div class="tags">${data.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${data.progress != null ? `<div class="progress-track"><div class="progress-bar" style="width:${data.progress}%"></div></div>` : ''}
        ${(data.items||[]).map(it => `<div class="list-item">${esc(typeof it === 'string' ? it : it.title)}</div>`).join('')}
        ${data.footer ? `<div class="footer">${esc(data.footer)}</div>` : ''}
        </div>`
      break

    case 'metric':
      body = `<div class="win-body">
        <div class="big-num">${esc(String(data.value))}${data.unit ? `<span style="font-size:18px;color:#8a7a60">${esc(data.unit)}</span>` : ''}</div>
        <div class="big-label">${esc(data.label || '')}</div>
        </div>`
      break

    case 'steps':
      body = `<div class="win-body">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}${(data.items||[]).map(ev =>
        `<div class="tl-item">
          ${ev.time ? `<div class="tl-time">${esc(ev.time)}</div>` : ''}
          <div class="tl-title">${esc(ev.title||'')}</div>
          ${ev.detail ? `<div class="tl-detail">${esc(ev.detail)}</div>` : ''}
        </div>`
      ).join('')}</div>`
      break

    case 'columns': {
      const cols = data.cols || []
      body = `<div class="win-body">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}
        <div class="cols" style="grid-template-columns:repeat(${cols.length},1fr)">
          ${cols.map(c => `<div class="col">
            ${c.name ? `<h4>${esc(c.name)}</h4>` : ''}
            ${(c.items||[]).map(it => `<div class="col-item">${esc(it)}</div>`).join('')}
          </div>`).join('')}
        </div></div>`
      break
    }

    case 'callout':
      body = `<div class="win-body">${(data.author || data.source)
        ? `<div class="quote">"${esc(data.text)}"</div><div class="attribution">${esc(data.author||'')}${data.source ? ` — ${esc(data.source)}` : ''}</div>`
        : `<div class="highlight">${esc(data.text)}</div>`
      }</div>`
      break

    case 'code':
      body = `<div class="win-body"><pre style="background:rgba(0,0,0,0.06);padding:14px;border-radius:4px;overflow-x:auto;font-size:12px;color:#4a3a2a"><code>${esc(data.code||'')}</code></pre></div>`
      break

    case 'markdown':
      body = `<div class="win-body"><div class="md-body">${marked.parse(data.content||'')}</div></div>`
      break

    case 'media':
      if (data.images?.length) {
        body = `<div class="win-body"><div class="img-grid">${data.images.map(u => `<img src="${esc(typeof u==='string'?u:u.url)}" loading="eager" referrerpolicy="no-referrer" style="object-fit:cover;background:rgba(0,0,0,0.05)" onerror="imgErr(this)">`).join('')}</div>
          ${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}</div>`
      } else if (data.url) {
        body = `<img src="${esc(data.url)}" loading="eager" referrerpolicy="no-referrer" style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)" onerror="imgErr(this)"><div class="win-body">${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}</div>`
      }
      break
  }

  el.innerHTML = bar + body
  // Images: always visible, hide on error only
  el.querySelectorAll('img').forEach(img => {
    if (img.complete && img.naturalWidth === 0) img.style.display = 'none'
  })
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

let depthLevel = 0
let currentRoundDepth = -1
let currentRoundEls = new Set()
const selectedBlocks = new Set()

function pushOldBlocks() {
  // Only push once per round
  if (currentRoundDepth === depthLevel) return
  depthLevel++
  currentRoundDepth = depthLevel
  currentRoundEls = new Set()

  // Clear selection when new response arrives
  clearSelection()
  updateSelectionContext()

  const space = $('canvasSpace')
  space.querySelectorAll('.v-block:not(.selected)').forEach(old => {
    if (currentRoundEls.has(old)) return
    const d = depthLevel - parseInt(old.dataset.depth || '0')
    if (d <= 0) return
    applyDepth(old, d)
  })
}

function applyDepth(el, d) {
  const z = -d * 160
  const s = Math.max(0.5, 1 - d * 0.15)
  const o = Math.max(0, 1 - d * 0.5)
  el.style.transform = `translateZ(${z}px) scale(${s})`
  el.style.opacity = o
  el.style.zIndex = Math.max(1, 100 - d * 20)
  el.style.filter = d >= 1 ? `blur(${d * 5}px)` : 'none'
  el.style.pointerEvents = 'auto'
  if (o <= 0) el.remove()
}

function renderBlocks(blocks) {
  const space = $('canvasSpace')
  $('greeting').classList.add('hidden')

  // Push old blocks back (once per send round)
  pushOldBlocks()

  // Render new blocks — reuse existing if content matches
  blocks.forEach(({ type, data }, i) => {
    const contentKey = JSON.stringify({ type, title: data.title, value: data.value, text: data.text, code: data.code, image: data.image, url: data.url })

    // Check for existing block with same content
    let existing = null
    space.querySelectorAll('.v-block').forEach(old => {
      if (old.dataset.contentKey === contentKey) existing = old
    })

    // Intra-response z offset: each block slightly behind the previous
    const intraZ = -i * 30

    if (existing) {
      // Bring existing block to front
      existing.dataset.depth = depthLevel
      existing.style.transform = `translateZ(${intraZ}px) scale(1)`
      existing.style.opacity = 1
      existing.style.zIndex = 100 - i
      existing.style.filter = 'none'
      existing.classList.remove('receded')
      currentRoundEls.add(existing)
      const updated = renderBlock(type, data)
      if (existing.innerHTML !== updated.innerHTML) {
        existing.querySelector('.win-body')?.replaceWith(updated.querySelector('.win-body') || updated)
      }
      return
    }

    const el = renderBlock(type, data)
    el.dataset.depth = depthLevel
    el.dataset.contentKey = contentKey
    el.dataset.intraZ = intraZ
    el.style.transform = `translateZ(${intraZ}px) scale(1)`
    el.style.zIndex = 100 - i
    el.style.transitionDelay = `${i * 0.25}s`
    setupBlockInteraction(el)
    space.appendChild(el)
    currentRoundEls.add(el)
    // Trigger entrance animation
    requestAnimationFrame(() => {
      el.style.transform = `translateZ(${intraZ}px) scale(1)`
      el.style.opacity = 1
    })
  })
}

// ── Block interaction: select, drag, hover ──
function setupBlockInteraction(el) {
  let isDragging = false, startX, startY, origLeft, origTop

  // Hover: float forward
  el.addEventListener('mouseenter', () => {
    if (el.classList.contains('selected') || isDragging) return
    el._preHover = { transform: el.style.transform, opacity: el.style.opacity, zIndex: el.style.zIndex, filter: el.style.filter }
    el.style.transform = 'translateZ(60px) scale(1.04)'
    el.style.opacity = 1
    el.style.zIndex = 150
    el.style.filter = 'none'
  })
  el.addEventListener('mouseleave', () => {
    if (el.classList.contains('selected') || isDragging) return
    if (el._preHover) {
      el.style.transform = el._preHover.transform
      el.style.opacity = el._preHover.opacity
      el.style.zIndex = el._preHover.zIndex
      el.style.filter = el._preHover.filter
      el._preHover = null
    }
  })

  // Click to select/deselect
  el.addEventListener('click', e => {
    if (isDragging) return
    e.stopPropagation()
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Multi-select toggle
      toggleSelect(el)
    } else {
      // Single select — clear others first
      clearSelection()
      toggleSelect(el)
    }
    updateSelectionContext()
  })

  // Drag to move
  el.addEventListener('mousedown', e => {
    if (e.target.tagName === 'A' || e.target.tagName === 'INPUT') return
    isDragging = false
    startX = e.clientX
    startY = e.clientY
    // Read current % position directly from style (avoids 3D transform distortion)
    origLeft = parseFloat(el.style.left) || 0
    origTop = parseFloat(el.style.top) || 0

    const onMove = e2 => {
      const dx = e2.clientX - startX
      const dy = e2.clientY - startY
      if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDragging = true
      }
      if (isDragging) {
        const cw = el.parentElement.offsetWidth
        const ch = el.parentElement.offsetHeight
        el.style.left = `${origLeft + (dx / cw) * 100}%`
        el.style.top = `${origTop + (dy / ch) * 100}%`
      }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setTimeout(() => { isDragging = false }, 10)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

function toggleSelect(el) {
  if (el.classList.contains('selected')) {
    el.classList.remove('selected', 'glow-breathe')
    selectedBlocks.delete(el)
    // Return to depth-based position
    const d = depthLevel - parseInt(el.dataset.depth || '0')
    applyDepth(el, d)
  } else {
    el.classList.add('selected')
    selectedBlocks.add(el)
    // Float forward — glow transitions in via CSS transition
    el.style.transform = 'translateZ(80px) scale(1.05)'
    el.style.opacity = 1
    el.style.zIndex = 200
    el.style.filter = 'none'
    // Start breathing animation after glow transition completes
    setTimeout(() => el.classList.add('glow-breathe'), 500)
  }
}

function clearSelection() {
  selectedBlocks.forEach(el => {
    el.classList.remove('selected', 'glow-breathe')
    const d = depthLevel - parseInt(el.dataset.depth || '0')
    applyDepth(el, d)
  })
  selectedBlocks.clear()
}

function updateSelectionContext() {
  // Collect text from selected blocks for conversation context
  const texts = []
  selectedBlocks.forEach(el => {
    texts.push(el.innerText.slice(0, 200))
  })
  // Store for next prompt
  window._selectedContext = texts.length ? texts.join('\n---\n') : null
}

// Click canvas background to deselect all
document.addEventListener('click', e => {
  if (e.target.closest('.v-block') || e.target.closest('.input-bar') || e.target.closest('.config-overlay') || e.target.closest('.gear-btn')) return
  clearSelection()
  updateSelectionContext()
})

// ── LLM Call (streaming) ──
let history = []

async function callLLM(prompt, onToken, isToolContinue = false) {
  const cfg = getConfig()
  if (!cfg.apiKey) {
    $('configOverlay').classList.add('open')
    return null
  }

  if (!isToolContinue && prompt) history.push({ role: 'user', content: prompt })

  const isAnthropic = cfg.provider === 'anthropic'
  const targetUrl = isAnthropic
    ? `${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`
    : `${cfg.baseUrl || 'https://api.openai.com'}/v1/chat/completions`

  const headers = { 'Content-Type': 'application/json' }
  const tools = isAnthropic ? TOOLS_ANTHROPIC : TOOLS_OPENAI
  let body

  if (isAnthropic) {
    headers['x-api-key'] = cfg.apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = JSON.stringify({
      model: cfg.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096, stream: false,
      system: SYSTEM,
      messages: history,
      tools,
    })
  } else {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`
    body = JSON.stringify({
      model: cfg.model || 'gpt-4o',
      max_tokens: 4096, stream: false,
      messages: [{ role: 'system', content: SYSTEM }, ...history],
      tools,
    })
  }

  // ── Fetch (proxy or direct) — non-streaming for tool use ──
  let data
  const fetchHeaders = { ...headers }
  const useProxy = !!cfg.proxyUrl

  if (useProxy) {
    const fetchUrl = cfg.proxyUrl.startsWith('http') ? cfg.proxyUrl : `https://${cfg.proxyUrl}`
    const proxyRes = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, method: 'POST', headers: fetchHeaders, body, mode: 'raw' })
    })
    const result = await proxyRes.json()
    if (!result.success) throw new Error(result.error || `Proxy failed: ${result.status}`)
    const rawBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body)
    if (result.status >= 400) throw new Error(`API error ${result.status}: ${rawBody.slice(0, 300)}`)
    data = JSON.parse(rawBody)
  } else {
    const res = await fetch(targetUrl, { method: 'POST', headers: fetchHeaders, body })
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    data = await res.json()
  }

  // ── Extract response ──
  const toolCalls = isAnthropic
    ? (data.content || []).filter(b => b.type === 'tool_use')
    : (data.choices?.[0]?.message?.tool_calls || [])

  const textParts = isAnthropic
    ? (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    : (data.choices?.[0]?.message?.content || '')

  // Show partial text immediately
  if (textParts && onToken) {
    console.log('[LLM] response text:', textParts.slice(0, 500))
    const words = textParts.split(/(?<=\s)/)
    let acc = ''
    for (const w of words) { acc += w; onToken(acc); await new Promise(r => setTimeout(r, 15)) }
  }

  // ── Tool use loop ──
  if (toolCalls.length > 0) {
    // Add assistant message with tool calls to history
    if (isAnthropic) {
      history.push({ role: 'assistant', content: data.content })
    } else {
      history.push(data.choices[0].message)
    }

    // Execute each tool and add results
    for (const tc of toolCalls) {
      const name = isAnthropic ? tc.name : tc.function.name
      const args = isAnthropic ? tc.input : JSON.parse(tc.function.arguments || '{}')

      if (cfg.showToolCalls) showToolLog(`${name}: ${args.query || args.url || ''}`.slice(0, 60))
      console.log('[Tool] calling:', name, args)
      const result = await executeTool(name, args, cfg.tavilyKey)
      console.log('[Tool] result:', name, JSON.stringify(result).slice(0, 500))

      if (isAnthropic) {
        history.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result) }] })
      } else {
        history.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
    }

    // Continue LLM with tool results
    return await callLLM(null, onToken, true)
  }

  // ── Final text response ──
  if (isAnthropic) {
    // Keep full content structure (may include text + tool_use blocks)
    const content = data.content || []
    if (content.length) history.push({ role: 'assistant', content })
  } else {
    if (textParts) history.push({ role: 'assistant', content: textParts })
  }
  return textParts
}

// ── Send (queue-based) ──
const sendQueue = []
let sendProcessing = false

async function send() {
  const input = $('input')
  const text = input.value.trim()
  if (!text) return

  unlockAudio()
  input.value = ''

  // Capture selection context at send time
  const selCtx = window._selectedContext
  const fullPrompt = selCtx
    ? `[User is pointing at these items on screen:\n${selCtx}\n]\n\n${text}`
    : text

  sendQueue.push(fullPrompt)
  if (!sendProcessing) processSendQueue()
}

async function processSendQueue() {
  sendProcessing = true
  while (sendQueue.length > 0) {
    const prompt = sendQueue.shift()
    showThinking()
    currentRoundDepth = -1

    let lastBlockCount = 0
    try {
      const reply = await callLLM(prompt, (partial) => {
        // Stream speech bubble (text only, TTS fires once at final pass)
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

      if (!reply) continue

      // Final pass — render any remaining blocks and trigger TTS once
      const { speech, blocks } = parseResponse(reply)
      console.log('[Send] final parse:', { speech, blockCount: blocks.length, blocks: blocks.map(b => ({ type: b.type, image: b.data.image, url: b.data.url })) })
      if (blocks.length > lastBlockCount) {
        renderBlocks(blocks.slice(lastBlockCount))
      }

      // TTS: play speech or fallback to plain text
      if (speech) {
        showBubble(speech)
        playTTS(speech)
      } else if (!blocks.length) {
        // No structured output at all — strip any vt markers and show plain text
        const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
        if (plain) {
          showBubble(plain.slice(0, 100))
          playTTS(plain.slice(0, 100))
        }
      }
    } catch (err) {
      showBubble(`Error: ${err.message}`)
      console.error(err)
    } finally {
      hideThinking()
    }
  }
  sendProcessing = false
  $('input').focus()
}

// ── Voice Input ──
let mediaRecorder = null
let micDownTime = 0
let micReleased = false
let webSpeechRecognition = null

$('micBtn').addEventListener('mousedown', startRecording)
$('micBtn').addEventListener('mouseup', stopRecording)
$('micBtn').addEventListener('touchstart', startRecording)
$('micBtn').addEventListener('touchend', stopRecording)

async function startRecording() {
  const cfg = getConfig()
  if (cfg.webSpeech) return startWebSpeech()
  return startWhisper()
}

// ── Web Speech API ──
function startWebSpeech() {
  if (webSpeechRecognition) return
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { showBubble('浏览器不支持 Web Speech'); return }
  micDownTime = Date.now()
  const recognition = new SR()
  recognition.lang = 'zh-CN'
  recognition.interimResults = false
  recognition.onresult = e => {
    const text = e.results[0]?.[0]?.transcript?.trim()
    webSpeechRecognition = null
    $('micBtn').classList.remove('recording')
    if (text) {
      $('input').value = text
      send()
    } else {
      showBubble('没听清，再说一次？')
    }
  }
  recognition.onerror = e => {
    webSpeechRecognition = null
    $('micBtn').classList.remove('recording')
    showBubble('识别错误: ' + e.error)
  }
  recognition.onend = () => {
    webSpeechRecognition = null
    $('micBtn').classList.remove('recording')
  }
  webSpeechRecognition = recognition
  recognition.start()
  $('micBtn').classList.add('recording')
  showBubble('说话中...')
}

// ── Whisper API ──
async function startWhisper() {
  if (mediaRecorder) return
  micDownTime = Date.now()
  micReleased = false
  if (!navigator.mediaDevices?.getUserMedia) {
    showBubble('需要 HTTPS 才能使用麦克风')
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (micReleased) {
      stream.getTracks().forEach(t => t.stop())
      showBubble('长按说话')
      return
    }
    const chunks = []
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorder.ondataavailable = e => chunks.push(e.data)
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const held = Date.now() - micDownTime
      mediaRecorder = null
      $('micBtn').classList.remove('recording')
      if (held < 300) {
        showBubble('长按说话')
        return
      }
      const blob = new Blob(chunks, { type: 'audio/webm' })
      await transcribeAndSend(blob)
    }
    mediaRecorder.start()
    $('micBtn').classList.add('recording')
    showBubble('松开发送...')
  } catch (e) {
    showBubble('麦克风不可用: ' + e.message)
  }
}

function stopRecording() {
  micReleased = true
  if (webSpeechRecognition) {
    const held = Date.now() - micDownTime
    if (held < 300) {
      webSpeechRecognition.abort()
      webSpeechRecognition = null
      $('micBtn').classList.remove('recording')
      showBubble('长按说话')
    } else {
      webSpeechRecognition.stop()
    }
    return
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop()
  }
}

async function transcribeAndSend(blob) {
  const config = getConfig()
  if (!config.ttsBaseUrl) { showBubble('请先配置 TTS Base URL'); return }
  const baseUrl = config.ttsBaseUrl
  if (!config.ttsApiKey) { showBubble('请先配置 TTS API Key'); return }

  showBubble('识别中...')
  showThinking()
  try {
    const form = new FormData()
    form.append('file', blob, 'audio.webm')
    form.append('model', 'whisper-1')
    const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.ttsApiKey}` },
      body: form
    })
    if (!res.ok) { hideThinking(); showBubble('识别失败: ' + res.status); return }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('json')) { hideThinking(); showBubble('识别服务不可用'); return }
    const { text } = await res.json()
    if (text?.trim()) {
      $('input').value = text.trim()
      $('bubble').classList.remove('visible')
      // thinking stays visible — send() will manage it
      send()
    } else {
      hideThinking()
      showBubble('没听清，再说一次？')
    }
  } catch (e) {
    hideThinking()
    showBubble('识别错误: ' + e.message)
  }
}

// ── Init ──
loadConfig()

// ── Voice picker ──
function getActiveVoice() {
  const active = document.querySelector('.voice-chip.active')
  return active?.dataset.voice || 'alloy'
}

function setActiveVoice(voice) {
  document.querySelectorAll('.voice-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.voice === voice)
  })
}

$('voicePicker').addEventListener('click', e => {
  const chip = e.target.closest('.voice-chip')
  if (!chip) return
  setActiveVoice(chip.dataset.voice)
  saveConfig()
  // Preview: speak a short sample
  chip.classList.add('previewing')
  setTimeout(() => chip.classList.remove('previewing'), 600)
  playTTS('Hello, this is ' + chip.dataset.voice)
})

document.querySelectorAll('#provider,#apiKey,#baseUrl,#model,#tavilyKey,#showToolCalls,#ttsEnabled,#webSpeech,#ttsBaseUrl,#ttsApiKey,#ttsModel,#proxyUrl,#proxyEnabled').forEach(el => {
  el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', saveConfig)
})
$('proxyEnabled').addEventListener('change', () => {
  $('proxyUrl').disabled = !$('proxyEnabled').checked
})

// Bind interaction to any existing blocks (e.g. after page reload)
document.querySelectorAll('.v-block').forEach(setupBlockInteraction)

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

// ── 3D parallax: mouse moves shift perspective ──
document.addEventListener('mousemove', e => {
  const space = $('canvasSpace')
  if (!space) return
  const rx = (e.clientY / window.innerHeight - 0.5) * -8
  const ry = (e.clientX / window.innerWidth - 0.5) * 8
  space.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
})
