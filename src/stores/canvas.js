import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

/**
 * Canvas Store — Pure View Layer (v2)
 * 
 * Canvas is a derived view of timeline state. It receives snapshots
 * and renders them with animations. No state computation here.
 * 
 * Single entry point: applySnapshot(cards, { animate })
 */
export const useCanvasStore = defineStore('canvas', () => {
  const cards = reactive(new Map())
  const selectedIds = ref(new Set())
  const greetingVisible = ref(true)
  const isStreaming = ref(false)

  // Generation counter for cancelling stale transitions
  let snapshotGen = 0

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
  }

  /**
   * Apply a canvas snapshot. This is the ONLY way to update card state.
   * 
   * Two-pass approach:
   *   1. Upsert: iterate snapshot — update existing or create new cards
   *   2. Cleanup: iterate cards — fade out any not in snapshot
   * 
   * @param {Map} snapshot - Map<id, CardState> from computeCanvas or liveState
   * @param {Object} opts - { animate: true } for streaming, false for instant
   */
  function applySnapshot(snapshot, { animate = true } = {}) {
    const gen = ++snapshotGen

    if (snapshot.size > 0) greetingVisible.value = false

    // Build snapshot lookup by contentKey
    const targetByKey = new Map()
    snapshot.forEach(card => {
      if (card.contentKey) targetByKey.set(card.contentKey, card)
    })

    // Build existing lookup by contentKey
    const existingByKey = new Map()
    cards.forEach((card, id) => {
      if (card.contentKey) existingByKey.set(card.contentKey, id)
    })

    // ── Pass 1: Upsert — iterate snapshot, update or create ──
    targetByKey.forEach((target, key) => {
      const existingId = existingByKey.get(key)

      if (existingId != null) {
        // Update existing card
        const card = cards.get(existingId)
        if (card) {
          card.x = target.x
          card.y = target.y
          card.z = target.z ?? 0
          card.w = target.w ?? card.w
          card.opacity = target.opacity ?? 1
          card.scale = target.scale ?? 1
          card.blur = target.blur ?? 0
          card.zIndex = target.zIndex ?? 100
          card.depth = target.depth
          card.intraZ = target.intraZ ?? 0
          card.type = target.type
          card.data = { ...target.data }
          card.pinned = target.pinned ?? false
          card.pointerEvents = 'auto'
          // Don't touch card.selected — that's UI state
        }
      } else {
        // Create new card
        if (animate) {
          // Fly in: start behind, animate to target
          const card = reactive({
            ...target,
            opacity: 0,
            z: -200,
            scale: 0.8,
            blur: 4,
            selected: false,
            pointerEvents: 'auto',
            entranceDelay: 0,
          })
          cards.set(target.id, card)
          // Animate to target state — double rAF ensures initial state is painted first
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (snapshotGen !== gen) return
              card.opacity = target.opacity ?? 1
              card.z = target.z ?? 0
              card.scale = target.scale ?? 1
              card.blur = target.blur ?? 0
            })
          })
        } else {
          // Instant: no animation
          const card = reactive({
            ...target,
            selected: false,
            pointerEvents: 'auto',
            entranceDelay: 0,
          })
          cards.set(target.id, card)
        }
      }
    })

    // ── Pass 2: Cleanup — remove cards not in snapshot ──
    cards.forEach((card, id) => {
      if (card.pointerEvents === 'none') return // already fading out
      if (!card.contentKey) return // no key to match
      if (targetByKey.has(card.contentKey)) return // still in snapshot

      if (animate) {
        card.opacity = 0
        card.z = -400
        card.scale = 0.5
        card.blur = 8
        card.pointerEvents = 'none'
        setTimeout(() => {
          if (snapshotGen !== gen) return
          cards.delete(id)
        }, 800)
      } else {
        cards.delete(id)
      }
    })

    greetingVisible.value = snapshot.size === 0 && cards.size === 0
  }

  // ─── Selection ───

  function toggleSelect(id, opts) {
    const multi = opts?.multi ?? false
    if (!multi) {
      clearSelection()
    }
    const card = cards.get(id)
    if (!card) return
    if (card.selected) {
      card.selected = false
      selectedIds.value.delete(id)
      // Restore depth appearance
      if (card.depth != null) {
        // Read current max depth from cards
        let maxDepth = 0
        cards.forEach(c => { if (c.depth > maxDepth) maxDepth = c.depth })
        const d = maxDepth - (card.depth || 0)
        applyDepth(card, d)
      }
    } else {
      card.selected = true
      selectedIds.value.add(id)
      card.z = 120
      card.scale = 1.02
      card.opacity = 1
      card.zIndex = 999
      card.blur = 0
    }
  }

  function clearSelection() {
    let maxDepth = 0
    cards.forEach(c => { if (c.depth > maxDepth) maxDepth = c.depth })
    selectedIds.value.forEach(id => {
      const card = cards.get(id)
      if (card) {
        card.selected = false
        const d = maxDepth - (card.depth || 0)
        applyDepth(card, d)
      }
    })
    selectedIds.value.clear()
  }

  // ─── Context for LLM ───

  function updateCardPosition(id, x, y) {
    const card = cards.get(id)
    if (card) {
      card.x = x
      card.y = y
    }
  }

  function clear({ animate = true } = {}) {
    const gen = ++snapshotGen

    if (!animate || cards.size === 0) {
      cards.clear()
      selectedIds.value.clear()
      greetingVisible.value = true
      isStreaming.value = false
      return
    }

    // Push everything back into the distance
    cards.forEach(card => {
      card.opacity = 0
      card.z = (card.z || 0) - 600
      card.scale = (card.scale || 1) * 0.3
      card.blur = 12
      card.pointerEvents = 'none'
    })

    setTimeout(() => {
      if (snapshotGen !== gen) return
      cards.clear()
      selectedIds.value.clear()
      greetingVisible.value = true
      isStreaming.value = false
    }, 800)
  }

  function restoreFrom(snapshot) {
    applySnapshot(snapshot, { animate: false })
  }

  return {
    cards,
    selectedIds,
    greetingVisible,
    isStreaming,
    applySnapshot,
    restoreFrom,
    toggleSelect,
    clearSelection,
    updateCardPosition,
    clear,
  }
})
