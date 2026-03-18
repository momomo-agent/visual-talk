# Visual Talk → agentic-claw Migration Spec

## Goal
Replace the hand-rolled `callLLM` + `history` + tool loop in app.js with `agentic-claw` (which bundles `agentic-core` + `agentic-memory`).

## Branch
Work on branch `claw-based`. Do NOT push to main.

## Architecture

### Current (app.js ~1000 lines)
```
app.js manually does:
├── callLLM() — provider switching (anthropic/openai), proxy support, non-streaming
├── history[] — manual array, no trimming, no persistence  
├── Tool loop — manual tool_use/tool_result handling
├── parseResponse() — extract <!--vt:speech--> and <!--vt:block-->
├── TTS (playTTS) — yunwu.ai OpenAI-compatible
├── STT (transcribeAndSend) — whisper API
├── Canvas rendering (renderBlocks, etc.)
└── UI interaction (selection, drag, hover, depth)
```

### Target
```
app.js uses agentic-claw:
├── claw = createClaw({ apiKey, provider, model, baseUrl, tools, systemPrompt })
├── claw.chat(prompt, emit) — replaces callLLM + history + tool loop
├── emit('token', data) — real streaming tokens
├── emit('tool', data) — tool call events for showToolLog
├── parseResponse() — KEEP AS IS (vt:speech/block parsing)
├── TTS/STT — KEEP AS IS
├── Canvas rendering — KEEP AS IS
└── UI interaction — KEEP AS IS
```

## What Changes

### 1. Load agentic libraries via script tags (no build step)
```html
<script src="https://momomo-agent.github.io/agentic/agentic-agent.js"></script>
<script src="https://momomo-agent.github.io/agentic-memory/memory.js"></script>
<script src="https://momomo-agent.github.io/agentic-claw/claw.js"></script>
```
Or use jsdelivr CDN from npm if published. Check what's available.

### 2. Replace callLLM with claw.chat
- createClaw on config save/load with current settings
- claw.chat(prompt, emit) for each message
- emit('token', {text}) feeds into onToken-like callback for block rendering
- emit('tool', {name, input}) feeds into showToolLog
- Remove the entire callLLM function
- Remove manual history[] management
- Remove manual Anthropic/OpenAI message format conversion

### 3. Tool definitions
Current: TOOLS_ANTHROPIC / TOOLS_OPENAI in tools.js, plus executeTool/tavilySearch
Target: Pass tools as custom tool objects to createClaw:
```js
const claw = createClaw({
  tools: [{
    name: 'web_search',
    description: '...',
    parameters: { ... },
    execute: async (input) => tavilySearch(input, tavilyKey)
  }]
})
```
Keep tavilySearch implementation in tools.js.

### 4. Proxy support
agentic-core supports proxyUrl natively. Pass it through.

### 5. Streaming
agentic-core supports real SSE streaming. This is a major upgrade:
- Currently: stream:false, then fake streaming with word-by-word delay
- Target: stream:true, real token-by-token rendering
- Speech can fire as soon as the complete <!--vt:speech ...--> tag arrives in accumulated tokens
- Blocks render as each complete <!--vt:block ...--> arrives

### 6. onSpeech architecture
Currently: callLLM has onSpeech callback fired before simulated streaming.
With real streaming: accumulate tokens, parse for complete speech tag, fire TTS once detected.

## What Does NOT Change
- parseResponse() function
- renderBlock() / renderBlocks() / canvas rendering
- showBubble() / playTTS()
- STT (startRecording / stopRecording / transcribeAndSend)
- Block interaction (select, drag, hover)
- 3D parallax
- Config UI (just wire it to createClaw)
- Style (style.css untouched)

## Testing Checklist (Regression)
After migration, ALL of these must work:

1. **Basic chat** — type text, get blocks rendered
2. **Speech/TTS** — speech bubble appears, TTS plays
3. **Tool use** — web_search works, images load
4. **Streaming** — blocks appear progressively (now real streaming!)
5. **Queue** — send A, then B while A processing → both render separately
6. **Voice input** — push-to-talk records, transcribes, sends
7. **Selection** — click block to select, shift-click multi-select
8. **Depth push** — new response pushes old blocks back
9. **Config** — all settings save/load correctly
10. **Provider switch** — both anthropic and openai work
11. **Proxy** — works with proxy enabled
12. **Voice picker** — voice selection persists, preview works
13. **Error handling** — API errors show in bubble, don't crash

## Blue Team Challenges
After basic migration works, test these edge cases:

1. What happens if agentic-core CDN is down? (graceful fallback?)
2. What if LLM returns no tool_calls but stop_reason is not end_turn?
3. What if TTS CORS fails during streaming? (shouldn't block rendering)
4. What if user sends 5 messages rapidly? (queue still works?)
5. Does the claw.chat handle the <!--vt:...--> format correctly through its history/memory?
6. Does memory auto-trim work for long conversations?

## If agentic-claw Has Bugs
Clone agentic-claw (or agentic-core/agentic-memory) locally, fix the bug, commit, push.
Repos:
- https://github.com/momomo-agent/agentic-core
- https://github.com/momomo-agent/agentic-memory  
- https://github.com/momomo-agent/agentic-claw

## Files to Modify
- `index.html` — add script tags, remove tools.js (or keep if cleaner)
- `app.js` — replace callLLM with claw, keep everything else
- `tools.js` — simplify (just tavilySearch, no tool defs needed)

## Taste Guidelines
- No unnecessary abstractions. If claw makes something simpler, use it. If it makes something more complex, don't.
- The migration should make app.js shorter, not longer.
- Real streaming is the main UX win. Make it feel alive.
- Don't wrap claw in another layer. Use it directly.
