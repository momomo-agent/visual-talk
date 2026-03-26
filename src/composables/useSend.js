import { ref } from 'vue'
import { useCanvasStore } from '../stores/canvas.js'
import { useConfigStore } from '../stores/config.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useForestStore } from '../stores/forest.js'
import { useSketchStore } from '../stores/sketch.js'
import { useLLM } from './useLLM.js'
import { parseResponse } from '../lib/parser.js'

/**
 * useSend — Orchestrates the send flow
 * 
 * Data flow:
 *   User input → LLM streaming → timeline.addOperation()
 *                                         ↓
 *                                 timeline: computeCanvas → canvas.applySnapshot()
 * 
 * useSend ONLY writes to timeline. Canvas updates automatically.
 * 
 * Fluid TTS sync: cards appear in sync with TTS playback progress.
 * Speech is detected early in the stream → TTS fetch starts immediately.
 * Cards queue up during streaming. When TTS audio is ready and starts
 * playing, cards are released at evenly-spaced progress points.
 * Fallback: if TTS is off/fails/times out, cards render immediately.
 */
export function useSend({ tts } = {}) {
  const sendQueue = ref([])
  const sendProcessing = ref(false)
  const isThinking = ref(false)
  const bubbleText = ref('')
  const bubbleVisible = ref(false)

  const { callLLM, toolLogs } = useLLM()

  let bubbleTimer = null

  function showBubble(text, duration) {
    bubbleText.value = text
    bubbleVisible.value = true
    clearTimeout(bubbleTimer)
    if (duration) {
      bubbleTimer = setTimeout(() => {
        bubbleVisible.value = false
      }, duration)
    }
  }

  function dismissBubble(delayMs = 3000) {
    clearTimeout(bubbleTimer)
    if (delayMs <= 0) {
      bubbleVisible.value = false
      return
    }
    bubbleTimer = setTimeout(() => {
      bubbleVisible.value = false
    }, delayMs)
  }

  /**
   * Process vt:move/vt:update commands from LLM output.
   * Resolves target cards via timeline data (id or title match).
   */
  function processCommands(commands, nodeId, timeline) {
    commands.forEach(cmd => {
      let matchedIds = []

      // Key-based matching (primary — precise, unique)
      if (cmd.key) {
        matchedIds = timeline.findCardsByKey(nodeId, cmd.key)
      }

      // Title fallback (legacy — fuzzy, noise-tolerant)
      if (!matchedIds.length && cmd.title) {
        const target = cmd.title.toLowerCase()
        matchedIds = timeline.findCardsByTitle(nodeId, target)
      }

      if (cmd.cmd === 'move') {
        matchedIds.forEach(cardId => {
          const x = cmd.x != null ? 5 + (cmd.x / 100) * 90 : undefined
          const y = cmd.y != null ? 5 + (cmd.y / 100) * 75 : undefined
          const z = cmd.z ?? 30
          timeline.addOperation(nodeId, { op: 'move', cardId, to: { x, y, z } })
        })
      } else if (cmd.cmd === 'update') {
        const { cmd: _, key: __, ...rawChanges } = cmd
        matchedIds.forEach(cardId => {
          timeline.addOperation(nodeId, { op: 'update', cardId, changes: rawChanges })
        })
      } else if (cmd.cmd === 'dock') {
        matchedIds.forEach(cardId => {
          timeline.dockCard(cardId)
        })
      } else if (cmd.cmd === 'undock') {
        matchedIds.forEach(cardId => {
          timeline.undockCard(cardId)
        })
      }
    })
  }

  /**
   * Process new blocks from parsed LLM output.
   * Shared between streaming callback and final pass.
   * 
   * @param {Array} blocks - all parsed blocks so far
   * @param {number} fromIndex - index to start processing from (state.lastBlockCount)
   * @param {string} nodeId - timeline node id
   * @param {Object} timeline - timeline store
   * @param {Object} canvas - canvas store
   * @param {Object} state - mutable { pushRecorded, lastBlockCount }
   */
  function processBlocks(blocks, fromIndex, nodeId, timeline, canvas, state) {
    if (blocks.length <= fromIndex) return

    blocks.slice(fromIndex).forEach((b, i) => {
      const idx = fromIndex + i
      if (!state.pushRecorded) {
        // Record selected card promotions BEFORE push
        // so computeCanvas can replay them during navigation
        canvas.selectedIds.forEach(id => {
          timeline.addOperation(nodeId, { op: 'promote', cardId: id })
        })
        canvas.clearSelection()
        timeline.addOperation(nodeId, { op: 'push' })
        state.pushRecorded = true
      }
      // Write to timeline — canvas updates automatically via addOperation
      timeline.addOperation(nodeId, {
        op: 'create',
        globalIndex: idx,
        card: {
          type: b.type,
          data: { ...b.data },
          contentKey: `n${nodeId}-${idx}`,
        },
      })
    })
    state.lastBlockCount = blocks.length
  }

  async function send(text) {
    if (!text?.trim()) return

    const canvas = useCanvasStore()
    const timeline = useTimelineStore()

    // Build context from timeline data (not canvas view layer)
    const selCtx = timeline.getSelectedContext(null, Array.from(canvas.selectedIds))
    const canvasCtx = timeline.getCanvasContext()

    let fullPrompt = text.trim()
    if (canvasCtx) {
      fullPrompt = canvasCtx + '\n' + fullPrompt
    }
    if (selCtx) {
      fullPrompt = `[User is pointing at these items on screen:\n${selCtx}\n]\n\n${fullPrompt}`
    }

    sendQueue.value.push({ prompt: fullPrompt, userMessage: text.trim() })
    if (!sendProcessing.value) processSendQueue()
  }

  async function processSendQueue() {
    sendProcessing.value = true
    const canvas = useCanvasStore()
    const configStore = useConfigStore()
    const timeline = useTimelineStore()

    while (sendQueue.value.length > 0) {
      const { prompt, userMessage } = sendQueue.value.shift()
      isThinking.value = true
      canvas.isStreaming = true

      // Always send from activeTip — viewing history doesn't change where we send
      const parentId = timeline.getBranchPoint()
      const nodeId = timeline.branchFrom(parentId, userMessage)

      const state = { pushRecorded: false, lastBlockCount: 0 }
      let lastCommandCount = 0
      let lastSketchCount = 0
      const sketch = useSketchStore()
      sketch.startStreaming() // Signal streaming mode — sketches come from live feed
      let speechHandled = false
      let reply = null

      // ── Fluid TTS state ──
      // Blocks queue up here during streaming while TTS loads
      const pendingBlocks = []
      let ttsAudioPromise = null   // Promise<ArrayBuffer|null>
      let ttsPlaybackInfo = null   // { duration } after playback starts
      let fluidActive = false      // true when we're doing synced card release
      let fluidDone = false        // true when all queued cards have been flushed
      let cardReleaseTimers = []   // setTimeout ids for card release
      let streamingDone = false    // true when LLM streaming is complete
      let currentSpeechText = ''   // speech text for breath point calculation

      // Flush all pending blocks immediately (fallback / no-TTS path)
      function flushAllPending() {
        if (pendingBlocks.length === 0) return
        processBlocks(
          pendingBlocks.map((_, i) => pendingBlocks[i]),
          0, nodeId, timeline, canvas,
          // We need to use the main state for pushRecorded tracking
          state
        )
        // Actually: processBlocks expects the full blocks array and fromIndex.
        // pendingBlocks are blocks that haven't been sent to processBlocks yet.
        // We need to call processBlocks with proper indices.
      }

      // Release block at index from pending queue
      function releaseBlock(pendingIndex) {
        const b = pendingBlocks[pendingIndex]
        if (!b || b._released) return
        b._released = true

        if (!state.pushRecorded) {
          canvas.selectedIds.forEach(id => {
            timeline.addOperation(nodeId, { op: 'promote', cardId: id })
          })
          canvas.clearSelection()
          timeline.addOperation(nodeId, { op: 'push' })
          state.pushRecorded = true
        }

        timeline.addOperation(nodeId, {
          op: 'create',
          globalIndex: b._globalIndex,
          card: {
            type: b.type,
            data: { ...b.data },
            contentKey: `n${nodeId}-${b._globalIndex}`,
          },
        })
      }

      function releaseAllPending() {
        for (let i = 0; i < pendingBlocks.length; i++) {
          releaseBlock(i)
        }
        state.lastBlockCount = pendingBlocks.length
        fluidDone = true
      }

      /**
       * Compute card release time points based on sentence boundaries.
       * 
       * Idea: speech text is split at sentence-ending punctuation (。！？，；、…).
       * Each boundary becomes a "breath point" — a natural moment for a card
       * to appear. Cards are distributed across these breath points.
       * 
       * If there are more cards than sentences, multiple cards share a breath point.
       * If there are more sentences than cards, cards land on evenly-spaced sentences.
       * 
       * Time is estimated by character position ratio — not perfect, but TTS
       * speaks at roughly constant speed so the error is <0.5s typically.
       */
      function computeBreathPoints(speechText, totalCards, audioDuration) {
        if (!speechText || totalCards === 0) return []

        // Find sentence boundaries (Chinese + English punctuation)
        const breakPoints = []
        const breakChars = /[。！？；…!?;]/
        for (let i = 0; i < speechText.length; i++) {
          if (breakChars.test(speechText[i])) {
            breakPoints.push(i)
          }
        }

        // If no punctuation found, fall back to comma-level breaks
        if (breakPoints.length === 0) {
          for (let i = 0; i < speechText.length; i++) {
            if (/[，、,]/.test(speechText[i])) {
              breakPoints.push(i)
            }
          }
        }

        // If still nothing, use evenly-spaced character positions
        if (breakPoints.length === 0) {
          for (let i = 1; i <= totalCards; i++) {
            const frac = i / (totalCards + 1)
            breakPoints.push(Math.floor(frac * speechText.length))
          }
        }

        const totalChars = speechText.length

        // Distribute cards across breath points
        // Pick `totalCards` evenly-spaced indices from breakPoints
        const timeFractions = []
        if (totalCards === 1) {
          // Single card: first breath point
          const bp = breakPoints[0]
          timeFractions.push(bp / totalChars)
        } else if (breakPoints.length <= totalCards) {
          // More cards than sentences — put cards at every breath point,
          // then distribute remaining cards evenly in the last segment
          breakPoints.forEach(bp => {
            timeFractions.push(bp / totalChars)
          })
          // Fill remaining with even spacing after last break
          const lastBp = breakPoints[breakPoints.length - 1]
          const remaining = totalCards - breakPoints.length
          for (let i = 1; i <= remaining; i++) {
            const frac = lastBp / totalChars + (i / (remaining + 1)) * (1 - lastBp / totalChars)
            timeFractions.push(frac)
          }
        } else {
          // More sentences than cards — pick evenly-spaced breath points
          for (let i = 0; i < totalCards; i++) {
            const bpIndex = Math.round((i / (totalCards - 1)) * (breakPoints.length - 1))
            timeFractions.push(breakPoints[bpIndex] / totalChars)
          }
        }

        // Convert fractions to milliseconds, clamped to 5%-90% of duration
        return timeFractions
          .sort((a, b) => a - b)
          .map(frac => Math.max(0.05, Math.min(0.90, frac)) * audioDuration * 1000)
      }

      // Schedule card releases synced to TTS duration using sentence breath points
      function scheduleFluidRelease(audioDuration) {
        const total = pendingBlocks.length
        if (total === 0) { fluidDone = true; return }

        const delays = computeBreathPoints(currentSpeechText, total, audioDuration)

        for (let i = 0; i < total; i++) {
          const delayMs = delays[i] ?? (((i + 1) / (total + 1)) * audioDuration * 1000)
          const timer = setTimeout(() => {
            releaseBlock(i)
          }, delayMs)
          cardReleaseTimers.push(timer)
        }

        // Safety: release everything at 95% mark
        const safetyTimer = setTimeout(() => {
          releaseAllPending()
        }, audioDuration * 950)
        cardReleaseTimers.push(safetyTimer)

        fluidDone = false
      }

      // Check if we should start fluid release now
      // Called when: (1) TTS audio is ready, (2) streaming is done
      async function tryStartFluidRelease() {
        if (fluidActive || fluidDone) return
        if (!ttsPlaybackInfo) return

        fluidActive = true
        scheduleFluidRelease(ttsPlaybackInfo.duration)
      }

      try {
        const cfg = configStore.getConfig()
        if (!cfg.apiKey) {
          showBubble('请先配置 API Key ⚙️', 3000)
          return 'need-config'
        }

        reply = await callLLM(prompt,
          // onToken — streaming callback
          (partial) => {
            const { blocks, commands, sketches } = parseResponse(partial)

            // Process new commands immediately (commands don't need sync)
            if (commands.length > lastCommandCount) {
              processCommands(commands.slice(lastCommandCount), nodeId, timeline)
              lastCommandCount = commands.length
            }

            // Process new sketches — full replace during streaming
            if (sketches.length > 0) {
              sketch.setLive(sketches)
              lastSketchCount = sketches.length
            }

            // ── Card handling: queue or immediate ──
            if (blocks.length > state.lastBlockCount) {
              if (ttsAudioPromise) {
                // TTS is loading — queue new blocks for synced release
                for (let i = state.lastBlockCount; i < blocks.length; i++) {
                  const b = { ...blocks[i], _globalIndex: i, _released: false }
                  pendingBlocks.push(b)
                }
                state.lastBlockCount = blocks.length

                // If TTS already playing, schedule newly arrived blocks too
                if (ttsPlaybackInfo && fluidActive) {
                  // Reschedule with updated count
                  cardReleaseTimers.forEach(t => clearTimeout(t))
                  cardReleaseTimers = []
                  scheduleFluidRelease(ttsPlaybackInfo.duration)
                }
              } else {
                // No TTS — render immediately (original behavior)
                processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
              }
            }
          },
          // onSpeech — fires when <!--vt:speech ...--> is detected in stream
          (speechText) => {
            speechHandled = true
            currentSpeechText = speechText
            showBubble(speechText)

            if (tts && cfg.ttsEnabled) {
              // Start TTS fetch immediately — don't wait for streaming to finish
              ttsAudioPromise = tts.fetchTTSAudio(speechText)

              // When audio arrives, start playing and schedule card release
              ttsAudioPromise.then(async (audioBuffer) => {
                if (!audioBuffer) {
                  // TTS failed — flush all pending cards immediately
                  releaseAllPending()
                  return
                }

                const info = await tts.playBuffer(audioBuffer)
                if (!info) {
                  releaseAllPending()
                  return
                }

                ttsPlaybackInfo = info

                if (streamingDone) {
                  // Streaming already finished — all blocks are queued, schedule now
                  tryStartFluidRelease()
                } else {
                  // Streaming still going — we'll schedule when it's done
                  // But start with what we have so far
                  tryStartFluidRelease()
                }
              }).catch(() => {
                releaseAllPending()
              })
            } else {
              // TTS disabled — just show bubble, cards render normally
              tts?.playTTS(speechText)
            }
          }
        )

        streamingDone = true

        if (!reply) {
          // Empty response — remove the node
          timeline.removeNode(nodeId)
          continue
        }

        // Final pass — catch any remaining blocks/commands
        const { speech, blocks, commands, sketches } = parseResponse(reply)

        if (commands.length > lastCommandCount) {
          processCommands(commands.slice(lastCommandCount), nodeId, timeline)
        }

        if (sketches.length > 0) {
          sketch.setLive(sketches)
        }

        // Handle remaining blocks from final parse
        if (blocks.length > state.lastBlockCount) {
          if (ttsAudioPromise) {
            // Queue remaining blocks
            for (let i = state.lastBlockCount; i < blocks.length; i++) {
              const b = { ...blocks[i], _globalIndex: i, _released: false }
              pendingBlocks.push(b)
            }
            state.lastBlockCount = blocks.length

            // Try to start/reschedule fluid release
            if (ttsPlaybackInfo) {
              if (fluidActive) {
                cardReleaseTimers.forEach(t => clearTimeout(t))
                cardReleaseTimers = []
              }
              tryStartFluidRelease()
            }
            // else: TTS still loading, will schedule when it arrives
          } else {
            processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
          }
        }

        // Handle speech from final parse (wasn't caught during streaming)
        if (speech && !speechHandled) {
          showBubble(speech)
          tts?.playTTS(speech)
          // No fluid sync for late-detected speech — just play
        } else if (!speech && !speechHandled && !blocks.length) {
          const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
          if (plain) {
            showBubble(plain.slice(0, 100))
            tts?.playTTS(plain.slice(0, 100))
          }
        }

        // ── Wait for fluid release to complete ──
        // If TTS is active and cards are queued, wait a bit for them to flush.
        // Safety timeout: don't wait longer than 30s
        if (ttsAudioPromise && !fluidDone) {
          const maxWait = 30000
          const start = Date.now()
          await new Promise(resolve => {
            const check = () => {
              if (fluidDone || Date.now() - start > maxWait) {
                releaseAllPending() // safety flush
                resolve()
              } else {
                setTimeout(check, 200)
              }
            }
            check()
          })
        }

      } catch (err) {
        showBubble(`Error: ${err.message}`, 5000)
        console.error(err)
        // Release any pending cards
        releaseAllPending()
        // Clean up timers
        cardReleaseTimers.forEach(t => clearTimeout(t))
        // Remove the empty node from timeline — failed requests shouldn't persist
        timeline.removeNode(nodeId)
      } finally {
        isThinking.value = false
        canvas.isStreaming = false
        timeline.resetLiveState()

        // Store AI response on timeline node
        if (reply) timeline.setAiResponse(nodeId, reply)

        // End sketch streaming — falls back to aiResponse-derived sketches
        sketch.endStreaming()

        // Persist after each round
        const forest = useForestStore()
        forest.autoName(forest.activeTreeId, userMessage)
        forest.scheduleSave()

        // Clean up any remaining timers
        cardReleaseTimers.forEach(t => clearTimeout(t))
      }
    }
    sendProcessing.value = false
  }

  return {
    send,
    isThinking,
    bubbleText,
    bubbleVisible,
    toolLogs,
    showBubble,
    dismissBubble,
  }
}
