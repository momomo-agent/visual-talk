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
 * 
 * Sections:
 *   1. STATE          — reactive refs, internal data
 *   2. TREE           — createNode, removeNode, addOperation
 *   3. CANVAS         — getPathFromRoot, computeCanvas
 *   4. NAVIGATION     — navigate, goLive, branchFrom
 *   5. DOCK           — dockCard, undockCard, closeDocked, toggleDock
 *   6. CARD SEARCH    — findCardsByKey, findCardsByTitle, context builders
 *   7. USER INTERACTION — setUserOverride, restoreToNode, getBubbleInfo
 *   8. SERIALIZATION  — toJSON, fromJSON
 *   9. LIFECYCLE      — reset, setAiResponse, setNodeCounter
 */
export const useTimelineStore = defineStore('timeline', () => {

  // ═══════════════════════════════════════════════
  // 1. STATE
  // ═══════════════════════════════════════════════

  const nodes = reactive(new Map())
  const activeTip = ref(null)
  const viewingId = ref(null)
  let nodeCounter = 0
  const canvasCache = new Map()
  let liveState = null

  // Docked snapshots — independent layer, not part of the tree
  const dockedSnapshots = reactive(new Map())
  const dockedIds = computed(() => new Set(dockedSnapshots.keys()))
  const nodeCount = computed(() => nodes.size)

  // ═══════════════════════════════════════════════
  // 2. TREE — node CRUD + operation pipeline
  // ═══════════════════════════════════════════════

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
      userOverrides: {},
    })

    nodes.set(id, node)
    if (parent) {
      parent.childIds.push(id)
      parent.lastChildId = id
    }
    activeTip.value = id
    canvasCache.delete(id)
    return id
  }

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
    if (activeTip.value === id) activeTip.value = node.parentId ?? 0
    if (viewingId.value === id) viewingId.value = null
  }

  function addOperation(nodeId, operation) {
    const node = nodes.get(nodeId)
    if (!node) return

    // Assign card identity at timeline level
    if (operation.op === 'create' && operation.card) {
      if (!operation.card.id) operation.card.id = nextId()
      if (!operation.card.contentKey) {
        operation.card.contentKey = `n${nodeId}-${operation.card.id}`
      }
      const data = operation.card.data || {}
      operation.card.x = data.x != null ? 5 + (data.x / 100) * 90 : 50
      operation.card.y = data.y != null ? 5 + (data.y / 100) * 75 : 30
      operation.card.w = data.w || operation.card.w || 25
    }

    // Intercept updates/moves for docked cards → apply to snapshot, not tree
    if ((operation.op === 'update' || operation.op === 'move') && operation.cardId) {
      const snap = dockedSnapshots.get(operation.cardId)
      if (snap) {
        if (operation.op === 'update' && operation.changes) {
          Object.assign(snap.data, operation.changes)
          dockedSnapshots.set(operation.cardId, snap) // trigger reactivity
        }
        if (nodeId === activeTip.value && viewingId.value == null) {
          const canvas = useCanvasStore()
          canvas.applySnapshot(liveState?.cards ?? computeCanvas(nodeId), { animate: true })
        }
        return // don't add to tree
      }
    }

    node.operations.push(operation)
    invalidateFrom(nodeId)

    // Live streaming: incremental canvas update
    if (nodeId === activeTip.value && viewingId.value == null) {
      if (!liveState) {
        liveState = new CanvasState()
        const path = getPathFromRoot(nodeId)
        for (let i = 0; i < path.length - 1; i++) {
          const n = path[i]
          liveState.beginNode()
          liveState.preScan(n.operations)
          for (const op of n.operations) liveState.apply(op)
        }
        liveState.beginNode()
        liveState.preScan(node.operations)
        const existingOps = node.operations.length - 1
        for (let i = 0; i < existingOps; i++) liveState.apply(node.operations[i])
      }
      if (operation.op === 'push') liveState.preScan(node.operations)
      liveState.apply(operation)
      const canvas = useCanvasStore()
      canvas.applySnapshot(liveState.cards, { animate: true })
    }
  }

  function resetLiveState() { liveState = null }

  function invalidateFrom(nodeId) {
    canvasCache.delete(nodeId)
    const node = nodes.get(nodeId)
    if (node) node.childIds.forEach(cid => invalidateFrom(cid))
  }

  // ═══════════════════════════════════════════════
  // 3. CANVAS — state computation by replaying ops
  // ═══════════════════════════════════════════════

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

  function computeCanvas(nodeId) {
    if (canvasCache.has(nodeId)) return canvasCache.get(nodeId)

    const path = getPathFromRoot(nodeId)
    const state = new CanvasState()

    for (const node of path) {
      state.beginNode()
      state.preScan(node.operations)
      for (const op of node.operations) state.apply(op)
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

    // Filter out docked cards
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

  // ═══════════════════════════════════════════════
  // 4. NAVIGATION — time travel through the tree
  // ═══════════════════════════════════════════════

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
          if (node.id === activeTip.value) {
            viewingId.value = null
            return true
          }
          return false
        }
        const targetChild = node.lastChildId ?? node.childIds[0]
        viewingId.value = targetChild
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

  function goLive() { viewingId.value = null }

  function getBranchPoint() {
    return viewingId.value ?? activeTip.value
  }

  function branchFrom(parentId, userMessage) {
    const newId = createNode(parentId, userMessage)
    viewingId.value = null
    liveState = null
    return newId
  }

  // ═══════════════════════════════════════════════
  // 5. DOCK — independent card layer
  // ═══════════════════════════════════════════════

  function dockCard(cardId) {
    if (dockedSnapshots.has(cardId)) return

    const viewId = viewingId.value ?? activeTip.value
    if (viewId == null) return
    const snapshot = liveState?.cards ?? computeCanvas(viewId)
    const card = snapshot.get(cardId)
    if (!card) return

    dockedSnapshots.set(cardId, JSON.parse(JSON.stringify(card)))
    canvasCache.clear()

    const canvas = useCanvasStore()
    canvas.applySnapshot(computeCanvas(viewId), { animate: false })
  }

  function undockCard(cardId) {
    const snap = dockedSnapshots.get(cardId)
    if (!snap) return

    const targetId = viewingId.value ?? activeTip.value
    if (targetId == null) return
    const node = nodes.get(targetId)
    if (!node) return

    dockedSnapshots.delete(cardId)
    canvasCache.clear()

    addOperation(targetId, {
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

    const canvas = useCanvasStore()
    canvas.applySnapshot(computeCanvas(targetId), { animate: true })
  }

  function closeDocked(cardId) {
    dockedSnapshots.delete(cardId)
    canvasCache.clear()

    const viewId = viewingId.value ?? activeTip.value
    if (viewId != null) {
      const canvas = useCanvasStore()
      canvas.applySnapshot(computeCanvas(viewId), { animate: false })
    }
  }

  function toggleDock(cardId) {
    if (dockedSnapshots.has(cardId)) {
      undockCard(cardId)
    } else {
      dockCard(cardId)
    }
  }

  // ═══════════════════════════════════════════════
  // 6. CARD SEARCH — find cards for LLM commands
  // ═══════════════════════════════════════════════

  function getSearchableCards(nodeId) {
    const snapshot = (nodeId === activeTip.value && liveState)
      ? liveState.cards
      : computeCanvas(nodeId)
    return function* () {
      yield* snapshot
      yield* dockedSnapshots
    }()
  }

  function findCardsByKey(nodeId, key) {
    const target = (key || '').toLowerCase()
    const matched = []
    for (const [id, card] of getSearchableCards(nodeId)) {
      const cardKey = (card.data?.key || '').toLowerCase()
      if (cardKey && cardKey === target) matched.push(id)
    }
    return matched
  }

  function findCardsByTitle(nodeId, titleQuery) {
    const target = (titleQuery || '').toLowerCase()
    const exact = []
    const partial = []
    for (const [id, card] of getSearchableCards(nodeId)) {
      const cardTitle = getCardTitle(card)
      const match = matchTitle(cardTitle, target)
      if (match === 'exact') exact.push(id)
      else if (match === 'partial') partial.push(id)
    }
    return exact.length ? exact : partial
  }

  function getCanvasContext(nodeId) {
    const id = nodeId ?? viewingId.value ?? activeTip.value
    if (id == null) return null
    const snapshot = (id === activeTip.value && liveState)
      ? liveState.cards
      : computeCanvas(id)
    return buildCanvasContext(snapshot, dockedSnapshots)
  }

  function getSelectedContext(nodeId, selectedIds) {
    const id = nodeId ?? viewingId.value ?? activeTip.value
    if (id == null || !selectedIds?.length) return null
    const snapshot = computeCanvas(id)
    return buildSelectedContext(snapshot, selectedIds)
  }

  // ═══════════════════════════════════════════════
  // 7. USER INTERACTION — drag overrides, display
  // ═══════════════════════════════════════════════

  function restoreToNode(nodeId) {
    const canvas = useCanvasStore()
    canvas.restoreFrom(computeCanvas(nodeId))
  }

  function setUserOverride(cardKey, x, y) {
    const id = viewingId.value ?? activeTip.value
    if (id == null) return
    const node = nodes.get(id)
    if (!node) return

    const isThisNodesCard = node.operations.some(op => {
      if (op.op === 'create' && op.card?.data?.key === cardKey) return true
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

    if (id === activeTip.value && liveState) {
      liveState.cards.forEach(card => {
        if ((card.data?.key || '') === cardKey) {
          card.x = x
          card.y = y
        }
      })
    }
  }

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

  // ═══════════════════════════════════════════════
  // 8. SERIALIZATION — save/load for forest
  // ═══════════════════════════════════════════════

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
    if (data.nodeCounter != null) nodeCounter = data.nodeCounter

    dockedSnapshots.clear()
    if (data.dockedSnapshots) {
      for (const [id, snap] of Object.entries(data.dockedSnapshots)) {
        dockedSnapshots.set(id, snap)
      }
    }

    if (activeTip.value != null) restoreToNode(activeTip.value)
  }

  // ═══════════════════════════════════════════════
  // 9. LIFECYCLE — reset, misc setters
  // ═══════════════════════════════════════════════

  function reset() {
    nodes.clear()
    activeTip.value = null
    viewingId.value = null
    nodeCounter = 0
    canvasCache.clear()
    dockedSnapshots.clear()
  }

  function setAiResponse(nodeId, response) {
    const node = nodes.get(nodeId)
    if (node) node.aiResponse = response
  }

  function setNodeCounter(n) { nodeCounter = n }

  // ═══════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════

  return {
    // State
    nodes, activeTip, viewingId, nodeCount,
    // Tree
    createNode, removeNode, addOperation, resetLiveState,
    // Canvas
    computeCanvas, getPathFromRoot,
    // Navigation
    currentNode, isLive, hasSiblings, siblingInfo,
    navigate, goLive, getBranchPoint, branchFrom,
    // Dock
    dockedIds, dockedSnapshots,
    dockCard, undockCard, closeDocked, toggleDock,
    // Card search
    findCardsByKey, findCardsByTitle, getCanvasContext, getSelectedContext,
    // User interaction
    restoreToNode, setUserOverride, getBubbleInfo,
    // Serialization
    toJSON, fromJSON,
    // Lifecycle
    reset, setAiResponse, setNodeCounter,
  }
})
