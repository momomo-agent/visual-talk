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
 * Playback Queue: LLM output is the "script". Speech and cards are
 * interleaved. After streaming, the queue is executed sequentially:
 *   speech → TTS play → cards render → next speech → ...
 * This gives the LLM full control over pacing and ordering.
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

      // ── Playback queue state ──
      // During streaming, we collect items in order: { type: 'speech'|'card', ... }
      // After streaming, we execute the queue sequentially.
      const playbackQueue = []  // [{ type: 'speech', text }, { type: 'card', block, globalIndex }]
      let firstSpeechFetching = null  // Pre-fetch promise for first speech segment

      // ── Execute playback queue sequentially ──
      async function executePlaybackQueue(cfg) {
        for (let qi = 0; qi < playbackQueue.length; qi++) {
          const item = playbackQueue[qi]

          if (item.type === 'speech') {
            // Show bubble
            showBubble(item.text)

            if (tts && cfg.ttsEnabled) {
              try {
                // Use pre-fetched audio if available (first speech)
                let audioBuffer
                if (qi === 0 && firstSpeechFetching) {
                  audioBuffer = await firstSpeechFetching
                  firstSpeechFetching = null
                } else {
                  audioBuffer = await tts.fetchTTSAudio(item.text)
                }

                if (audioBuffer) {
                  // Collect upcoming cards that follow this speech (until next speech)
                  const upcomingCards = []
                  for (let j = qi + 1; j < playbackQueue.length; j++) {
                    if (playbackQueue[j].type === 'card') {
                      upcomingCards.push(playbackQueue[j])
                    } else break // stop at next speech
                  }

                  // Play audio. Render cards during playback with stagger.
                  const info = await tts.playBuffer(audioBuffer)
                  if (info && upcomingCards.length > 0) {
                    // Release cards with stagger during playback
                    const stagger = Math.min(300, (info.duration * 800) / upcomingCards.length)
                    for (let ci = 0; ci < upcomingCards.length; ci++) {
                      const card = upcomingCards[ci]
                      setTimeout(() => {
                        renderCard(card.block, card.globalIndex, nodeId, timeline, canvas, state)
                        card._rendered = true
                      }, ci * stagger)
                    }
                    // Wait for playback to finish
                    await waitForPlaybackEnd(tts, info.duration)
                  } else if (!info) {
                    // Playback failed — render cards immediately
                    renderFollowingCards(playbackQueue, qi, nodeId, timeline, canvas, state)
                  }
                } else {
                  // TTS fetch failed — render cards immediately
                  renderFollowingCards(playbackQueue, qi, nodeId, timeline, canvas, state)
                }
              } catch {
                renderFollowingCards(playbackQueue, qi, nodeId, timeline, canvas, state)
              }
            }
            // If TTS disabled, cards are already rendered during streaming
          } else if (item.type === 'card' && !item._rendered) {
            // Card not yet rendered (no preceding speech, or TTS disabled)
            renderCard(item.block, item.globalIndex, nodeId, timeline, canvas, state)
          }
        }
      }

      function renderCard(block, globalIndex, nodeId, timeline, canvas, state) {
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
          globalIndex,
          card: {
            type: block.type,
            data: { ...block.data },
            contentKey: `n${nodeId}-${globalIndex}`,
          },
        })
      }

      function renderFollowingCards(queue, fromIdx, nodeId, timeline, canvas, state) {
        for (let j = fromIdx + 1; j < queue.length; j++) {
          if (queue[j].type === 'card' && !queue[j]._rendered) {
            renderCard(queue[j].block, queue[j].globalIndex, nodeId, timeline, canvas, state)
            queue[j]._rendered = true
          } else if (queue[j].type === 'speech') break
        }
      }

      function waitForPlaybackEnd(tts, duration) {
        return new Promise(resolve => {
          const timeout = setTimeout(resolve, (duration + 0.5) * 1000)
          // Also resolve when isPlaying goes false
          const check = setInterval(() => {
            if (!tts.isPlaying.value) {
              clearTimeout(timeout)
              clearInterval(check)
              resolve()
            }
          }, 100)
        })
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

            // Process new commands immediately
            if (commands.length > lastCommandCount) {
              processCommands(commands.slice(lastCommandCount), nodeId, timeline)
              lastCommandCount = commands.length
            }

            // Process new sketches
            if (sketches.length > 0) {
              sketch.setLive(sketches)
              lastSketchCount = sketches.length
            }

            // ── Build playback queue from interleaved output ──
            // We rebuild the queue each time from the full parsed output
            // to track the interleaving order correctly.
            if (cfg.ttsEnabled && tts) {
              // Rebuild queue from speechSegments (which track interleaving)
              const newQueue = []
              if (speechSegments.length > 0) {
                // Use speechSegments to maintain interleaving order
                let blocksCovered = new Set()
                for (const seg of speechSegments) {
                  newQueue.push({ type: 'speech', text: seg.text })
                  for (const bi of (seg.blockIndices || [])) {
                    if (bi < blocks.length) {
                      newQueue.push({ type: 'card', block: blocks[bi], globalIndex: bi })
                      blocksCovered.add(bi)
                    }
                  }
                }
                // Any blocks not associated with a speech segment
                for (let i = 0; i < blocks.length; i++) {
                  if (!blocksCovered.has(i)) {
                    newQueue.push({ type: 'card', block: blocks[i], globalIndex: i })
                  }
                }
              } else {
                // No speech yet — just queue cards
                for (let i = 0; i < blocks.length; i++) {
                  newQueue.push({ type: 'card', block: blocks[i], globalIndex: i })
                }
              }
              // Replace queue (we rebuild each time since streaming is incremental)
              playbackQueue.length = 0
              playbackQueue.push(...newQueue)

              // Pre-fetch first speech TTS
              if (!firstSpeechFetching && speechSegments.length > 0) {
                firstSpeechFetching = tts.fetchTTSAudio(speechSegments[0].text)
                // Show bubble immediately
                if (!speechHandled) {
                  speechHandled = true
                  showBubble(speechSegments[0].text)
                }
              }

              // Track lastBlockCount so we don't re-render in non-TTS path
              state.lastBlockCount = blocks.length
            } else {
              // No TTS — render cards immediately (original behavior)
              if (blocks.length > state.lastBlockCount) {
                processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
              }

              // Show speech bubble
              if (speechSegments.length > 0 && !speechHandled) {
                speechHandled = true
                showBubble(speechSegments[0].text)
              }
            }
          },
          // onSpeech — no longer used, handled via speechSegments in onToken
          () => {}
        )

        if (!reply) {
          timeline.removeNode(nodeId)
          continue
        }

        // Final parse — catch anything missed during streaming
        const { speech, blocks, commands, sketches, speechSegments } = parseResponse(reply)

        if (commands.length > lastCommandCount) {
          processCommands(commands.slice(lastCommandCount), nodeId, timeline)
        }

        if (sketches.length > 0) {
          sketch.setLive(sketches)
        }

        // ── Execute playback queue (TTS mode) ──
        if (cfg.ttsEnabled && tts && playbackQueue.length > 0) {
          // Final rebuild of queue from complete response
          const finalQueue = []
          let blocksCovered = new Set()
          if (speechSegments.length > 0) {
            for (const seg of speechSegments) {
              finalQueue.push({ type: 'speech', text: seg.text })
              for (const bi of (seg.blockIndices || [])) {
                if (bi < blocks.length) {
                  finalQueue.push({ type: 'card', block: blocks[bi], globalIndex: bi })
                  blocksCovered.add(bi)
                }
              }
            }
            for (let i = 0; i < blocks.length; i++) {
              if (!blocksCovered.has(i)) {
                finalQueue.push({ type: 'card', block: blocks[i], globalIndex: i })
              }
            }
          } else {
            for (let i = 0; i < blocks.length; i++) {
              finalQueue.push({ type: 'card', block: blocks[i], globalIndex: i })
            }
          }
          playbackQueue.length = 0
          playbackQueue.push(...finalQueue)

          // Execute the queue
          await executePlaybackQueue(cfg)
        } else if (!cfg.ttsEnabled || !tts) {
          // Non-TTS: ensure all blocks are rendered
          if (blocks.length > state.lastBlockCount) {
            processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
          }

          // Handle speech
          if (!speechHandled) {
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
        }

      } catch (err) {
        showBubble(`Error: ${err.message}`, 5000)
        console.error(err)
        // Render any remaining queued cards
        for (const item of playbackQueue) {
          if (item.type === 'card' && !item._rendered) {
            renderCard(item.block, item.globalIndex, nodeId, timeline, canvas, state)
            item._rendered = true
          }
        }
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
