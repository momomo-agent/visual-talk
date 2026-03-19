import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { nextId } from '../lib/id.js'

/**
 * Canvas Store — Pure View Layer
 * 
 * Canvas is a derived view of timeline state. It receives operations
 * from the timeline store and renders them with animations.
 * 
 * Two modes:
 * 1. Incremental: applyOperation(op) — for streaming (fast, animated)
 * 2. Full restore: restoreFrom(computedCards) — for navigation (instant)
 * 
 * Canvas never generates its own state. Timeline is the source of truth.
 */
export const useCanvasStore = defineStore('canvas', () => {
  const cards = reactive(new Map())
  const depthLevel = ref(0)
  const currentRoundDepth = ref(-1)
  const currentRoundIds = ref(new Set())
  const selectedIds = ref(new Set())
  const greetingVisible = ref(true)
  const isStreaming = ref(false)

  // Card ID counter for new cards during streaming
  let streamCardCounter = 0

  function getCardTitle(card) {
    const d = card.data
    return (d.title || d.caption || d.text || d.content || d.label || d.code?.slice(0, 30) || '').toLowerCase()
  }

  function applyDepth(card, d) {
    const z = -d * 160
    const s = Math.max(0.5, 1 - d * 0.12)
    const o = Math.max(0, 1 - d * 0.45)
    card.z = z
    card.scale = s
    card.opacity = o
    card.zIndex = Math.max(1, 50 - d * 20)
    card.blur = d >= 1 ? d * 4 : 0
    card.pointerEvents = 'auto'
    if (o <= 0) cards.delete(card.id)
  }

  function pushOldBlocks() {
    if (currentRoundDepth.value === depthLevel.value) return
    depthLevel.value++
    currentRoundDepth.value = depthLevel.value

    const preserved = new Set(currentRoundIds.value)
    currentRoundIds.value = preserved
    preserved.forEach(id => {
      const card = cards.get(id)
      if (card) card.depth = depthLevel.value
    })

    selectedIds.value.forEach(id => {
      const card = cards.get(id)
      if (card) {
        card.depth = depthLevel.value
        card.pinned = true
        currentRoundIds.value.add(id)
      }
    })
    clearSelection()

    cards.forEach((card) => {
      if (currentRoundIds.value.has(card.id)) return
      const d = depthLevel.value - (card.depth || 0)
      if (d <= 0) return
      applyDepth(card, d)
    })
  }

  // ─── Incremental apply (for streaming) ───

  /**
   * Apply a single operation to the canvas with animations.
   * Called by timeline store when a new operation is added during streaming.
   * Returns the card ID for 'create' operations.
   */
  function applyOperation(op) {
    switch (op.op) {
      case 'push': {
        greetingVisible.value = false
        pushOldBlocks()
        break
      }
      case 'create': {
        greetingVisible.value = false
        // Don't push again if already pushed this round
        if (currentRoundDepth.value !== depthLevel.value) {
          pushOldBlocks()
        }

        const c = op.card
        const globalIndex = op.globalIndex ?? 0
        const contentKey = c.contentKey || `r${depthLevel.value}-${globalIndex}`

        // Check for existing card (streaming update of same block)
        let existingId = null
        cards.forEach((card) => {
          if (card.contentKey === contentKey) existingId = card.id
        })

        if (existingId) {
          const card = cards.get(existingId)
          if (card) {
            card.type = c.type
            card.data = { ...c.data }
            card.depth = depthLevel.value
            card.blur = 0
            currentRoundIds.value.add(existingId)
          }
          return existingId
        }

        // Push siblings back in z
        const INTRA_PUSH = 30
        const groupCount = currentRoundIds.value.size

        currentRoundIds.value.forEach(sibId => {
          const sib = cards.get(sibId)
          if (!sib || selectedIds.value.has(sibId)) return
          const curZ = sib.intraZ || 0
          const pushed = curZ - INTRA_PUSH
          sib.intraZ = pushed
          sib.z = pushed
          sib.scale = 1
          sib.opacity = 1
          sib.zIndex = 100 + Math.floor(pushed / 10)
        })

        const llmZ = c.data?.z || 0
        let maxGroupZ = 0
        currentRoundIds.value.forEach(sibId => {
          const sib = cards.get(sibId)
          if (sib) {
            const sz = sib.intraZ || 0
            if (sz > maxGroupZ) maxGroupZ = sz
          }
        })
        const intraZ = Math.max(llmZ, maxGroupZ + INTRA_PUSH, groupCount * INTRA_PUSH)

        const id = c.id || nextId()
        const data = c.data || {}
        const card = reactive({
          id,
          type: c.type,
          data: { ...data },
          x: data.x != null ? 5 + (data.x / 100) * 90 : 50,
          y: data.y != null ? 5 + (data.y / 100) * 75 : 30,
          z: 40,
          w: data.w || c.w || 25,
          depth: depthLevel.value,
          opacity: 0,
          scale: 1.06,
          blur: 0,
          zIndex: 100 + Math.floor(intraZ / 10),
          selected: false,
          pinned: false,
          intraZ,
          contentKey,
          entranceDelay: globalIndex * 0.05,
          _targetZ: intraZ,
        })

        cards.set(id, card)
        currentRoundIds.value.add(id)

        const delay = Math.max(10, globalIndex * 50)
        setTimeout(() => {
          card.z = intraZ
          card.scale = 1
          card.opacity = 1
          setTimeout(() => { card.entranceDelay = 0 }, 1200)
        }, delay)

        return id
      }
      case 'move': {
        const card = cards.get(op.cardId)
        if (card && op.to) {
          card.depth = depthLevel.value
          currentRoundIds.value.add(card.id)
          card.blur = 0
          card.opacity = 1
          card.pinned = true
          if (op.to.x != null) card.x = op.to.x
          if (op.to.y != null) card.y = op.to.y
          if (op.to.z != null) {
            card.intraZ = op.to.z
            card.z = op.to.z
          }
          card.scale = 1
          card.zIndex = 100 + Math.floor((card.intraZ || 0) / 10)
        }
        break
      }
      case 'update': {
        const card = cards.get(op.cardId)
        if (card && op.changes) {
          card.depth = depthLevel.value
          card.pinned = true
          currentRoundIds.value.add(card.id)
          card.blur = 0
          card.opacity = 1
          Object.assign(card.data, op.changes)
        }
        break
      }
      case 'remove': {
        cards.delete(op.cardId)
        break
      }
    }
  }

  // ─── Full restore (for navigation) ───

  /**
   * Replace canvas state with a computed snapshot from timeline.
   * No animations — instant state swap for timeline navigation.
   */
  function restoreFrom(computedCards) {
    cards.clear()
    currentRoundIds.value = new Set()
    selectedIds.value = new Set()

    let maxDepth = 0
    const targets = []
    computedCards.forEach((card) => {
      if (card.depth > maxDepth) maxDepth = card.depth
      const targetOpacity = card.opacity ?? 1
      const restored = reactive({ ...card, opacity: 0 })
      cards.set(card.id, restored)
      targets.push({ card: restored, opacity: targetOpacity })
    })

    depthLevel.value = maxDepth
    currentRoundDepth.value = maxDepth
    greetingVisible.value = false

    // Fade in after a tick (CSS transition handles the animation)
    setTimeout(() => {
      targets.forEach(({ card, opacity }) => {
        card.opacity = opacity
      })
    }, 30)
  }

  // ─── Begin new round ───

  function beginRound() {
    currentRoundDepth.value = -1
    currentRoundIds.value = new Set()
  }

  // ─── Selection ───

  function toggleSelect(id, opts) {
    const multi = opts?.multi ?? false
    if (!multi) {
      // Single click — clear others first, then toggle this one
      clearSelection()
    }
    const card = cards.get(id)
    if (!card) return
    if (card.selected) {
      card.selected = false
      selectedIds.value.delete(id)
      const d = depthLevel.value - (card.depth || 0)
      applyDepth(card, d)
    } else {
      card.selected = true
      selectedIds.value.add(id)
      card.z = 300
      card.scale = 1.05
      card.opacity = 1
      card.zIndex = 999
      card.blur = 0
    }
  }

  function clearSelection() {
    selectedIds.value.forEach(id => {
      const card = cards.get(id)
      if (card) {
        card.selected = false
        const d = depthLevel.value - (card.depth || 0)
        applyDepth(card, d)
      }
    })
    selectedIds.value.clear()
  }

  // ─── Context for LLM ───

  function getSelectedContext() {
    const texts = []
    selectedIds.value.forEach(id => {
      const card = cards.get(id)
      if (card) {
        const d = card.data
        const text = d.title || d.text || d.content || d.value || d.caption || ''
        texts.push(String(text).slice(0, 200))
      }
    })
    return texts.length ? texts.join('\n---\n') : null
  }

  function getCanvasContext() {
    const allCards = Array.from(cards.values())
    if (!allCards.length) return null
    const maxDepth = Math.max(...allCards.map(c => c.depth || 0), 0)
    const currentGroup = []
    const olderCards = []
    allCards.forEach(card => {
      if (card.depth === maxDepth) {
        try {
          currentGroup.push(`<!--vt:${card.type} ${JSON.stringify(card.data)}-->`)
        } catch { }
      } else {
        const title = getCardTitle(card)
        if (title) olderCards.push(`"${title}" (depth:${card.depth})`)
      }
    })
    if (!currentGroup.length && !olderCards.length) return null
    let ctx = '[Current canvas state]\n'
    if (currentGroup.length) ctx += `Latest cards:\n${currentGroup.join('\n')}\n`
    if (olderCards.length) ctx += `Older (receding): ${olderCards.join(', ')}\n`
    return ctx
  }

  function updateCardPosition(id, x, y) {
    const card = cards.get(id)
    if (card) {
      card.x = x
      card.y = y
    }
  }

  return {
    cards,
    depthLevel,
    currentRoundDepth,
    currentRoundIds,
    selectedIds,
    greetingVisible,
    isStreaming,
    applyOperation,
    restoreFrom,
    beginRound,
    toggleSelect,
    clearSelection,
    getSelectedContext,
    getCanvasContext,
    updateCardPosition,
    getCardTitle,
  }
})
