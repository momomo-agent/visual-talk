# 语音交互对比

## 1. TTS：playTTS 流程（AudioContext decode + Audio 元素 fallback + retry/backoff）

### Original (`app.js`)
- `++ttsGeneration` 取消旧请求，每次 await 后检查 `gen !== ttsGeneration`
- 守卫：`ttsEnabled` / `ttsApiKey` / `ttsBaseUrl` / `text?.trim()` / 正在录音中跳过
- 停止上一段：`currentAudio.pause()`
- `POST ${baseUrl}/v1/audio/speech` → `{ model, voice, input, response_format:'mp3' }`
- fetch 重试 3 次，backoff `500 * (attempt + 1)` ms
- `arrayBuffer` → `AudioContext.decodeAudioData` → `BufferSource.start(0)`
- decodeAudioData 失败 → `new Blob` → `URL.createObjectURL` → `new Audio(blobUrl).play()`
- `onended` → `currentAudio = null`，硬编码 `dismissBubble(3000)`
- `unlockAudio()`：用户手势时 `ctx.resume()`

### Vue (`useTTS.js`)
- `++generation` + stale 检查 — 逻辑相同
- 守卫相同，额外通过 `isRecording.value` 判断（而非检查 `mediaRecorder.state`）
- `cleanUrl()` 内聚到 composable（去掉尾部 `/` 和 `/v1`）
- fetch retry 参数完全相同（3 次，`500*(attempt+1)` ms）
- AudioContext → Audio fallback 流程一致
- `onended` → `onEndCallback?.()` 替代硬编码 `dismissBubble`；App.vue 里 `tts.onPlaybackEnd(() => dismissBubble(3000))`
- 新增 `isPlaying` ref 响应式状态
- 新增 `stopTTS()` 公开方法（`generation++` + `pause`），原版散在 `startRecording()` 里手动做

### Verdict
**功能等价 ✅** — retry/backoff 参数、AudioContext→Audio fallback、generation 取消机制完全一致。Vue 版改进：`isPlaying` 响应式状态、`onPlaybackEnd` 回调解耦 bubble 控制、`stopTTS()` 封装更干净。无功能缺失。

---

## 2. STT Web Speech：onresult/onerror/onend + "说话中..." bubble

### Original
```js
startWebSpeech()
  recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.interimResults = false
  showBubble('说话中...')           // 无 duration → 常驻

  onresult → transcript → $('input').value = text → send()
           → 空: showBubble('没听清，再说一次？', 3000)
  onerror  → showBubble('识别错误: ' + e.error, 4000)
  onend    → webSpeechRecognition = null; removeClass('recording')
```

### Vue (`useSTT.js` + `App.vue`)
```js
startWebSpeech()
  同：new SR(), lang='zh-CN', interimResults=false
  onStart?.('说话中...')            // 回调，App.vue 里 showBubble(label)

  onresult → onResult?.(text)       // App.vue: handleSend(text)
           → 空: onError?.('没听清...')
  onerror  → onError?.('识别错误: ' + e.error)
  onend    → webSpeechRecognition = null; isRecording.value = false
```

### Verdict
**功能等价 ✅** — 识别参数、错误文案、结果判空逻辑完全一致。Vue 版用回调 (`onResult`/`onError`/`onStart`) 替代直接 DOM 操作。`isRecording` ref 替代手动 `classList` 操作。

注意：原版 onerror 的 bubble duration 是 4000ms，Vue 版 `onError` 在 App.vue 里统一用 `showBubble(msg, 3000)` — **duration 从 4000→3000，微差异**，不影响功能。

---

## 3. STT Whisper：webmToWav 转换 + API 调用参数

### Original
```js
webmToWav(blob):
  AudioContext → decodeAudioData → getChannelData(0)
  numChannels = 1, sampleRate = audioBuffer.sampleRate
  手写 WAV header (44 bytes) + PCM 16-bit signed
  audioCtx.close()

transcribeAndSend(blob):
  守卫：ttsBaseUrl / ttsApiKey
  showThinking()
  webmToWav(blob) → FormData { file:'audio.wav', model:'whisper-1', language:'zh' }
  POST ${baseUrl}/v1/audio/transcriptions
  检查 content-type 包含 'json'
  成功 → $('input').value = text → send()
  失败 → hideThinking() + showBubble
```

### Vue (`useSTT.js`)
```js
webmToWav(blob):
  完全相同的 WAV header 逻辑，numChannels 硬编码 1
  ctx.close()

transcribe(blob):
  守卫同，增加 tts.cleanUrl() 清理 baseUrl
  onThinkingStart?.()
  FormData 参数相同：{ file:'audio.wav', model:'whisper-1', language:'zh' }
  POST /v1/audio/transcriptions
  content-type 检查相同
  成功 → onResult?.(text)
  失败 → onThinkingEnd?.() + onError?.(msg)
```

### Verdict
**功能等价 ✅** — `webmToWav` 字节级一致。API 参数（model `whisper-1`、language `zh`、文件名 `audio.wav`）完全相同。两版都没传 `response_format`（默认 json，正确）。Vue 版额外做了 URL cleanUrl 处理，更健壮。

---

## 4. 麦克风按钮：click/touchstart/touchend 事件 + 空格键 push-to-talk

### Original
```js
// 按钮事件
$('micBtn').addEventListener('mousedown', startRecording)
$('micBtn').addEventListener('mouseup', stopRecording)
$('micBtn').addEventListener('touchstart', startRecording)
$('micBtn').addEventListener('touchend', stopRecording)

// 空格键 push-to-talk
keydown(Space) → 非 input 焦点 && 非 config overlay → micBtn.classList.add('active') → startRecording()
keyup(Space)   → micBtn.classList.remove('active') → stopRecording()

// 画布点击 → input.blur() → 使空格键生效
$('canvasSpace').addEventListener('click', ...) → $('input').blur()

startRecording():
  1. currentAudio.pause() + ttsGeneration++   // 停 TTS
  2. clearTimeout(bubbleTimer); bubble 隐藏
  3. 分流 webSpeech → startWebSpeech() / startWhisper()

stopRecording():
  1. micReleased = true
  2. 立即 dismiss bubble
  3. Web Speech: held<300ms → abort('长按说话'); else → stop()
  4. Whisper: mediaRecorder.stop()
```

### Vue (`InputBar.vue` + `App.vue`)
```html
<!-- InputBar.vue -->
<button class="mic-btn"
  :class="{ recording, active: micActive }"
  @mousedown.prevent="$emit('mic-down')"
  @mouseup.prevent="$emit('mic-up')"
  @touchstart.prevent="$emit('mic-down')"
  @touchend.prevent="$emit('mic-up')"
>
```
```js
// App.vue
keydown(Space) → 非 input/textarea/select 焦点 && 非 config open && !repeat
               → spaceDown.value = true → startRecording()
keyup(Space)   → spaceDown.value = false → stopRecording()

// 画布点击 → inputBar.blur()
<CanvasSpace @click-canvas="blurInput" />

startRecording():
  bubbleVisible = false → rawStartRecording()
  // useSTT 内部：tts.stopTTS() + tts.isRecording = true

stopRecording():
  bubbleVisible = false → rawStopRecording()
  // useSTT 内部：micReleased=true, tts.isRecording=false
```

### Verdict
**功能等价 ✅** — 事件绑定完全对应：mousedown/mouseup + touchstart/touchend。空格键 push-to-talk 逻辑一致（检查焦点、防 repeat、config overlay 守卫）。Vue 版用 `.prevent` 修饰符替代手动 `preventDefault`，用 `spaceDown` ref 驱动 `:active` class 替代手动 `classList`。

改进：Vue 版空格键的焦点检查用 `document.activeElement?.matches('input, textarea, select')` 更全面（原版只检查 `$('input')`）。

---

## 5. Voice picker：chip 选中态 + preview 试听

### Original (`app.js`)
```js
$('voicePicker').addEventListener('click', e => {
  const chip = e.target.closest('.voice-chip')
  if (!chip) return
  setActiveVoice(chip.dataset.voice)        // 遍历所有 .voice-chip toggle .active
  saveConfig()
  chip.classList.add('previewing')           // 视觉反馈
  setTimeout(() => chip.classList.remove('previewing'), 600)
  playTTS('Hello, this is ' + chip.dataset.voice)
})

// setActiveVoice: document.querySelectorAll('.voice-chip').forEach(toggle)
// getActiveVoice: document.querySelector('.voice-chip.active')?.dataset.voice || 'nova'
```

### Vue (`ConfigPanel.vue`)
```html
<button v-for="v in voices" :key="v"
  class="voice-chip"
  :class="{ active: config.ttsVoice === v, previewing: previewingVoice === v }"
  @click="selectVoice(v)"
>{{ v }}</button>
```
```js
function selectVoice(v) {
  config.ttsVoice = v                       // Pinia store 自动持久化
  previewingVoice.value = v                  // 视觉反馈
  setTimeout(() => { previewingVoice.value = '' }, 600)
  tts.playTTS('Hello, this is ' + v)
}
```

### Verdict
**功能等价 ✅** — 选中态用 `config.ttsVoice === v` 驱动 `.active` class（响应式替代手动 DOM toggle）。preview 600ms `.previewing` class + `playTTS('Hello, this is ' + v)` 完全一致。Vue 版用 Pinia store 的自动 watch/persist 替代手动 `saveConfig()` 调用。

默认 voice：原版 `getActiveVoice()` fallback `'nova'`，Vue 版 config store 初始值也是 `'nova'` — 一致。

---

## 总结

| 项目 | 功能等价 | Vue 版差异 |
|------|----------|-----------|
| TTS playTTS | ✅ | +`isPlaying` ref, +`onPlaybackEnd` 回调, +`stopTTS()` 封装 |
| STT Web Speech | ✅ | 错误 bubble duration 4000→3000（微差异）; 回调解耦 DOM |
| STT Whisper | ✅ | +`cleanUrl` 处理; webmToWav 字节级一致 |
| 麦克风按钮 | ✅ | +`.prevent` 修饰符; 空格焦点检查更全面 |
| Voice picker | ✅ | Pinia 驱动 vs 手动 DOM toggle; preview 逻辑完全一致 |

**结论：语音交互 5 项全部功能等价，无遗漏。Vue 版在每一项上都做了更好的关注点分离（composable 封装、回调解耦、响应式状态），核心参数和流程逐项对齐。**
