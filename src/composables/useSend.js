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
      let latestSpeechSegments = [] // parsed speechSegments from interleaved output
      let wordTimestamps = null    // [{ word, start, end }] from Whisper

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
       * Compute card release times using Whisper word-level timestamps.
       * 
       * wordTimestamps: [{ word, start, end }, ...] from Whisper
       * speechSegments: [{ text, blockIndices }, ...] from parser
       * 
       * Strategy: find where each speech segment starts in the audio
       * by matching its first few characters against the word timestamps.
       * Cards for that segment appear at that moment.
       */
      function computeTimingsFromWords(wordTimestamps, segments, totalCards, audioDuration) {
        if (!wordTimestamps?.length || !segments?.length || totalCards === 0) {
          return evenTimings(totalCards, audioDuration)
        }

        // Build a running text from word timestamps to find segment boundaries
        // Each word has { word, start, end }
        let runningText = ''
        const wordPositions = [] // { charStart, charEnd, startSec, endSec }
        for (const w of wordTimestamps) {
          const charStart = runningText.length
          runningText += w.word
          wordPositions.push({
            charStart,
            charEnd: runningText.length,
            startSec: w.start,
            endSec: w.end,
          })
        }

        // For each speech segment, find its approximate start time in the audio
        // by matching the segment text against the running transcript
        const timings = new Array(totalCards).fill(null)
        const assigned = new Set()

        for (const seg of segments) {
          if (!seg.blockIndices?.length) continue

          // Find where this segment's text starts in the transcript
          const segText = seg.text.replace(/\s+/g, '')
          const needle = segText.slice(0, Math.min(6, segText.length)) // first few chars
          const pos = runningText.indexOf(needle)

          let timeMs
          if (pos >= 0) {
            // Find the word that contains this position
            const wp = wordPositions.find(w => w.charStart <= pos && w.charEnd > pos)
            timeMs = wp ? wp.startSec * 1000 : 0
          } else {
            // Fallback: estimate from segment order
            const segIdx = segments.indexOf(seg)
            timeMs = (segIdx / segments.length) * audioDuration * 1000 * 0.85
          }

          for (const blockIdx of seg.blockIndices) {
            const pendingIdx = pendingBlocks.findIndex(b => b._globalIndex === blockIdx)
            if (pendingIdx >= 0 && pendingIdx < totalCards) {
              timings[pendingIdx] = timeMs
              assigned.add(pendingIdx)
            }
          }
        }

        // Unassigned cards: distribute evenly after last assigned
        const unassigned = []
        for (let i = 0; i < totalCards; i++) {
          if (!assigned.has(i)) unassigned.push(i)
        }
        if (unassigned.length > 0) {
          const lastTime = Math.max(...timings.filter(t => t !== null), 0)
          const remaining = audioDuration * 1000 * 0.9 - lastTime
          unassigned.forEach((idx, i) => {
            timings[idx] = lastTime + ((i + 1) / (unassigned.length + 1)) * remaining
          })
        }

        console.log('[FluidTTS] word-based timings:', timings)
        return timings
      }

      function evenTimings(totalCards, audioDuration) {
        const timings = []
        for (let i = 0; i < totalCards; i++) {
          timings.push(((i + 0.5) / totalCards) * 0.85 * audioDuration * 1000)
        }
        return timings
      }

      // Schedule card releases synced to TTS using word timestamps
      function scheduleFluidRelease(audioDuration) {
        const total = pendingBlocks.length
        if (total === 0) { fluidDone = true; return }

        const timings = wordTimestamps
          ? computeTimingsFromWords(wordTimestamps, latestSpeechSegments, total, audioDuration)
          : evenTimings(total, audioDuration)

        for (let i = 0; i < total; i++) {
          const delayMs = timings[i] ?? (((i + 1) / (total + 1)) * audioDuration * 1000)
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
            const { blocks, commands, sketches, speechSegments } = parseResponse(partial)

            // Track latest speech segments for timing
            if (speechSegments.length > 0) {
              latestSpeechSegments = speechSegments
              // Show the first speech segment as bubble immediately
              if (!speechHandled && speechSegments[0]?.text) {
                speechHandled = true
                showBubble(speechSegments[0].text)
              }
            }

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
              if (cfg.ttsEnabled && tts && speechSegments.length > 0) {
                // TTS mode — queue new blocks for synced release
                for (let i = state.lastBlockCount; i < blocks.length; i++) {
                  const b = { ...blocks[i], _globalIndex: i, _released: false }
                  pendingBlocks.push(b)
                }
                state.lastBlockCount = blocks.length
              } else {
                // No TTS — render immediately (original behavior)
                processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
              }
            }
          },
          // onSpeech — fires when first <!--vt:speech ...--> is detected
          // We no longer start TTS here — we wait for streaming to finish
          // so we have ALL speech segments for concatenated TTS
          (speechText) => {
            // Already handled in onToken via speechSegments
          }
        )

        streamingDone = true

        if (!reply) {
          // Empty response — remove the node
          timeline.removeNode(nodeId)
          continue
        }

        // Final pass — catch any remaining blocks/commands/speechSegments
        const { speech, blocks, commands, sketches, speechSegments } = parseResponse(reply)

        if (speechSegments.length > 0) {
          latestSpeechSegments = speechSegments
        }

        if (commands.length > lastCommandCount) {
          processCommands(commands.slice(lastCommandCount), nodeId, timeline)
        }

        if (sketches.length > 0) {
          sketch.setLive(sketches)
        }

        // Handle remaining blocks from final parse
        if (blocks.length > state.lastBlockCount) {
          if (latestSpeechSegments.length > 0 && tts && cfg.ttsEnabled) {
            // Queue remaining blocks for fluid release
            for (let i = state.lastBlockCount; i < blocks.length; i++) {
              const b = { ...blocks[i], _globalIndex: i, _released: false }
              pendingBlocks.push(b)
            }
            state.lastBlockCount = blocks.length
          } else {
            processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
          }
        }

        // ── Now start TTS with ALL speech segments concatenated ──
        if (latestSpeechSegments.length > 0 && tts && cfg.ttsEnabled && pendingBlocks.length > 0) {
          // Concatenate all speech segments for one TTS call
          const fullSpeechText = latestSpeechSegments.map(s => s.text).join(' ')

          if (!speechHandled) {
            showBubble(latestSpeechSegments[0].text)
            speechHandled = true
          }

          try {
            const audioBuffer = await tts.fetchTTSAudio(fullSpeechText)
            if (!audioBuffer) {
              releaseAllPending()
            } else {
              // Get word-level timestamps via Whisper, then play
              const tsResult = await tts.transcribeForTimestamps(audioBuffer.slice(0))
              if (tsResult?.words) {
                wordTimestamps = tsResult.words
                console.log('[FluidTTS] Got word timestamps:', wordTimestamps.length, 'words')
              }

              const info = await tts.playBuffer(audioBuffer)
              if (!info) {
                releaseAllPending()
              } else {
                ttsPlaybackInfo = info
                tryStartFluidRelease()
              }
            }
          } catch {
            releaseAllPending()
          }
        } else if (latestSpeechSegments.length > 0 && tts && cfg.ttsEnabled && pendingBlocks.length === 0) {
          // Speech but no cards to sync — just play TTS
          const fullSpeechText = latestSpeechSegments.map(s => s.text).join(' ')
          if (!speechHandled) showBubble(latestSpeechSegments[0].text)
          tts.playTTS(fullSpeechText)
          speechHandled = true
        } else if (!speechHandled) {
          // Fallback: single speech or plain text
          if (speech) {
            showBubble(speech)
            tts?.playTTS(speech)
          } else if (!blocks.length) {
            const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
            if (plain) {
              showBubble(plain.slice(0, 100))
              tts?.playTTS(plain.slice(0, 100))
            }
          }
        }

        // ── Wait for fluid release to complete ──
        if (pendingBlocks.some(b => !b._released) && !fluidDone) {
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
