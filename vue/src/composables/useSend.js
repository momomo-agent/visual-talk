import { ref } from 'vue'
import { useCanvasStore } from '../stores/canvas.js'
import { useConfigStore } from '../stores/config.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useLLM } from './useLLM.js'
import { parseResponse } from '../lib/parser.js'

export function useSend() {
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
    bubbleTimer = setTimeout(() => {
      bubbleVisible.value = false
    }, delayMs)
  }

  async function send(text) {
    if (!text?.trim()) return

    const canvas = useCanvasStore()
    const configStore = useConfigStore()

    // Build canvas context
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
      canvas.beginRound()

      // Create timeline node — branch from current view or active tip
      const parentId = timeline.getBranchPoint()
      const nodeId = timeline.branchFrom(parentId, userMessage)

      // Track operations for this round
      let pushRecorded = false
      let lastBlockCount = 0
      let lastCommandCount = 0
      let speechHandled = false

      // Wrap canvas operations to record them in timeline
      const originalAddCard = canvas.addCard.bind(canvas)
      const originalExecuteCommand = canvas.executeCommand.bind(canvas)

      // Override addCard to also record in timeline
      function trackedAddCard(type, data, globalIndex) {
        if (!pushRecorded) {
          timeline.addOperation(nodeId, { op: 'push' })
          pushRecorded = true
        }
        const cardId = originalAddCard(type, data, globalIndex)
        const card = canvas.cards.get(cardId)
        if (card) {
          timeline.addOperation(nodeId, {
            op: 'create',
            card: {
              id: card.id,
              type: card.type,
              data: { ...card.data },
              x: card.x,
              y: card.y,
              z: card._targetZ ?? card.z,
              w: card.w,
              zIndex: card.zIndex,
              intraZ: card.intraZ,
              contentKey: card.contentKey,
            },
          })
        }
        return cardId
      }

      function trackedExecuteCommand(cmd) {
        originalExecuteCommand(cmd)
        if (cmd.cmd === 'move') {
          // Find the card that was moved (by title match)
          const target = (cmd.title || '').toLowerCase()
          canvas.cards.forEach((card) => {
            const title = canvas.getCardTitle?.(card) || ''
            if (typeof title === 'string' && title.includes(target)) {
              timeline.addOperation(nodeId, {
                op: 'move',
                cardId: card.id,
                to: { x: card.x, y: card.y, z: card.z },
              })
            }
          })
        } else if (cmd.cmd === 'update') {
          const target = (cmd.title || '').toLowerCase()
          canvas.cards.forEach((card) => {
            const title = canvas.getCardTitle?.(card) || ''
            if (typeof title === 'string' && title.includes(target)) {
              const { cmd: _, title: __, ...changes } = cmd
              timeline.addOperation(nodeId, {
                op: 'update',
                cardId: card.id,
                changes,
              })
            }
          })
        }
      }

      try {
        const cfg = configStore.getConfig()
        if (!cfg.apiKey) {
          return null
        }

        const reply = await callLLM(prompt,
          // onToken
          (partial) => {
            const { blocks, commands } = parseResponse(partial)
            if (commands.length > lastCommandCount) {
              commands.slice(lastCommandCount).forEach(cmd => trackedExecuteCommand(cmd))
              lastCommandCount = commands.length
            }
            if (blocks.length > lastBlockCount) {
              blocks.slice(lastBlockCount).forEach((b, i) => {
                trackedAddCard(b.type, b.data, lastBlockCount + i)
              })
              lastBlockCount = blocks.length
            }
          },
          // onSpeech
          (speechText) => {
            speechHandled = true
            showBubble(speechText)
            dismissBubble(6000)
          }
        )

        if (!reply) continue

        // Final pass
        const { speech, blocks, commands } = parseResponse(reply)
        if (commands.length > lastCommandCount) {
          commands.slice(lastCommandCount).forEach(cmd => trackedExecuteCommand(cmd))
        }
        if (blocks.length > lastBlockCount) {
          blocks.slice(lastBlockCount).forEach((b, i) => {
            trackedAddCard(b.type, b.data, lastBlockCount + i)
          })
        }

        if (speech && !speechHandled) {
          showBubble(speech)
          dismissBubble(6000)
        } else if (!speech && !speechHandled && !blocks.length) {
          const plain = reply.replace(/<!--vt:\w+\s+[\s\S]*?-->/g, '').trim()
          if (plain) {
            showBubble(plain.slice(0, 100))
            dismissBubble(6000)
          }
        }
      } catch (err) {
        showBubble(`Error: ${err.message}`, 5000)
        console.error(err)
      } finally {
        isThinking.value = false
        canvas.isStreaming = false
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
