import { ref } from 'vue'
import { useCanvasStore } from '../stores/canvas.js'
import { useConfigStore } from '../stores/config.js'
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

    sendQueue.value.push(fullPrompt)
    if (!sendProcessing.value) processSendQueue()
  }

  async function processSendQueue() {
    sendProcessing.value = true
    const canvas = useCanvasStore()
    const configStore = useConfigStore()

    while (sendQueue.value.length > 0) {
      const prompt = sendQueue.value.shift()
      isThinking.value = true
      canvas.beginRound()

      let lastBlockCount = 0
      let lastCommandCount = 0
      let speechHandled = false

      try {
        const cfg = configStore.getConfig()
        if (!cfg.apiKey) {
          // Signal to open config
          return null
        }

        const reply = await callLLM(prompt,
          // onToken
          (partial) => {
            const { blocks, commands } = parseResponse(partial)
            if (commands.length > lastCommandCount) {
              commands.slice(lastCommandCount).forEach(cmd => canvas.executeCommand(cmd))
              lastCommandCount = commands.length
            }
            if (blocks.length > lastBlockCount) {
              blocks.slice(lastBlockCount).forEach((b, i) => {
                canvas.addCard(b.type, b.data, lastBlockCount + i)
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
          commands.slice(lastCommandCount).forEach(cmd => canvas.executeCommand(cmd))
        }
        if (blocks.length > lastBlockCount) {
          blocks.slice(lastBlockCount).forEach((b, i) => {
            canvas.addCard(b.type, b.data, lastBlockCount + i)
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
