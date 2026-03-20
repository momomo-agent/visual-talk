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
  }

  /**
   * Apply a canvas snapshot. This is the ONLY way to update card state.
   * 
   * @param {Map} snapshot - Map<id, CardState> from computeCanvas or liveState
   * @param {Object} opts - { animate: true } for streaming, false for instant
   */
  function applySnapshot(snapshot, { animate = true } = {}) {
    const gen = ++snapshotGen

    if (snapshot.size > 0) greetingVisible.value = false

    // Build target lookup by contentKey
    const targetByKey = new Map()
    snapshot.forEach(card => {
      if (card.contentKey) targetByKey.set(card.contentKey, card)
    })

    // Build existing lookup by contentKey
    const existingByKey = new Map()
    cards.forEach((card, id) => {
      if (card.contentKey) existingByKey.set(card.contentKey, id)
    })

    // Diff: matched, to-remove, to-create
    const matchedKeys = new Set()

    // 1. Update existing cards that match by contentKey
    existingByKey.forEach((id, key) => {
      const target = targetByKey.get(key)
      if (target) {
        matchedKeys.add(key)
        const card = cards.get(id)
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
        // Card no longer in snapshot — fade out or remove instantly
        const card = cards.get(id)
        if (card) {
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
        }
      }
    })

    // 2. Create new cards
    targetByKey.forEach((target, key) => {
      if (matchedKeys.has(key)) return

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
    })

    // 3. Remove cards not in either lookup (orphans from previous restores)
    cards.forEach((card, id) => {
      if (card.pointerEvents === 'none') return // already fading out
      if (!card.contentKey) return // no key to match
      if (!targetByKey.has(card.contentKey) && !existingByKey.has(card.contentKey)) {
        card.opacity = 0
        card.pointerEvents = 'none'
        setTimeout(() => {
          if (snapshotGen !== gen) return
          cards.delete(id)
        }, 600)
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

  function getSelectedContext() {
    const texts = []
    selectedIds.value.forEach(id => {
      const card = cards.get(id)
      if (card) {
        const d = card.data
        const parts = []
        if (d.title) parts.push(d.title)
        if (d.sub) parts.push(d.sub)
        if (d.label) parts.push(d.label)
        if (d.value != null) parts.push(String(d.value) + (d.unit || ''))
        if (d.text) parts.push(d.text)
        if (d.content) parts.push(d.content)
        if (d.caption) parts.push(d.caption)
        if (d.code) parts.push(d.code)
        if (d.author) parts.push(d.author)
        if (d.source) parts.push(d.source)
        if (d.footer) parts.push(d.footer)
        if (d.tags?.length) parts.push(d.tags.join(', '))
        if (d.items?.length) {
          d.items.forEach(it => {
            const t = typeof it === 'string' ? it : (it.text || it.title || it.label || '')
            if (t) parts.push(t)
          })
        }
        if (d.cols?.length) {
          d.cols.forEach(c => {
            if (c.name) parts.push(c.name)
            ;(c.items || []).forEach(it => { if (it) parts.push(String(it)) })
          })
        }
        const text = parts.join('\n')
        if (text) texts.push(text.slice(0, 200))
      }
    })
    return texts.length ? texts.join('\n---\n') : null
  }

  function getCanvasContext() {
    const allCards = Array.from(cards.entries())
    if (!allCards.length) return null
    const maxDepth = Math.max(...allCards.map(([, c]) => c.depth || 0), 0)
    const currentGroup = []
    const olderCards = []
    allCards.forEach(([id, card]) => {
      if (card.depth === maxDepth) {
        try {
          currentGroup.push(`[${id}] <!--vt:${card.type} ${JSON.stringify(card.data)}-->`)
        } catch { }
      } else {
        const title = getCardTitle(card)
        if (title) olderCards.push(`[${id}] "${title}"`)
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
    selectedIds,
    greetingVisible,
    isStreaming,
    applySnapshot,
    toggleSelect,
    clearSelection,
    getSelectedContext,
    getCanvasContext,
    updateCardPosition,
    getCardTitle,
  }
})
