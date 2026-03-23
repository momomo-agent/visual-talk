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

  // Docked snapshots — independent layer, not part of the tree
  // key: cardId, value: { id, type, data, x, y, w, ... } (full card state)
  const dockedSnapshots = reactive(new Map())

  // Convenience: set of docked card IDs (derived from dockedSnapshots)
  const dockedIds = computed(() => new Set(dockedSnapshots.keys()))

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
      aiResponse: '',
      timestamp: Date.now(),
      operations: [],
      userOverrides: {},  // { cardKey: {x, y} } — user drag adjustments, per-node
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

  // Remove a node (e.g. failed/empty responses)
  function removeNode(id) {
    const node = nodes.get(id)
    if (!node) return
    if (node.parentId != null) {
      const parent = nodes.get(node.parentId)
      if (parent) {
        parent.childIds = parent.childIds.filter(c => c !== id)
        if (parent.lastChildId === id) {
          parent.lastChildId = parent.childIds[parent.childIds.length - 1] ?? null
        }
      }
    }
    nodes.delete(id)
    canvasCache.delete(id)
    // If this was the active tip, go back to parent
    if (activeTip.value === id) {
      activeTip.value = node.parentId ?? 0
    }
    if (viewingId.value === id) {
      viewingId.value = null
    }
  }

  // Live streaming state — incremental CanvasState for the active node
  let liveState = null

  function addOperation(nodeId, operation) {
    const node = nodes.get(nodeId)
    if (!node) return

    // Assign card identity at timeline level — never depend on canvas apply
    if (operation.op === 'create' && operation.card) {
      if (!operation.card.id) {
        operation.card.id = nextId()
      }
      if (!operation.card.contentKey) {
        operation.card.contentKey = `n${nodeId}-${operation.card.id}`
      }
      const data = operation.card.data || {}
      operation.card.x = data.x != null ? 5 + (data.x / 100) * 90 : 50
      operation.card.y = data.y != null ? 5 + (data.y / 100) * 75 : 30
      operation.card.w = data.w || operation.card.w || 25
    }

    // Intercept updates/moves for docked cards — apply to snapshot, not tree
    if ((operation.op === 'update' || operation.op === 'move') && operation.cardId) {
      const snap = dockedSnapshots.get(operation.cardId)
      if (snap) {
        if (operation.op === 'update' && operation.changes) {
          Object.assign(snap.data, operation.changes)
        }
        // Move ops ignored for docked cards (position is user-controlled)
        // Don't store in node.operations — this update belongs to the docked layer
        // Still trigger canvas re-render
        if (nodeId === activeTip.value && viewingId.value == null) {
          const canvas = useCanvasStore()
          canvas.applySnapshot(liveState?.cards ?? computeCanvas(nodeId), { animate: true })
        }
        return  // Don't add to tree
      }
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
        // Begin the current node and replay ALL existing ops (except the one just pushed)
        liveState.beginNode()
        liveState.preScan(node.operations)
        // Replay ops that existed before this new one was pushed
        const existingOps = node.operations.length - 1  // -1 because we already pushed the new op
        for (let i = 0; i < existingOps; i++) {
          liveState.apply(node.operations[i])
        }
      }

      // Apply this single operation incrementally
      // For push: re-scan all ops to catch move/update targets that arrived after initial preScan
      if (operation.op === 'push') {
        liveState.preScan(node.operations)
      }
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
      // Apply user drag overrides — merged at the source so all readers get final positions
      if (node.userOverrides) {
        for (const [key, pos] of Object.entries(node.userOverrides)) {
          state.cards.forEach(card => {
            if ((card.data?.key || '') === key) {
              card.x = pos.x
              card.y = pos.y
            }
          })
        }
      }
    }

    // Hide docked cards from canvas — they live in the independent layer
    dockedSnapshots.forEach((snap, cardId) => {
      state.cards.forEach((card, id) => {
        if (id === cardId || (card.data?.key && snap.data?.key && card.data.key === snap.data.key)) {
          state.cards.delete(id)
        }
      })
    })

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
    // Sketch restore is automatic — sketch store watches currentNode
  }

  /**
   * Record a user drag override for the current viewed node.
   * Only persists if the card was created in this node's round.
   * Old cards can be dragged freely but positions aren't saved
   * (unless user navigates to the node that created them).
   */
  function setUserOverride(cardKey, x, y) {
    const id = viewingId.value ?? activeTip.value
    if (id == null) return
    const node = nodes.get(id)
    if (!node) return

    // Persist for cards that this node created, updated, or moved
    const isThisNodesCard = node.operations.some(op => {
      if (op.op === 'create' && op.card?.data?.key === cardKey) return true
      // update/move use cardId — resolve to key via canvas snapshot
      if ((op.op === 'update' || op.op === 'move') && op.cardId != null) {
        const snapshot = (id === activeTip.value && liveState)
          ? liveState.cards
          : computeCanvas(id)
        const card = snapshot.get(op.cardId)
        if (card && (card.data?.key || '') === cardKey) return true
      }
      return false
    })
    if (!isThisNodesCard) return

    node.userOverrides[cardKey] = { x, y }
    invalidateFrom(id)

    // If streaming, also apply to liveState so it survives incremental snapshots
    if (id === activeTip.value && liveState) {
      liveState.cards.forEach(card => {
        if ((card.data?.key || '') === cardKey) {
          card.x = x
          card.y = y
        }
      })
    }
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
    dockedSnapshots.clear()
  }

  /**
   * Dock a card — pick it up from the canvas into the independent layer.
   */
  function dockCard(cardId) {
    if (dockedSnapshots.has(cardId)) return  // already docked

    // Get card data from current canvas state
    const viewId = viewingId.value ?? activeTip.value
    if (viewId == null) return
    const snapshot = liveState?.cards ?? computeCanvas(viewId)
    const card = snapshot.get(cardId)
    if (!card) return

    // Deep copy card data into docked layer
    dockedSnapshots.set(cardId, JSON.parse(JSON.stringify(card)))
    canvasCache.clear()

    // Re-render — instant removal (no fade), docked card is visually "picked up"
    const canvas = useCanvasStore()
    const newSnapshot = computeCanvas(viewId)
    canvas.applySnapshot(newSnapshot, { animate: false })
  }

  /**
   * Undock a card — put it back on the canvas at the current node.
   */
  function undockCard(cardId) {
    const snap = dockedSnapshots.get(cardId)
    if (!snap) return

    // Inject as create op into activeTip node
    const tipId = activeTip.value
    if (tipId == null) return
    const node = nodes.get(tipId)
    if (!node) return

    // Remove from docked FIRST — so computeCanvas won't filter it out
    dockedSnapshots.delete(cardId)
    canvasCache.clear()

    // Create op with snapshot data — go through addOperation for contentKey assignment
    addOperation(tipId, {
      op: 'create',
      card: {
        id: cardId,
        type: snap.type,
        data: JSON.parse(JSON.stringify(snap.data)),
        x: snap.x,
        y: snap.y,
        w: snap.w,
      }
    })

    // Re-render
    const viewId = viewingId.value ?? tipId
    const canvas = useCanvasStore()
    canvas.applySnapshot(computeCanvas(viewId), { animate: false })
  }

  /**
   * Close a docked card — discard it without putting it back.
   */
  function closeDocked(cardId) {
    dockedSnapshots.delete(cardId)
    canvasCache.clear()

    const viewId = viewingId.value ?? activeTip.value
    if (viewId != null) {
      const canvas = useCanvasStore()
      canvas.applySnapshot(computeCanvas(viewId), { animate: false })
    }
  }

  /**
   * Toggle dock state (backward compat for double-click).
   */
  function toggleDock(cardId) {
    if (dockedSnapshots.has(cardId)) {
      undockCard(cardId)
    } else {
      dockCard(cardId)
    }
  }

  function setAiResponse(nodeId, response) {
    const node = nodes.get(nodeId)
    if (node) node.aiResponse = response
  }

  function setNodeCounter(n) { nodeCounter = n }

  // --- Serialization (for forest persistence) ---

  function toJSON() {
    const nodesData = {}
    nodes.forEach((node, id) => {
      nodesData[id] = {
        id: node.id,
        parentId: node.parentId,
        childIds: [...node.childIds],
        lastChildId: node.lastChildId,
        userMessage: node.userMessage,
        aiResponse: node.aiResponse || '',
        timestamp: node.timestamp,
        operations: JSON.parse(JSON.stringify(node.operations)),
        userOverrides: node.userOverrides ? { ...node.userOverrides } : {},
      }
    })
    return {
      version: 1,
      nodeCounter,
      activeTip: activeTip.value,
      nodes: nodesData,
      dockedSnapshots: Object.fromEntries(dockedSnapshots),
    }
  }

  function fromJSON(data) {
    reset()
    if (!data || !data.nodes) return

    const entries = Object.values(data.nodes).sort((a, b) => a.id - b.id)
    for (const nd of entries) {
      nodes.set(nd.id, {
        id: nd.id,
        parentId: nd.parentId ?? null,
        childIds: nd.childIds || [],
        lastChildId: nd.lastChildId ?? null,
        userMessage: nd.userMessage || '',
        aiResponse: nd.aiResponse || '',
        timestamp: nd.timestamp || Date.now(),
        operations: nd.operations || [],
        userOverrides: nd.userOverrides || {},
      })
    }

    if (data.activeTip != null && nodes.has(data.activeTip)) {
      activeTip.value = data.activeTip
    }
    if (data.nodeCounter != null) {
      nodeCounter = data.nodeCounter
    }
    // Restore docked snapshots
    dockedSnapshots.clear()
    if (data.dockedSnapshots) {
      for (const [id, snap] of Object.entries(data.dockedSnapshots)) {
        dockedSnapshots.set(id, snap)
      }
    }
    // Backward compat: old format had dockedIds (Set) without snapshots
    if (data.dockedIds && !data.dockedSnapshots) {
      // Can't restore snapshots from just IDs — they'll be lost
      // User will need to re-dock
    }
    if (activeTip.value != null) {
      restoreToNode(activeTip.value)
    }
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
    return buildCanvasContext(snapshot, dockedSnapshots)
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
    setUserOverride,
    getBubbleInfo,
    reset,
    setAiResponse,
    setNodeCounter,
    removeNode,
    resetLiveState,
    findCardsByKey,
    findCardsByTitle,
    getCanvasContext,
    getSelectedContext,
    getPathFromRoot,
    toJSON,
    fromJSON,
    dockedIds,
    dockedSnapshots,
    toggleDock,
    dockCard,
    undockCard,
    closeDocked,
  }
})
