import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { useCanvasStore } from './canvas.js'
import { nextId } from '../lib/id.js'
import { CanvasState } from '../lib/canvas-state.js'
import { getCardTitle, matchTitle, buildCanvasContext, buildSelectedContext } from '../lib/card-utils.js'

/**
 * Timeline Store — Active Tree
 * 
 * Each node stores ONLY what changed in that round (diff/operations).
 * The full canvas state at any node is computed by replaying operations
 * from root to that node.
 * 
 * Navigation:
 *   Up/Down    = parent/child (time axis)
 *   Left/Right = sibling branches (parallel universes)
 * 
 * Data model:
 *   node.operations = [{ op, card?, cardId?, changes?, to? }]
 *   op types: 'create', 'update', 'move', 'push', 'remove'
 */
export const useTimelineStore = defineStore('timeline', () => {
  // Tree nodes, keyed by id
  const nodes = reactive(new Map())
  
  // Navigation state
  const activeTip = ref(null)    // id of the active branch tip (where new messages go)
  const viewingId = ref(null)    // null = live view, number = viewing history

  // Node ID counter
  let nodeCounter = 0

  // Cache: computed canvas state per node id
  const canvasCache = new Map()

  // --- Tree operations ---

  function createNode(parentId, userMessage) {
    const id = nodeCounter++
    const parent = parentId != null ? nodes.get(parentId) : null

    const node = reactive({
      id,
      parentId: parentId ?? null,
      childIds: [],
      lastChildId: null,
      userMessage: userMessage || '',
      timestamp: Date.now(),
      operations: [],
    })

    nodes.set(id, node)

    if (parent) {
      parent.childIds.push(id)
      parent.lastChildId = id
    }

    activeTip.value = id
    canvasCache.delete(id) // invalidate
    return id
  }

  // Live streaming state — incremental CanvasState for the active node
  let liveState = null

  function addOperation(nodeId, operation) {
    const node = nodes.get(nodeId)
    if (!node) return

    // Assign card identity at timeline level — never depend on canvas apply
    if (operation.op === 'create' && operation.card && !operation.card.id) {
      operation.card.id = nextId()
      const data = operation.card.data || {}
      operation.card.x = data.x != null ? 5 + (data.x / 100) * 90 : 50
      operation.card.y = data.y != null ? 5 + (data.y / 100) * 75 : 30
      operation.card.w = data.w || operation.card.w || 25
    }

    node.operations.push(operation)
    invalidateFrom(nodeId)

    // If this is the live node AND user is viewing it, update canvas
    if (nodeId === activeTip.value && viewingId.value == null) {
      // Maintain incremental state for streaming performance
      if (!liveState) {
        // First op in this round — bootstrap from parent state
        liveState = new CanvasState()
        const path = getPathFromRoot(nodeId)
        // Replay all nodes EXCEPT the current one (it's being built incrementally)
        for (let i = 0; i < path.length - 1; i++) {
          const n = path[i]
          liveState.beginNode()
          liveState.preScan(n.operations)
          for (const op of n.operations) {
            liveState.apply(op)
          }
        }
        // Begin the current node
        liveState.beginNode()
        // Pre-scan ALL ops for the current node (including future ones already recorded)
        liveState.preScan(node.operations)
      }

      // Apply this single operation incrementally
      liveState.apply(operation)

      // Push snapshot to canvas
      const canvas = useCanvasStore()
      canvas.applySnapshot(liveState.cards, { animate: true })
    }
  }

  function resetLiveState() {
    liveState = null
  }

  function invalidateFrom(nodeId) {
    canvasCache.delete(nodeId)
    const node = nodes.get(nodeId)
    if (node) {
      node.childIds.forEach(cid => invalidateFrom(cid))
    }
  }

  // --- Path & Canvas computation ---

  function getPathFromRoot(nodeId) {
    const path = []
    let cur = nodeId
    while (cur != null) {
      const node = nodes.get(cur)
      if (!node) break
      path.unshift(node)
      cur = node.parentId
    }
    return path
  }

  /**
   * Compute the full canvas state at a given node by replaying
   * all operations from root to that node.
   * 
   * Returns: Map<string, CardState>
   * Uses CanvasState — the single source of truth for state computation.
   */
  function computeCanvas(nodeId) {
    if (canvasCache.has(nodeId)) return canvasCache.get(nodeId)

    const path = getPathFromRoot(nodeId)
    const state = new CanvasState()

    for (const node of path) {
      state.beginNode()
      state.preScan(node.operations)
      for (const op of node.operations) {
        state.apply(op)
      }
    }

    canvasCache.set(nodeId, state.cards)
    return state.cards
  }

  // --- Navigation ---

  const currentNode = computed(() => {
    const id = viewingId.value ?? activeTip.value
    return id != null ? nodes.get(id) : null
  })

  const isLive = computed(() => viewingId.value == null)

  const hasSiblings = computed(() => {
    const node = currentNode.value
    if (!node || node.parentId == null) return false
    const parent = nodes.get(node.parentId)
    return parent ? parent.childIds.length > 1 : false
  })

  const siblingInfo = computed(() => {
    const node = currentNode.value
    if (!node || node.parentId == null) return null
    const parent = nodes.get(node.parentId)
    if (!parent || parent.childIds.length <= 1) return null
    const idx = parent.childIds.indexOf(node.id)
    return {
      current: idx,
      total: parent.childIds.length,
      hasLeft: idx > 0,
      hasRight: idx < parent.childIds.length - 1,
    }
  })

  /**
   * Navigate in 4 directions:
   *   'up'    = go to parent (back in time)
   *   'down'  = go to last visited child (forward in time)
   *   'left'  = go to previous sibling branch
   *   'right' = go to next sibling branch
   */
  function navigate(direction) {
    const id = viewingId.value ?? activeTip.value
    if (id == null) return false
    const node = nodes.get(id)
    if (!node) return false

    switch (direction) {
      case 'up': {
        if (node.parentId == null) return false
        viewingId.value = node.parentId
        return true
      }
      case 'down': {
        if (node.childIds.length === 0) {
          // At leaf — if this is the active tip, go live
          if (node.id === activeTip.value) {
            viewingId.value = null
            return true
          }
          return false
        }
        // Go to last visited child, or first
        const targetChild = node.lastChildId ?? node.childIds[0]
        viewingId.value = targetChild
        // Remember this choice
        node.lastChildId = targetChild
        return true
      }
      case 'left': {
        if (node.parentId == null) return false
        const parent = nodes.get(node.parentId)
        if (!parent) return false
        const idx = parent.childIds.indexOf(node.id)
        if (idx <= 0) return false
        const sibId = parent.childIds[idx - 1]
        viewingId.value = sibId
        parent.lastChildId = sibId
        return true
      }
      case 'right': {
        if (node.parentId == null) return false
        const parent = nodes.get(node.parentId)
        if (!parent) return false
        const idx = parent.childIds.indexOf(node.id)
        if (idx >= parent.childIds.length - 1) return false
        const sibId = parent.childIds[idx + 1]
        viewingId.value = sibId
        parent.lastChildId = sibId
        return true
      }
    }
    return false
  }

  function goLive() {
    viewingId.value = null
  }

  /**
   * Send always continues from the active tip — not from where you're viewing.
   * Viewing history is just looking back, not going back.
   */
  function getBranchPoint() {
    // If viewing a historical node, branch from there (fork the timeline)
    // Otherwise, continue from the active tip
    return viewingId.value ?? activeTip.value
  }

  /**
   * Start a new branch from activeTip.
   * Automatically returns to live view.
   */
  function branchFrom(parentId, userMessage) {
    const newId = createNode(parentId, userMessage)
    viewingId.value = null // always go live
    liveState = null // reset incremental state for new branch
    return newId
  }

  // --- Restore canvas to a historical node ---

  function restoreToNode(nodeId) {
    const canvas = useCanvasStore()
    const computedCanvas = computeCanvas(nodeId)
    canvas.restoreFrom(computedCanvas)
  }

  // --- Bubble display info ---

  function getBubbleInfo() {
    const node = currentNode.value
    if (!node) return null

    const time = new Date(node.timestamp)
    const hh = String(time.getHours()).padStart(2, '0')
    const mm = String(time.getMinutes()).padStart(2, '0')

    const sib = siblingInfo.value
    const left = sib?.hasLeft ? '‹ ' : ''
    const right = sib?.hasRight ? ' ›' : ''

    let text = `${left}${hh}:${mm}${right}`
    if (node.userMessage) {
      const msg = node.userMessage.slice(0, 30)
      text += `\n"${msg}"`
    }

    return { text, hasSiblings: !!sib }
  }

  // --- State ---

  const nodeCount = computed(() => nodes.size)

  function reset() {
    nodes.clear()
    activeTip.value = null
    viewingId.value = null
    nodeCounter = 0
    canvasCache.clear()
  }

  /**
   * Find cards by title substring in the computed canvas state.
   * Searches in timeline data (not canvas view layer).
   * Returns array of card IDs that match.
   */
  /**
   * Find a card by its semantic key (exact match).
   * Keys are LLM-assigned, unique, and stable.
   */
  function findCardsByKey(nodeId, key) {
    const snapshot = (nodeId === activeTip.value && liveState)
      ? liveState.cards
      : computeCanvas(nodeId)

    const target = (key || '').toLowerCase()
    const matched = []
    snapshot.forEach((card, id) => {
      const cardKey = (card.data?.key || '').toLowerCase()
      if (cardKey && cardKey === target) matched.push(id)
    })
    return matched
  }

  /**
   * Find cards by title in the current live state or computed snapshot.
   * During streaming, uses liveState for O(n) lookup without recomputation.
   * Falls back to computeCanvas for navigation/historical queries.
   */
  function findCardsByTitle(nodeId, titleQuery) {
    // Use liveState if querying the active streaming node
    const snapshot = (nodeId === activeTip.value && liveState)
      ? liveState.cards
      : computeCanvas(nodeId)

    const target = (titleQuery || '').toLowerCase()
    const exact = []
    const partial = []
    snapshot.forEach((card, id) => {
      const cardTitle = getCardTitle(card)
      const match = matchTitle(cardTitle, target)
      if (match === 'exact') exact.push(id)
      else if (match === 'partial') partial.push(id)
    })
    return exact.length ? exact : partial
  }

  /**
   * Build canvas context string for LLM from timeline data.
   */
  function getCanvasContext(nodeId) {
    const id = nodeId ?? viewingId.value ?? activeTip.value
    if (id == null) return null
    const snapshot = (id === activeTip.value && liveState)
      ? liveState.cards
      : computeCanvas(id)
    return buildCanvasContext(snapshot)
  }

  /**
   * Build selected cards context for LLM from timeline data.
   */
  function getSelectedContext(nodeId, selectedIds) {
    const id = nodeId ?? viewingId.value ?? activeTip.value
    if (id == null || !selectedIds?.length) return null
    const snapshot = computeCanvas(id)
    return buildSelectedContext(snapshot, selectedIds)
  }

  return {
    nodes,
    activeTip,
    viewingId,
    currentNode,
    isLive,
    hasSiblings,
    siblingInfo,
    nodeCount,
    createNode,
    addOperation,
    computeCanvas,
    navigate,
    goLive,
    getBranchPoint,
    branchFrom,
    restoreToNode,
    getBubbleInfo,
    reset,
    resetLiveState,
    findCardsByKey,
    findCardsByTitle,
    getCanvasContext,
    getSelectedContext,
    getPathFromRoot,
  }
})
