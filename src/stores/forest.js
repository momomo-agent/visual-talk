import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'
import { useTimelineStore } from './timeline.js'
import { useCanvasStore } from './canvas.js'

/**
 * Forest Store — manages multiple conversation trees + persistence.
 * 
 * Forest = { activeTreeId, trees: { id: Tree }, order: [id] }
 * Tree   = { id, name, createdAt, updatedAt, nodeCounter, activeTip, nodes: { id: Node } }
 * 
 * Uses agentic-store (global AgenticStore) for persistence.
 * Auto-detects IndexedDB in browser.
 */
export const useForestStore = defineStore('forest', () => {
  // --- State ---
  const trees = reactive({})        // { id: TreeMeta }
  const order = ref([])              // display order
  const activeTreeId = ref(null)
  const ready = ref(false)           // true after init/restore

  let store = null                   // agentic-store instance
  let saveTimer = null

  // --- Tree metadata (lightweight, for sidebar/list) ---
  // Full node data lives in timeline store; forest only tracks meta + serialized snapshots.

  function generateId() {
    return 'tree_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
  }

  // --- Serialize/deserialize via timeline's own API ---

  function serializeTimeline() {
    return useTimelineStore().toJSON()
  }

  function deserializeTimeline(data) {
    useTimelineStore().fromJSON(data)
  }

  // --- Tree operations ---

  function newTree(name) {
    const timeline = useTimelineStore()
    const canvas = useCanvasStore()

    // Save current tree first
    if (activeTreeId.value) {
      saveCurrentTree()
    }

    // Create new tree
    const id = generateId()
    trees[id] = {
      id,
      name: name || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    order.value.push(id)
    activeTreeId.value = id

    // Reset timeline and canvas for fresh start
    timeline.reset()
    canvas.clear()

    scheduleSave()
    return id
  }

  async function switchTree(treeId) {
    if (treeId === activeTreeId.value) return
    if (!trees[treeId]) return

    // Save current tree
    if (activeTreeId.value) {
      await saveCurrentTree()
    }

    activeTreeId.value = treeId

    // Load target tree from store
    await loadTree(treeId)
  }

  async function deleteTree(treeId) {
    if (!trees[treeId]) return

    const idx = order.value.indexOf(treeId)
    if (idx !== -1) order.value.splice(idx, 1)
    delete trees[treeId]

    // Remove from persistent storage
    if (store) await store.delete('tree:' + treeId)

    // If deleted the active tree, switch to another or create new
    if (treeId === activeTreeId.value) {
      if (order.value.length > 0) {
        await switchTree(order.value[order.value.length - 1])
      } else {
        newTree()
      }
    }

    scheduleSave()
  }

  function renameTree(treeId, name) {
    if (!trees[treeId]) return
    trees[treeId].name = name
    trees[treeId].updatedAt = Date.now()
    scheduleSave()
  }

  // --- Clear all trees ---

  async function clearAll() {
    const timeline = useTimelineStore()
    const canvas = useCanvasStore()

    // Delete all trees from persistent storage
    if (store) {
      for (const id of order.value) {
        await store.delete('tree:' + id)
      }
    }

    // Clear in-memory state
    for (const id of Object.keys(trees)) {
      delete trees[id]
    }
    order.value = []
    activeTreeId.value = null

    // Reset timeline and canvas
    timeline.reset()
    canvas.clear()

    // Create a fresh empty tree
    newTree()
  }

  // --- Auto-name from first message ---

  function autoName(treeId, message) {
    if (!trees[treeId]) return
    if (trees[treeId].name) return  // already named
    trees[treeId].name = message.slice(0, 40)
    trees[treeId].updatedAt = Date.now()
  }

  // --- Persistence ---

  async function saveCurrentTree() {
    if (!activeTreeId.value || !trees[activeTreeId.value]) return
    const data = JSON.parse(JSON.stringify(serializeTimeline()))
    trees[activeTreeId.value].updatedAt = Date.now()

    // Snapshot cards from last 3 rounds (push ops) for gallery preview
    const timeline = useTimelineStore()
    const lastCards = getLastRoundsCards(timeline, data, 3)
    trees[activeTreeId.value].lastCards = lastCards

    if (store) {
      await store.set('tree:' + activeTreeId.value, data)
    }
  }

  // Extract cards created in the last N rounds (push operations)
  function getLastRoundsCards(timeline, serialized, rounds) {
    // Walk the path from root to active tip
    const nodesMap = serialized.nodes || {}
    const tipId = serialized.activeTip
    if (!tipId) return []

    // Build path from tip to root
    const path = []
    let cur = tipId
    while (cur != null) {
      const n = nodesMap[cur]
      if (!n) break
      path.unshift(n)
      cur = n.parentId
    }

    // Find last N nodes that have a 'push' operation
    const pushNodes = path.filter(n =>
      n.operations?.some(op => op.op === 'push')
    )
    const lastN = pushNodes.slice(-rounds)

    // Collect all 'create' ops from these nodes
    const cards = []
    for (const node of lastN) {
      for (const op of (node.operations || [])) {
        if (op.op === 'create' && op.card) {
          cards.push({
            id: op.card.id,
            x: op.card.x ?? 10,
            y: op.card.y ?? 10,
            w: op.card.w || 25,
            type: op.card.type || 'blocks',
            data: JSON.parse(JSON.stringify(op.card.data || {})),
          })
        }
      }
    }
    return cards
  }

  async function loadTree(treeId) {
    if (!store) return
    const data = await store.get('tree:' + treeId)
    if (data) {
      try {
        deserializeTimeline(data)
      } catch (err) {
        console.error('[Forest] deserialize error:', err)
      }
    } else {
      // Empty tree
      const timeline = useTimelineStore()
      const canvas = useCanvasStore()
      timeline.reset()
      canvas.clear()
    }
  }

  async function saveForestMeta() {
    if (!store) return
    try {
      const data = JSON.parse(JSON.stringify({
        activeTreeId: activeTreeId.value,
        order: order.value,
        trees: Object.fromEntries(
          Object.entries(trees).map(([id, t]) => [id, {
            id: t.id, name: t.name, createdAt: t.createdAt, updatedAt: t.updatedAt,
            lastCards: t.lastCards || [],
          }])
        ),
      }))
      await store.set('forest:meta', data)
    } catch (err) {
      console.error('[Forest] meta save error:', err)
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await saveCurrentTree()
      } catch (e) { console.error('[Forest] save tree error:', e) }
      try {
        await saveForestMeta()
      } catch (e) { console.error('[Forest] save meta error:', e) }
      saveTimer = null
    }, 500)
  }

  // --- Init (called once on app startup) ---

  async function init() {
    // Create agentic-store instance
    try {
      const AgenticStore = window.AgenticStore || globalThis.AgenticStore
      if (AgenticStore) {
        store = await AgenticStore.createStore('visual-talk')
      }
    } catch (err) {
      console.warn('[Forest] persistence unavailable:', err)
      store = null
    }

    // Try to restore forest
    if (store) {
      const meta = await store.get('forest:meta')
      if (meta && meta.trees && Object.keys(meta.trees).length > 0) {
        // Restore forest metadata
        Object.assign(trees, meta.trees)
        order.value = meta.order || Object.keys(meta.trees)
        activeTreeId.value = meta.activeTreeId || order.value[order.value.length - 1]

        // Load active tree
        await loadTree(activeTreeId.value)
        ready.value = true
        return
      }
    }

    // No saved data — create first tree
    newTree()
    ready.value = true
  }

  // Flush pending saves on page close
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      // Synchronous best-effort: serialize and queue IDB write
      // IDB writes started before unload usually complete
      saveCurrentTree()
      saveForestMeta()
    })
  }

  // --- Computed ---

  const treeList = computed(() => {
    return order.value
      .map(id => trees[id])
      .filter(Boolean)
      .map(t => ({
        id: t.id,
        name: t.name || '新对话',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        lastCards: t.lastCards || [],
        isActive: t.id === activeTreeId.value,
      }))
  })

  const hasMultipleTrees = computed(() => order.value.length > 1)

  // Preview cache for non-active trees
  const previewCache = reactive({})

  async function getTreePreview(treeId) {
    if (previewCache[treeId]) return previewCache[treeId]
    if (!store) return []

    const data = await store.get('tree:' + treeId)
    if (!data?.nodes) return []

    // Find the activeTip node and extract card positions from operations
    const tipId = data.activeTip
    if (tipId == null) return []

    // Walk from root to tip, collect 'create' operations for preview
    const nodesMap = data.nodes
    const path = []
    let cur = tipId
    while (cur != null) {
      const n = nodesMap[cur] || nodesMap[String(cur)]
      if (!n) break
      path.unshift(n)
      cur = n.parentId
    }

    // Replay create ops to get card positions (ignore depth for preview)
    const cards = new Map()
    for (const node of path) {
      if (!node.operations) continue
      for (const op of node.operations) {
        if (op.op === 'create' && op.card) {
          cards.set(op.card.id || Math.random(), {
            id: op.card.id,
            x: op.card.x ?? 10,
            y: op.card.y ?? 10,
            w: op.card.w,
            opacity: 1,
            type: op.card.type || op.card.data?.type || 'card',
            data: op.card.data || {},
          })
        } else if (op.op === 'remove' && op.cardId != null) {
          cards.delete(op.cardId)
        }
      }
    }

    const preview = Array.from(cards.values()).slice(-12)
    previewCache[treeId] = preview
    return preview
  }

  // Invalidate preview cache when switching trees
  function invalidatePreview(treeId) {
    delete previewCache[treeId]
  }

  return {
    // State
    trees,
    order,
    activeTreeId,
    ready,
    treeList,
    hasMultipleTrees,
    // Actions
    init,
    newTree,
    switchTree,
    deleteTree,
    renameTree,
    autoName,
    clearAll,
    saveCurrentTree,
    scheduleSave,
    getTreePreview,
    invalidatePreview,
  }
})
