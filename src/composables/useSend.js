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

            // Process new commands
            if (commands.length > lastCommandCount) {
              processCommands(commands.slice(lastCommandCount), nodeId, timeline)
              lastCommandCount = commands.length
            }

            // Process new sketches — full replace during streaming
            if (sketches.length > 0) {
              sketch.setLive(sketches)
              lastSketchCount = sketches.length
            }

            // Process new blocks
            processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)
          },
          // onSpeech
          (speechText) => {
            speechHandled = true
            showBubble(speechText)
            tts?.playTTS(speechText)
          }
        )

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

        processBlocks(blocks, state.lastBlockCount, nodeId, timeline, canvas, state)

        if (speech && !speechHandled) {
          showBubble(speech)
          tts?.playTTS(speech)
        } else if (!speech && !speechHandled && !blocks.length) {
          const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
          if (plain) {
            showBubble(plain.slice(0, 100))
            tts?.playTTS(plain.slice(0, 100))
          }
        }
      } catch (err) {
        showBubble(`Error: ${err.message}`, 5000)
        console.error(err)
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
