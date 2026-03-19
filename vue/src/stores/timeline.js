import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { useCanvasStore } from './canvas.js'

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

  function addOperation(nodeId, operation) {
    const node = nodes.get(nodeId)
    if (!node) return
    node.operations.push(operation)
    // Invalidate cache for this node and all descendants
    invalidateFrom(nodeId)
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
   * CardState: { id, type, data, x, y, z, w, depth, opacity, scale, blur, zIndex }
   */
  function computeCanvas(nodeId) {
    if (canvasCache.has(nodeId)) return canvasCache.get(nodeId)

    const path = getPathFromRoot(nodeId)
    const cards = new Map()
    let depthLevel = 0

    for (const node of path) {
      for (const op of node.operations) {
        switch (op.op) {
          case 'push': {
            depthLevel++
            // Push all existing cards back
            cards.forEach((card) => {
              const d = depthLevel - card.depth
              if (d > 0) {
                card.z = -d * 160
                card.scale = Math.max(0.5, 1 - d * 0.12)
                card.opacity = Math.max(0, 1 - d * 0.45)
                card.blur = d >= 1 ? d * 4 : 0
                card.zIndex = Math.max(1, 50 - d * 20)
              }
              // Remove fully faded cards
              if (card.opacity <= 0) cards.delete(card.id)
            })
            break
          }
          case 'create': {
            const c = op.card
            cards.set(c.id, {
              id: c.id,
              type: c.type,
              data: { ...c.data },
              x: c.x,
              y: c.y,
              z: c.z ?? 0,
              w: c.w ?? 25,
              depth: depthLevel,
              opacity: 1,
              scale: 1,
              blur: 0,
              zIndex: c.zIndex ?? 100,
              intraZ: c.intraZ ?? 0,
              selected: false,
              pinned: false,
              contentKey: c.contentKey,
            })
            break
          }
          case 'update': {
            const card = cards.get(op.cardId)
            if (card) {
              if (op.changes) {
                Object.assign(card.data, op.changes)
              }
              card.depth = depthLevel
              card.opacity = 1
              card.blur = 0
            }
            break
          }
          case 'move': {
            const card = cards.get(op.cardId)
            if (card && op.to) {
              if (op.to.x != null) card.x = op.to.x
              if (op.to.y != null) card.y = op.to.y
              if (op.to.z != null) card.z = op.to.z
              card.depth = depthLevel
              card.opacity = 1
              card.blur = 0
            }
            break
          }
          case 'remove': {
            cards.delete(op.cardId)
            break
          }
        }
      }
    }

    canvasCache.set(nodeId, cards)
    return cards
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
   * Get the node ID to branch from when sending from history.
   * Returns the currently viewed node if in history, or activeTip if live.
   */
  function getBranchPoint() {
    return viewingId.value ?? activeTip.value
  }

  /**
   * Start a new branch from a specific node.
   * Creates a new node as child of branchPoint.
   */
  function branchFrom(parentId, userMessage) {
    const newId = createNode(parentId, userMessage)
    viewingId.value = null // go live on new branch
    return newId
  }

  // --- Restore canvas to a historical node ---

  function restoreToNode(nodeId) {
    const canvas = useCanvasStore()
    const computedCanvas = computeCanvas(nodeId)

    // Clear current canvas and replace with computed state
    canvas.cards.clear()
    canvas.currentRoundIds = new Set()

    let maxDepth = 0
    computedCanvas.forEach((card) => {
      if (card.depth > maxDepth) maxDepth = card.depth
      canvas.cards.set(card.id, reactive({ ...card }))
    })

    canvas.depthLevel = maxDepth
    canvas.currentRoundDepth = maxDepth
    canvas.greetingVisible = false
  }

  // --- Bubble display info ---

  function getBubbleInfo() {
    const node = currentNode.value
    if (!node) return null

    const time = new Date(node.timestamp)
    const hh = String(time.getHours()).padStart(2, '0')
    const mm = String(time.getMinutes()).padStart(2, '0')

    const sib = siblingInfo.value
    let text = `${hh}:${mm}`
    if (node.userMessage) {
      text += `\n${node.userMessage}`
    }
    if (sib) {
      const left = sib.hasLeft ? '‹ ' : ''
      const right = sib.hasRight ? ' ›' : ''
      text = `${left}${text}${right}`
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
    getPathFromRoot,
  }
})
