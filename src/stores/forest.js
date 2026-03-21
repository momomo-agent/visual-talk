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

  // --- Serialize/deserialize timeline state ---

  function serializeTimeline() {
    const timeline = useTimelineStore()
    const nodesData = {}
    timeline.nodes.forEach((node, id) => {
      nodesData[id] = {
        id: node.id,
        parentId: node.parentId,
        childIds: [...node.childIds],
        lastChildId: node.lastChildId,
        userMessage: node.userMessage,
        aiResponse: node.aiResponse || '',
        timestamp: node.timestamp,
        operations: JSON.parse(JSON.stringify(node.operations)),
      }
    })
    return {
      nodeCounter: timeline.nodes.size > 0
        ? Array.from(timeline.nodes.keys()).reduce((a, b) => Math.max(a, b), 0) + 1
        : 0,
      activeTip: timeline.activeTip,
      nodes: nodesData,
    }
  }

  function deserializeTimeline(data) {
    const timeline = useTimelineStore()
    timeline.reset()

    if (!data || !data.nodes) return

    // Restore nodes — must use timeline's internal reactive system
    const nodeEntries = Object.values(data.nodes).sort((a, b) => a.id - b.id)
    for (const nd of nodeEntries) {
      // Directly populate the reactive Map
      timeline.nodes.set(nd.id, {
        id: nd.id,
        parentId: nd.parentId ?? null,
        childIds: nd.childIds || [],
        lastChildId: nd.lastChildId ?? null,
        userMessage: nd.userMessage || '',
        aiResponse: nd.aiResponse || '',
        timestamp: nd.timestamp || Date.now(),
        operations: nd.operations || [],
      })
    }

    // Restore activeTip
    if (data.activeTip != null && timeline.nodes.has(data.activeTip)) {
      timeline.activeTip = data.activeTip
    }

    // Restore nodeCounter so new nodes don't collide with restored ones
    if (data.nodeCounter != null) {
      timeline.setNodeCounter(data.nodeCounter)
    }

    // Restore canvas to activeTip
    if (timeline.activeTip != null) {
      timeline.restoreToNode(timeline.activeTip)
    }
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
    const data = serializeTimeline()
    trees[activeTreeId.value].updatedAt = Date.now()

    if (store) {
      await store.set('tree:' + activeTreeId.value, data)
    }
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
        isActive: t.id === activeTreeId.value,
      }))
  })

  const hasMultipleTrees = computed(() => order.value.length > 1)

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
    saveCurrentTree,
    scheduleSave,
  }
})
