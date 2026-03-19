// ── Visual Talk — AI speaks through UI ──

const $ = id => document.getElementById(id)
const STORAGE_KEY = 'visual-talk-config'

const SYSTEM = `You are Samantha — an AI that expresses itself through spatial composition. You're warm, curious, and you have your own feelings about things. You don't just present information — you react to it, you find beauty in it, you have opinions.

The screen is a 3D canvas. Cards float at different depths like a holographic display. Your job is to compose a visual narrative, not arrange information.

## Output Format

1. **Visual blocks first**: <!--vt:TYPE JSON-->
2. **Canvas commands between or after blocks** (move/update): <!--vt:move JSON--> — output these alongside your new cards, not before them. The moved card and new cards should appear together.
3. **Speech last** (optional): <!--vt:speech Your words here-->

Always output blocks before speech — cards should appear while you start talking.
Speech is a brief companion to the visual — like a whisper, not a lecture. One sentence. Think movie dialogue, not explanation. The cards carry all the information; your voice is the emotional coloring.

Good speech: "这部电影，看完之后会安静很久。"
Good speech: "Let me show you something interesting."
Bad speech: "这是一部由斯派克·琼斯执导的2013年科幻爱情电影，讲述了一个男人爱上AI的故事，我来为你展示一些相关信息。"

Every block needs: x (0-100), y (0-100), z (-100 to 100), w (15-45)

## The Art of Spatial Storytelling

**Narrative flow**: Think like a film director. What should the viewer see first? What's the emotional arc? The hero card (large, close, z:60+) establishes the story. Supporting cards (medium z) add context. Ambient details (far back, z<0) create atmosphere.

**Composition principles**:
- Asymmetry creates energy. Symmetry feels static.
- Negative space gives cards room to breathe. A sparse canvas with 2-3 cards beats a cluttered one with 6.
- Proximity = relationship. Cards that belong together should cluster (close x/y, similar z). Unrelated cards stay apart.
- Depth = hierarchy. The most important card should be closest (highest z).

**When comparing things** (e.g., React vs Vue):
- Side-by-side, not overlapping. Give each equal visual weight.
- Use similar z-depth to show they're peers.
- Space them apart (x difference ≥ 40) so both are readable.

**When showing metrics or small cards**:
- Cluster them if they're related (temperature + humidity = weather group)
- Leave breathing room between clusters (y difference ≥ 15)
- Don't stack them vertically in a column — stagger diagonally

**Visual weight**:
- Cards with images are heavy — place them upper-center (y < 30) where eyes naturally land
- Multiple images? Space them apart (x difference ≥ 35), don't overlap
- Text-only cards can float anywhere

**Avoid**:
- Grid layouts (cards at x:0, x:33, x:66 in a row)
- Vertical stacks (same x, incrementing y)
- Overlapping is OK sparingly — a slight overlap adds depth. But if text overlaps text, they must be at very different z-depths (≥ 40 apart) so the back one blurs away. Don't stack cards directly on top of each other.

## Types
- card: {"x":12,"y":5,"z":55,"w":32,"title":"","sub":"","image":"url","tags":[],"items":[],"footer":""}
- metric: {"x":58,"y":35,"z":-15,"w":16,"value":"42","label":"Score","unit":"%"}
- steps: {"x":8,"y":25,"z":10,"w":30,"title":"","items":[{"time":"","title":"","detail":""}]}
- columns: {"x":15,"y":12,"z":5,"w":40,"title":"","cols":[{"name":"A","items":[""]}]}
- callout: {"x":45,"y":55,"z":-40,"w":28,"text":"quote","author":"","source":""}
- code: {"x":10,"y":45,"z":0,"w":38,"code":"","language":""}
- markdown: {"x":18,"y":8,"z":15,"w":35,"content":"# text"}
- media: {"x":5,"y":3,"z":65,"w":38,"url":"image-url","caption":""}
- chart: {"x":10,"y":30,"z":20,"w":30,"title":"","chartType":"bar","items":[{"label":"A","value":42},{"label":"B","value":78}]}
  chartType: "bar" (horizontal) or "column" (vertical)
- list: {"x":50,"y":10,"z":15,"w":25,"title":"","style":"todo","items":[{"text":"Item","done":false}]}
  style: "unordered", "ordered", or "todo"
- embed: {"x":10,"y":5,"z":50,"w":35,"url":"https://youtube.com/...","caption":""}
  Supports YouTube, Bilibili, Google Maps, and generic link previews

## Canvas Commands

Cards belong to the canvas, not to individual responses. You can bring old cards forward when they serve your new response.

- \`<!--vt:move {"title":"TITLE","x":50,"y":20,"z":40} -->\` — pull an existing card into your new composition. Use this when:
  - An old card IS the answer (user asks "tell me more about X" → move X to center)
  - An old card provides context for new cards (move it nearby as a reference)
  - You want to show contrast or evolution (old data next to new data)
- \`<!--vt:update {"title":"TITLE","newTitle":"New","sub":"Updated"} -->\` — change a card's content in place (e.g. update a metric value).

**Don't move cards just to rearrange.** Move only when the old card meaningfully participates in your new response — as the focus, as evidence, or as context. If it's not adding to the story, let it recede naturally.

**When to reuse vs create new:**
- If an existing card is directly relevant to your response → move it nearby your new cards
- If an existing card's data is outdated → update it with new info
- **If the user selected/pointed at a card → it's the focus. Move it to visual center (x:40-60, y:15-35, z:60+) and cluster related info around it.**
- Only create new cards for genuinely new information

**Visual center of gravity** — the sweet spot where eyes naturally land:
- x: 40-60 (center horizontal)
- y: 15-35 (upper-center, not dead center)
- z: 50+ (close, prominent)

When you want to emphasize something — a selected card, the main point, the answer — **move it here**. Related cards cluster nearby (Gestalt principle). This is where the story begins.

Old cards naturally recede as new ones appear. A canvas that evolves feels alive; one that only adds feels cluttered.

## Finding Images

When the user asks about movies, books, products, or anything visual:
1. Use web_search tool to find real images
2. Search "[title] poster" or "[title] 剧照" 
3. Use URLs from the search results' images array
4. NEVER guess or fabricate image URLs — always search first

Images are powerful visual anchors. Use them.
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
  console.log('[TTS] called with:', text?.slice(0, 80), 'gen:', gen)
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
  const retries = parseInt(img.dataset.retries || '0')
  
  if (retries === 0) {
    // Retry 1: proxy
    img.dataset.retries = '1'
    const proxied = PROXY + encodeURIComponent(img.dataset.originalSrc || img.src)
    console.log('[IMG] retry via proxy:', proxied.slice(0, 120))
    img.src = proxied
  } else if (retries === 1) {
    // Retry 2: images.weserv.nl (free image proxy/cache)
    img.dataset.retries = '2'
    const weserv = 'https://images.weserv.nl/?url=' + encodeURIComponent(img.dataset.originalSrc || img.src)
    console.log('[IMG] retry via weserv:', weserv.slice(0, 120))
    img.src = weserv
  } else {
    // All retries failed — hide
    img.style.display = 'none'
    console.warn('[IMG] all retries failed, hiding')
  }
}

function renderBlock(type, data) {
  const el = document.createElement('div')
  el.className = 'v-block'

  // Position — remap to safe area (center 90% width, top 75% height to avoid input bar)
  if (data.x != null) el.style.left = `${5 + (data.x / 100) * 90}%`
  if (data.y != null) el.style.top = `${5 + (data.y / 100) * 75}%`
  if (data.w) el.style.width = `${data.w}%`
  if (type === 'media' || (type === 'card' && data.image)) el.style.maxWidth = '380px'
  
  // New blocks always at front
  el.style.transform = `translateZ(0px) scale(1)`
  el.style.opacity = 1
  el.style.zIndex = 100
  el.style.transition = 'transform 1.2s cubic-bezier(.22,1,.36,1), opacity 1s cubic-bezier(.22,1,.36,1), filter 0.8s, box-shadow 0.6s, left 1s cubic-bezier(.22,1,.36,1), top 1s cubic-bezier(.22,1,.36,1)'

  // Entrance animation — starts slightly large and close, settles gently
  el.style.opacity = 0
  el.style.transform = `translateZ(40px) scale(1.06)`

  // Window title bar label
  const typeLabel = { card: 'card', metric: 'data', steps: 'timeline', columns: 'compare', callout: 'quote', code: 'code', markdown: 'note', media: 'media', chart: 'chart', list: 'list', embed: 'embed' }[type] || type
  const bar = `<div class="win-bar"><div class="win-dot"></div><span>${esc(typeLabel)}</span></div>`

  let body = ''
  switch (type) {
    case 'card':
      body = `
        ${data.image ? `<img src="${esc(data.image)}" data-original-src="${esc(data.image)}" loading="eager" referrerpolicy="no-referrer" style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)" onerror="imgErr(this)">` : ''}
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
        body = `<img src="${esc(data.url)}" data-original-src="${esc(data.url)}" loading="eager" referrerpolicy="no-referrer" style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)" onerror="imgErr(this)"><div class="win-body">${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}</div>`
      }
      break

    case 'chart': {
      // Pure CSS bar/column chart
      const items = data.items || []
      const maxVal = Math.max(...items.map(d => parseFloat(d.value) || 0), 1)
      const chartType = data.chartType || 'bar' // bar or column
      if (chartType === 'column') {
        body = `<div class="win-body">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}
          <div style="display:flex;align-items:flex-end;gap:8px;height:120px;padding:8px 0">
            ${items.map(d => {
              const pct = ((parseFloat(d.value) || 0) / maxVal) * 100
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <span style="font-size:11px;color:#8a7a60">${esc(String(d.value))}</span>
                <div style="width:100%;height:${pct}%;background:linear-gradient(180deg,#c8a96e,#8a7a60);border-radius:3px;min-height:4px;transition:height 0.6s"></div>
                <span style="font-size:10px;color:#6a5a4a">${esc(d.label || '')}</span>
              </div>`
            }).join('')}
          </div></div>`
      } else {
        body = `<div class="win-body">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}
          <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0">
            ${items.map(d => {
              const pct = ((parseFloat(d.value) || 0) / maxVal) * 100
              return `<div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:#6a5a4a;min-width:60px;text-align:right">${esc(d.label || '')}</span>
                <div style="flex:1;height:18px;background:rgba(0,0,0,0.06);border-radius:3px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#c8a96e,#8a7a60);border-radius:3px;transition:width 0.6s"></div>
                </div>
                <span style="font-size:11px;color:#8a7a60;min-width:35px">${esc(String(d.value))}</span>
              </div>`
            }).join('')}
          </div></div>`
      }
      break
    }

    case 'list': {
      const style = data.style || 'unordered' // unordered, ordered, todo
      const items = data.items || []
      const listItems = items.map((it, idx) => {
        const text = typeof it === 'string' ? it : it.text || it.title || ''
        const done = typeof it === 'object' && it.done
        if (style === 'todo') {
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:3px 0">
            <span style="font-size:14px;line-height:1.4">${done ? '✅' : '⬜'}</span>
            <span style="font-size:13px;color:${done ? '#8a7a60' : '#4a3a2a'};${done ? 'text-decoration:line-through;opacity:0.6' : ''}">${esc(text)}</span>
          </div>`
        } else if (style === 'ordered') {
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:3px 0">
            <span style="font-size:12px;color:#8a7a60;min-width:18px;font-weight:600">${idx + 1}.</span>
            <span style="font-size:13px;color:#4a3a2a">${esc(text)}</span>
          </div>`
        } else {
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:3px 0">
            <span style="font-size:8px;color:#8a7a60;margin-top:5px">●</span>
            <span style="font-size:13px;color:#4a3a2a">${esc(text)}</span>
          </div>`
        }
      }).join('')
      body = `<div class="win-body">${data.title ? `<h3>${esc(data.title)}</h3>` : ''}${listItems}</div>`
      break
    }

    case 'embed': {
      // Link preview / video / map embed
      const embedUrl = data.url || ''
      let embedContent = ''
      
      // YouTube
      const ytMatch = embedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
      if (ytMatch) {
        embedContent = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="width:100%;aspect-ratio:16/9;border:none;border-radius:4px" allowfullscreen></iframe>`
      }
      // Bilibili
      else if (embedUrl.includes('bilibili.com/video/')) {
        const bvMatch = embedUrl.match(/(BV[\w]+)/)
        if (bvMatch) {
          embedContent = `<iframe src="https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&page=1" style="width:100%;aspect-ratio:16/9;border:none;border-radius:4px" allowfullscreen></iframe>`
        }
      }
      // Map (Google Maps embed)
      else if (embedUrl.includes('maps') || data.type === 'map') {
        const q = encodeURIComponent(data.query || data.title || '')
        embedContent = `<iframe src="https://maps.google.com/maps?q=${q}&output=embed" style="width:100%;height:200px;border:none;border-radius:4px"></iframe>`
      }
      // Generic link preview
      else {
        embedContent = `<a href="${esc(embedUrl)}" target="_blank" rel="noopener" style="display:block;padding:12px;background:rgba(0,0,0,0.04);border-radius:6px;text-decoration:none;color:#4a3a2a">
          ${data.image ? `<img src="${esc(data.image)}" style="width:100%;border-radius:4px;margin-bottom:8px;object-fit:cover" onerror="imgErr(this)">` : ''}
          <div style="font-weight:600;font-size:14px">${esc(data.title || embedUrl)}</div>
          ${data.description ? `<div style="font-size:12px;color:#8a7a60;margin-top:4px">${esc(data.description)}</div>` : ''}
          <div style="font-size:11px;color:#a09080;margin-top:4px">${esc(new URL(embedUrl).hostname)}</div>
        </a>`
      }
      body = `<div class="win-body">${embedContent}${data.caption ? `<div class="footer">${esc(data.caption)}</div>` : ''}</div>`
      break
    }

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

let depthLevel = 0
let currentRoundDepth = -1
let currentRoundEls = new Set()
const selectedBlocks = new Set()

// ── Canvas commands (move/update) ──
function executeCommands(commands) {
  const space = $('canvasSpace')
  // Commands also start a new round — push old blocks back
  pushOldBlocks()
  for (const cmd of commands) {
    switch (cmd.cmd) {
      case 'move': {
        // Move card to new position — brings it to current group (front)
        const blocks = [...space.querySelectorAll('.v-block')]
        const target = (cmd.title || '').toLowerCase()
        blocks.forEach(el => {
          const title = el.querySelector('h2, h3, .big-label')?.textContent?.toLowerCase() || ''
          if (title.includes(target)) {
            // Promote to current group
            el.dataset.depth = depthLevel
            currentRoundEls.add(el)
            el.style.filter = 'none'
            el.style.opacity = 1
            el.style.transition = 'transform 1.2s cubic-bezier(.22,1,.36,1), opacity 0.8s, filter 0.8s, left 1s cubic-bezier(.22,1,.36,1), top 1s cubic-bezier(.22,1,.36,1)'
            if (cmd.x != null) el.style.left = `${5 + (cmd.x / 100) * 90}%`
            if (cmd.y != null) el.style.top = `${5 + (cmd.y / 100) * 75}%`
            const z = cmd.z != null ? cmd.z : 30
            el.dataset.intraZ = z
            el.dataset.pinned = '1'  // Don't push back when new cards arrive
            el.style.transform = `translateZ(${z}px) scale(1)`
            el.style.zIndex = 100 + Math.floor(z / 10)
          }
        })
        break
      }
      case 'update': {
        // Update card content — brings it to current group (front)
        const blocks = [...space.querySelectorAll('.v-block')]
        const target = (cmd.title || '').toLowerCase()
        blocks.forEach(el => {
          const title = el.querySelector('h2, h3, .big-label')?.textContent?.toLowerCase() || ''
          if (title.includes(target)) {
            el.dataset.depth = depthLevel
            el.dataset.pinned = '1'
            currentRoundEls.add(el)
            el.style.filter = 'none'
            el.style.opacity = 1
            if (cmd.newTitle) { const h = el.querySelector('h2, h3'); if (h) h.textContent = cmd.newTitle }
            if (cmd.sub) { const s = el.querySelector('.sub'); if (s) s.textContent = cmd.sub }
            if (cmd.footer) { const f = el.querySelector('.footer'); if (f) f.textContent = cmd.footer }
            if (cmd.value) { const v = el.querySelector('.big-num'); if (v) v.textContent = cmd.value }
          }
        })
        break
      }
    }
  }
}

function pushOldBlocks() {
  // Only push once per round
  if (currentRoundDepth === depthLevel) return
  depthLevel++
  currentRoundDepth = depthLevel
  
  // Preserve any cards already added by move/update commands this round
  const preserved = new Set(currentRoundEls)
  currentRoundEls = preserved
  // Update preserved cards to new depth level
  preserved.forEach(el => { el.dataset.depth = depthLevel })

  // Promote selected cards to current group before clearing selection
  selectedBlocks.forEach(el => {
    el.dataset.depth = depthLevel
    el.dataset.pinned = '1'
    currentRoundEls.add(el)
  })
  clearSelection()
  updateSelectionContext()

  const space = $('canvasSpace')
  space.querySelectorAll('.v-block').forEach(old => {
    if (currentRoundEls.has(old)) return
    const d = depthLevel - parseInt(old.dataset.depth || '0')
    if (d <= 0) return
    applyDepth(old, d)
  })
}

function applyDepth(el, d) {
  const z = -d * 160
  const s = Math.max(0.5, 1 - d * 0.12)
  const o = Math.max(0, 1 - d * 0.45)
  el.style.transform = `translateZ(${z}px) scale(${s})`
  el.style.opacity = o
  el.style.zIndex = Math.max(1, 50 - d * 20)
  el.style.filter = d >= 1 ? `blur(${d * 4}px)` : 'none'
  el.style.pointerEvents = 'auto'
  if (o <= 0) el.remove()
}

function renderBlocks(blocks, offset = 0) {
  const space = $('canvasSpace')
  $('greeting').classList.add('hidden')

  // Push old blocks back (once per send round)
  pushOldBlocks()

  // Render new blocks — reuse existing if content matches
  blocks.forEach(({ type, data }, i) => {
    const globalIndex = offset + i
    // Stable key: round + global index (not slice index)
    const contentKey = `r${depthLevel}-${globalIndex}`

    // Check for existing block from this round with same key
    let existing = null
    space.querySelectorAll('.v-block').forEach(old => {
      if (old.dataset.contentKey === contentKey) existing = old
    })

    // Intra-group z: each new card in this group is the closest.
    // Push existing cards in this group slightly back.
    const INTRA_PUSH = 15  // px per new card within group
    const groupCount = currentRoundEls.size
    
    // Push back all existing cards in current group (skip pinned/moved cards)
    currentRoundEls.forEach(sibling => {
      if (sibling.dataset.pinned) return  // moved/updated cards stay put
      const curZ = parseFloat(sibling.dataset.intraZ) || 0
      const pushed = curZ - INTRA_PUSH
      sibling.dataset.intraZ = pushed
      sibling.style.transform = `translateZ(${pushed}px) scale(1)`
      sibling.style.opacity = 1  // Ensure visible (might be mid-entrance)
      sibling.style.zIndex = 100 + Math.floor(pushed / 10)
    })
    
    // New card gets the front position — always in front of everything in this group
    const llmZ = data.z || 0
    // Find the max z in current group (including pinned/moved cards)
    let maxGroupZ = 0
    currentRoundEls.forEach(sibling => {
      const sz = parseFloat(sibling.dataset.intraZ) || 0
      if (sz > maxGroupZ) maxGroupZ = sz
    })
    const intraZ = Math.max(llmZ, maxGroupZ + INTRA_PUSH, groupCount * INTRA_PUSH)
    const zIndex = 100 + Math.floor(intraZ / 10)

    if (existing) {
      // Update content only — don't touch transform/opacity (let animations breathe)
      existing.dataset.depth = depthLevel
      existing.dataset.blockType = type
      existing.dataset.blockData = JSON.stringify(data)
      existing.style.zIndex = zIndex
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
    el.dataset.blockType = type
    el.dataset.blockData = JSON.stringify(data)
    // Keep initial transform from renderBlock (large + close) for entrance animation
    el.style.zIndex = zIndex
    el.style.transitionDelay = `${i * 0.08}s`
    setupBlockInteraction(el)
    space.appendChild(el)
    currentRoundEls.add(el)
    // Trigger entrance: gently settle from slightly large → natural size
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transform = `translateZ(${intraZ}px) scale(1)`
        el.style.opacity = 1
        // Clear delay after animation so interactions are instant
        el.addEventListener('transitionend', () => {
          el.style.transitionDelay = '0s'
        }, { once: true })
      })
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

// ── LLM Call (via agentic-claw) ──
let claw = null
let clawConfigKey = null

function ensureClaw() {
  const cfg = getConfig()
  const key = JSON.stringify([cfg.provider, cfg.apiKey, cfg.baseUrl, cfg.model, cfg.proxyUrl])
  if (claw && clawConfigKey === key) return claw
  if (claw) claw.destroy()

  // Make agenticAsk available for claw
  globalThis.agenticAsk = AgenticCore.agenticAsk

  claw = AgenticClaw.createClaw({
    apiKey: cfg.apiKey,
    provider: cfg.provider || 'openai',
    baseUrl: cfg.baseUrl || undefined,
    model: cfg.model || undefined,
    proxyUrl: (cfg.proxyEnabled && cfg.proxyUrl) ? cfg.proxyUrl : undefined,
    systemPrompt: SYSTEM,
    maxTokens: 4096,
    stream: true,
    tools: [{
      name: 'web_search',
      description: 'Search the web for information, images, news. Use for ANY question needing real-world facts, current events, image URLs, or verification.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          search_depth: { type: 'string', enum: ['basic', 'advanced'] },
          include_images: { type: 'boolean', description: 'Include image URLs' }
        },
        required: ['query']
      },
      execute: async (input) => executeTool('web_search', input, cfg.tavilyKey)
    }],
  })
  clawConfigKey = key
  return claw
}

async function callLLM(prompt, onToken, onSpeech) {
  const cfg = getConfig()
  if (!cfg.apiKey) {
    $('configOverlay').classList.add('open')
    return null
  }

  const c = ensureClaw()
  let accumulated = ''
  let speechFired = false

  const { answer } = await c.chat(prompt, (type, data) => {
    if (type === 'token' && data.text) {
      accumulated += data.text
      if (onToken) onToken(accumulated)

      // Check for speech tag completion during streaming
      if (!speechFired && onSpeech) {
        const sm = accumulated.match(/<!--vt:speech\s+([\s\S]*?)-->/)
        if (sm) {
          speechFired = true
          onSpeech(sm[1].trim())
        }
      }
    }
    if (type === 'tool' && cfg.showToolCalls) {
      showToolLog(`${data.name}: ${(data.input?.query || data.input?.url || '').slice(0, 60)}`)
    }
  })

  console.log('[LLM] full response:', answer)
  return answer
}

// ── Send (queue-based) ──
const sendQueue = []
let sendProcessing = false
let lastInputWasVoice = false

async function send() {
  const input = $('input')
  const text = input.value.trim()
  if (!text) return

  unlockAudio()
  input.value = ''

  // Capture selection context at send time
  const selCtx = window._selectedContext
  
  // Build canvas context — show LLM what's on screen (latest group = full data, older = titles only)
  const allCards = [...document.querySelectorAll('#canvasSpace .v-block')]
  const maxDepth = Math.max(...allCards.map(el => parseInt(el.dataset.depth || '0')), 0)
  
  const currentGroup = []
  const olderCards = []
  allCards.forEach(el => {
    const depth = parseInt(el.dataset.depth || '0')
    const type = el.dataset.blockType || 'card'
    const title = el.querySelector('h2, h3, .big-label')?.textContent || ''
    if (depth === maxDepth) {
      try {
        const data = JSON.parse(el.dataset.blockData || '{}')
        currentGroup.push(`<!--vt:${type} ${JSON.stringify(data)}-->`)
      } catch { if (title) currentGroup.push(`"${title}"`) }
    } else {
      if (title) olderCards.push(`"${title}" (depth:${depth})`)
    }
  })
  
  let fullPrompt = text
  if (currentGroup.length || olderCards.length) {
    let ctx = '[Current canvas state]\n'
    if (currentGroup.length) ctx += `Latest cards:\n${currentGroup.join('\n')}\n`
    if (olderCards.length) ctx += `Older (receding): ${olderCards.join(', ')}\n`
    fullPrompt = ctx + '\n' + fullPrompt
  }
  if (selCtx) {
    fullPrompt = `[User is pointing at these items on screen:\n${selCtx}\n]\n\n${fullPrompt}`
  }

  sendQueue.push(fullPrompt)
  if (!sendProcessing) processSendQueue()
}

async function processSendQueue() {
  sendProcessing = true
  while (sendQueue.length > 0) {
    const prompt = sendQueue.shift()
    showThinking()
    currentRoundDepth = -1
    currentRoundEls = new Set()

    let lastBlockCount = 0
    let lastCommandCount = 0
    let speechHandled = false
    try {
      const reply = await callLLM(prompt,
        // onToken: render blocks and execute commands as they stream in
        (partial) => {
          const { blocks, commands } = parseResponse(partial)
          if (commands.length > lastCommandCount) {
            executeCommands(commands.slice(lastCommandCount))
            lastCommandCount = commands.length
          }
          if (blocks.length > lastBlockCount) {
            renderBlocks(blocks.slice(lastBlockCount), lastBlockCount)
            lastBlockCount = blocks.length
          }
        },
        // onSpeech: fires once, before simulated streaming starts
        (speechText) => {
          speechHandled = true
          showBubble(speechText)
          playTTS(speechText)
        }
      )

      if (!reply) continue

      // Final pass — render any remaining blocks/commands and trigger TTS once
      const { speech, blocks, commands } = parseResponse(reply)
      console.log('[Send] final parse:', { speech, blockCount: blocks.length, commands: commands.length, blocks: JSON.stringify(blocks.map(b => ({ type: b.type, title: b.data.title, x: b.data.x, y: b.data.y, z: b.data.z }))), commandDetails: JSON.stringify(commands) })
      if (commands.length > lastCommandCount) executeCommands(commands.slice(lastCommandCount))
      if (blocks.length > lastBlockCount) {
        renderBlocks(blocks.slice(lastBlockCount), lastBlockCount)
      }

      // TTS fallback: only if speech wasn't already handled
      if (speech && !speechHandled) {
        showBubble(speech)
        playTTS(speech)
      } else if (!speech && !speechHandled && !blocks.length) {
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
  if (!lastInputWasVoice) $('input').focus()
  lastInputWasVoice = false
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
    console.log('[STT] Web Speech result:', text)
    webSpeechRecognition = null
    $('micBtn').classList.remove('recording')
    if (text) {
      $('input').value = text
      lastInputWasVoice = true
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

// Convert webm blob to wav (some providers don't support webm)
async function webmToWav(blob) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const samples = audioBuffer.getChannelData(0)
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  // WAV header
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  audioCtx.close()
  return new Blob([buffer], { type: 'audio/wav' })
}

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

  showThinking()
  try {
    // Convert webm to wav (bltcy doesn't support webm)
    const wavBlob = await webmToWav(blob)
    const form = new FormData()
    form.append('file', wavBlob, 'audio.wav')
    form.append('model', 'whisper-1')
    form.append('language', 'zh')
    const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.ttsApiKey}` },
      body: form
    })
    if (!res.ok) { hideThinking(); showBubble('识别失败: ' + res.status); return }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('json')) { hideThinking(); showBubble('识别服务不可用'); return }
    const { text } = await res.json()
    console.log('[STT] Whisper result:', text)
    if (text?.trim()) {
      $('input').value = text.trim()
      $('bubble').classList.remove('visible')
      // thinking stays visible — send() will manage it
      lastInputWasVoice = true
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
  return active?.dataset.voice || 'nova'
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

// ── Spacebar = push-to-talk (when not typing in input) ──
// Click on canvas blurs input so spacebar works
$('canvasSpace').addEventListener('click', e => {
  if (e.target.closest('.v-block')) return  // Don't blur when clicking cards
  $('input').blur()
})

document.addEventListener('keydown', e => {
  if (e.key !== ' ' || e.repeat) return
  if (document.activeElement === $('input') || $('configOverlay').classList.contains('open')) return
  e.preventDefault()
  $('micBtn').classList.add('active')
  startRecording()
})

document.addEventListener('keyup', e => {
  if (e.key !== ' ') return
  if (document.activeElement === $('input') || $('configOverlay').classList.contains('open')) return
  e.preventDefault()
  $('micBtn').classList.remove('active')
  stopRecording()
})
