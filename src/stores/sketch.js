import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { useTimelineStore } from './timeline.js'
import { parseResponse } from '../lib/parser.js'

/**
 * Sketch Store — derived from timeline node's aiResponse
 * 
 * Architecture:
 * - Non-streaming: sketches are computed from currentNode.aiResponse
 * - Streaming: useSend pushes live sketches via setLive()
 * - When streaming ends, live is cleared and we fall back to aiResponse
 * 
 * This means sketches automatically follow navigation (timeline node changes)
 * without any manual sync.
 */
export const useSketchStore = defineStore('sketch', () => {
  // Live sketches during streaming (set by useSend)
  const liveSketches = reactive(new Map())
  const isStreaming = ref(false)
  let liveIdCounter = 0

  // The actual sketches exposed to SketchOverlay
  // During streaming → liveSketches
  // Otherwise → parsed from currentNode.aiResponse
  const sketches = reactive(new Map())

  // Watch timeline's current node for non-streaming updates
  let unwatchTimeline = null

  function initWatcher() {
    if (unwatchTimeline) return
    const timeline = useTimelineStore()
    unwatchTimeline = watch(
      () => timeline.currentNode,
      (node) => {
        if (isStreaming.value) return // Don't override live sketches
        syncFromNode(node)
      },
      { immediate: true }
    )
  }

  let syncVersion = 0  // increments on each navigation to force animation replay

  function syncFromNode(node) {
    sketches.clear()
    syncVersion++
    if (!node?.aiResponse) return
    const { sketches: parsed } = parseResponse(node.aiResponse)
    let id = 0
    for (const op of parsed) {
      sketches.set(`sk-v${syncVersion}-${id++}`, { id: `sk-v${syncVersion}-${id}`, ...op })
    }
  }

  // Called by useSend when streaming starts
  function startStreaming() {
    isStreaming.value = true
    liveSketches.clear()
    sketches.clear()
    liveIdCounter = 0
  }

  // Called by useSend to push live sketch updates during streaming
  function setLive(ops) {
    liveSketches.clear()
    liveIdCounter = 0
    for (const op of ops) {
      const id = `sk-${liveIdCounter++}`
      liveSketches.set(id, { id, ...op })
    }
    // Sync to sketches
    sketches.clear()
    liveSketches.forEach((v, k) => sketches.set(k, v))
  }

  // Called by useSend when streaming ends
  function endStreaming() {
    isStreaming.value = false
    liveSketches.clear()
    // Fall back to aiResponse (which should now be saved on the node)
    const timeline = useTimelineStore()
    syncFromNode(timeline.currentNode)
  }

  // Legacy API — used during init
  function clear() {
    sketches.clear()
    liveSketches.clear()
  }

  // Kept for backward compat but delegates to setLive
  function setFromOperations(ops) {
    setLive(ops)
  }

  function add(sketch) {
    const id = `sk-${liveIdCounter++}`
    liveSketches.set(id, { id, ...sketch })
    sketches.set(id, { id, ...sketch })
    return id
  }

  return {
    sketches,
    isStreaming,
    add,
    clear,
    setFromOperations,
    startStreaming,
    setLive,
    endStreaming,
    initWatcher,
  }
})
