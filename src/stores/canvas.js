import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { Z_SELECTED, Z_ENTER, Z_FADE_OUT, Z_EXIT } from '../lib/z-layers.js'

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
  const isNavigating = ref(false)

  // Generation counter for cancelling stale transitions
  let snapshotGen = 0

  function applyDepth(card, d) {
    const z = -d * 160
    const s = Math.max(0.5, 1 - d * 0.12)
    const o = Math.max(0, 1 - d * 0.45)
    // For current-round cards (d===0), restore their intraZ ordering
    card.z = d === 0 ? (card.intraZ || 0) : z
    card.scale = s
    card.opacity = o
    card.zIndex = d === 0 ? (100 + Math.floor((card.intraZ || 0) / 10)) : Math.max(1, 50 - d * 20)
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
  function applySnapshot(snapshot, { animate = true, navigate = false } = {}) {
    const gen = ++snapshotGen

    if (snapshot.size > 0) greetingVisible.value = false

    // ── Pass 1: Upsert — iterate snapshot, update or create by card id ──
    snapshot.forEach((target, targetId) => {
      const existing = cards.get(targetId)

      if (existing) {
        // Update existing card — same id, just sync state
        existing.x = target.x
        existing.y = target.y
        existing.z = target.z ?? 0
        existing.w = target.w ?? existing.w
        existing.opacity = target.opacity ?? 1
        existing.scale = target.scale ?? 1
        existing.blur = target.blur ?? 0
        existing.zIndex = target.zIndex ?? 100
        existing.depth = target.depth
        existing.intraZ = target.intraZ ?? 0
        existing.type = target.type
        existing.data = { ...target.data }
        existing.pinned = target.pinned ?? false
        existing.pointerEvents = target.pointerEvents || 'auto'
        existing.contentKey = target.contentKey
      } else {
        // Create new card
        if (navigate) {
          // Navigation: container handles the spatial animation
          // Cards just appear instantly at final state
          const card = reactive({
            ...target,
            selected: false,
            pointerEvents: 'auto',
            entranceDelay: 0,
          })
          cards.set(targetId, card)
        } else if (animate) {
          // Streaming: fly in from deep space
          const card = reactive({
            ...target,
            opacity: 0,
            z: Z_ENTER,
            scale: 0.4,
            blur: 6,
            selected: false,
            pointerEvents: 'auto',
            entranceDelay: 0,
          })
          cards.set(targetId, card)
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
          const card = reactive({
            ...target,
            selected: false,
            pointerEvents: 'auto',
            entranceDelay: 0,
          })
          cards.set(targetId, card)
        }
      }
    })

    // ── Pass 2: Cleanup — fade out cards not in snapshot ──
    const snapshotIds = new Set(snapshot.keys())
    cards.forEach((card, id) => {
      if (card.pointerEvents === 'none') return
      if (snapshotIds.has(id)) return

      if (navigate) {
        // Navigation: container handles animation, just remove instantly
        cards.delete(id)
      } else if (animate) {
        card.opacity = 0
        card.z = Z_FADE_OUT
        card.scale = 0.3
        card.blur = 10
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
      if (card.depth != null) {
        let maxDepth = 0
        cards.forEach(c => { if (c.depth > maxDepth) maxDepth = c.depth })
        const d = maxDepth - (card.depth || 0)
        applyDepth(card, d)
      }
    } else {
      card.selected = true
      selectedIds.value.add(id)
      card.z = Z_SELECTED       // absolute z — guaranteed on top
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
      card.z = Z_EXIT
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
    isNavigating,
    applySnapshot,
    restoreFrom,
    toggleSelect,
    clearSelection,
    updateCardPosition,
    clear,
  }
})
