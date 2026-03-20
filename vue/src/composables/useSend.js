import { ref } from 'vue'
import { useCanvasStore } from '../stores/canvas.js'
import { useConfigStore } from '../stores/config.js'
import { useTimelineStore } from '../stores/timeline.js'
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

  async function send(text) {
    if (!text?.trim()) return

    const canvas = useCanvasStore()

    // Build context from current canvas state
    const selCtx = canvas.getSelectedContext()
    const canvasCtx = canvas.getCanvasContext()

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

      let pushRecorded = false
      let lastBlockCount = 0
      let lastCommandCount = 0
      let speechHandled = false

      try {
        const cfg = configStore.getConfig()
        if (!cfg.apiKey) {
          showBubble('请先配置 API Key ⚙️', 3000)
          return 'need-config'
        }

        const reply = await callLLM(prompt,
          // onToken — streaming callback
          (partial) => {
            const { blocks, commands } = parseResponse(partial)

            // Process new commands
            if (commands.length > lastCommandCount) {
              commands.slice(lastCommandCount).forEach(cmd => {
                // Find matching cards BEFORE the operation changes titles
                const target = (cmd.title || '').toLowerCase()
                const matchedIds = []
                canvas.cards.forEach((card) => {
                  const title = canvas.getCardTitle?.(card) || ''
                  if (typeof title === 'string' && title.includes(target)) {
                    matchedIds.push(card.id)
                  }
                })

                if (cmd.cmd === 'move') {
                  matchedIds.forEach(cardId => {
                    const x = cmd.x != null ? 5 + (cmd.x / 100) * 90 : undefined
                    const y = cmd.y != null ? 5 + (cmd.y / 100) * 75 : undefined
                    const z = cmd.z ?? 30
                    timeline.addOperation(nodeId, {
                      op: 'move',
                      cardId,
                      to: { x, y, z },
                    })
                  })
                } else if (cmd.cmd === 'update') {
                  const { cmd: _, title: __, ...rawChanges } = cmd
                  // Handle newTitle → title conversion
                  if (rawChanges.newTitle) {
                    rawChanges.title = rawChanges.newTitle
                    delete rawChanges.newTitle
                  }
                  matchedIds.forEach(cardId => {
                    timeline.addOperation(nodeId, {
                      op: 'update',
                      cardId,
                      changes: rawChanges,
                    })
                  })
                }
              })
              lastCommandCount = commands.length
            }

            // Process new blocks
            if (blocks.length > lastBlockCount) {
              blocks.slice(lastBlockCount).forEach((b, i) => {
                const idx = lastBlockCount + i
                if (!pushRecorded) {
                  // Record selected card promotions BEFORE push
                  // so computeCanvas can replay them during navigation
                  canvas.selectedIds.forEach(id => {
                    timeline.addOperation(nodeId, { op: 'promote', cardId: id })
                  })
                  timeline.addOperation(nodeId, { op: 'push' })
                  pushRecorded = true
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
              lastBlockCount = blocks.length
            }
          },
          // onSpeech
          (speechText) => {
            speechHandled = true
            showBubble(speechText)
            tts?.playTTS(speechText)
          }
        )

        if (!reply) continue

        // Final pass — catch any remaining blocks/commands
        const { speech, blocks, commands } = parseResponse(reply)

        if (commands.length > lastCommandCount) {
          commands.slice(lastCommandCount).forEach(cmd => {
            // Find target cards — prefer id (precise), fallback to title (fuzzy)
            let matchedIds = []
            if (cmd.id) {
              // Direct ID match from canvas context
              matchedIds = [cmd.id]
            } else {
              const target = (cmd.title || '').toLowerCase()
              const parentId = timeline.nodes.get(nodeId)?.parentId
              const searchNodeId = parentId != null ? parentId : nodeId
              matchedIds = timeline.findCardsByTitle(searchNodeId, target)
            }

            if (cmd.cmd === 'move') {
              matchedIds.forEach(cardId => {
                const x = cmd.x != null ? 5 + (cmd.x / 100) * 90 : undefined
                const y = cmd.y != null ? 5 + (cmd.y / 100) * 75 : undefined
                const z = cmd.z ?? 30
                timeline.addOperation(nodeId, { op: 'move', cardId, to: { x, y, z } })
              })
            } else if (cmd.cmd === 'update') {
              const { cmd: _, title: __, ...rawChanges } = cmd
              if (rawChanges.newTitle) { rawChanges.title = rawChanges.newTitle; delete rawChanges.newTitle }
              matchedIds.forEach(cardId => {
                timeline.addOperation(nodeId, { op: 'update', cardId, changes: rawChanges })
              })
            }
          })
        }

        if (blocks.length > lastBlockCount) {
          blocks.slice(lastBlockCount).forEach((b, i) => {
            const idx = lastBlockCount + i
            if (!pushRecorded) {
              canvas.selectedIds.forEach(id => {
                timeline.addOperation(nodeId, { op: 'promote', cardId: id })
              })
              timeline.addOperation(nodeId, { op: 'push' })
              pushRecorded = true
            }
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
        }

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
      } finally {
        isThinking.value = false
        canvas.isStreaming = false
        timeline.resetLiveState()
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
