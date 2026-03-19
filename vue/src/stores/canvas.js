import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { nextId } from '../lib/id.js'

export const useCanvasStore = defineStore('canvas', () => {
  // cards: Map<string, CardState>
  const cards = reactive(new Map())
  const depthLevel = ref(0)
  const currentRoundDepth = ref(-1)
  const currentRoundIds = ref(new Set())
  const selectedIds = ref(new Set())
  const greetingVisible = ref(true)

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
    if (o <= 0) {
      cards.delete(card.id)
    }
  }

  function pushOldBlocks() {
    if (currentRoundDepth.value === depthLevel.value) return
    depthLevel.value++
    currentRoundDepth.value = depthLevel.value

    // Preserve any cards already in current round (from move/update)
    const preserved = new Set(currentRoundIds.value)
    currentRoundIds.value = preserved
    preserved.forEach(id => {
      const card = cards.get(id)
      if (card) card.depth = depthLevel.value
    })

    // Promote selected cards
    selectedIds.value.forEach(id => {
      const card = cards.get(id)
      if (card) {
        card.depth = depthLevel.value
        card.pinned = true
        currentRoundIds.value.add(id)
      }
    })
    clearSelection()

    // Push old blocks back
    cards.forEach((card) => {
      if (currentRoundIds.value.has(card.id)) return
      const d = depthLevel.value - (card.depth || 0)
      if (d <= 0) return
      applyDepth(card, d)
    })
  }

  function addCard(type, data, globalIndex) {
    greetingVisible.value = false
    pushOldBlocks()

    const contentKey = `r${depthLevel.value}-${globalIndex}`

    // Check for existing card with same key (streaming update)
    let existingId = null
    cards.forEach((card) => {
      if (card.contentKey === contentKey) existingId = card.id
    })

    if (existingId) {
      const card = cards.get(existingId)
      if (card) {
        card.type = type
        card.data = { ...data }
        card.depth = depthLevel.value
        card.blur = 0
        currentRoundIds.value.add(existingId)
      }
      return existingId
    }

    // Push existing cards in current group back
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

    // New card at front
    const llmZ = data.z || 0
    let maxGroupZ = 0
    currentRoundIds.value.forEach(sibId => {
      const sib = cards.get(sibId)
      if (sib) {
        const sz = sib.intraZ || 0
        if (sz > maxGroupZ) maxGroupZ = sz
      }
    })
    const intraZ = Math.max(llmZ, maxGroupZ + INTRA_PUSH, groupCount * INTRA_PUSH)

    const id = nextId()
    const card = reactive({
      id,
      type,
      data: { ...data },
      // Position — remap to safe area
      x: data.x != null ? 5 + (data.x / 100) * 90 : 50,
      y: data.y != null ? 5 + (data.y / 100) * 75 : 30,
      z: 40, // entrance: start close
      w: data.w || 25,
      depth: depthLevel.value,
      opacity: 0,
      scale: 1.06,
      blur: 0,
      zIndex: 100 + Math.floor(intraZ / 10),
      selected: false,
      pinned: false,
      intraZ,
      contentKey,
      entranceDelay: 0,
      // final z to settle into after entrance
      _targetZ: intraZ,
    })

    cards.set(id, card)
    currentRoundIds.value.add(id)

    // Trigger entrance animation (next tick)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.z = intraZ
        card.scale = 1
        card.opacity = 1
      })
    })

    return id
  }

  function executeCommand(cmd) {
    if (cmd.cmd === 'move') {
      const target = (cmd.title || '').toLowerCase()
      cards.forEach((card) => {
        const title = getCardTitle(card)
        if (title.includes(target)) {
          card.depth = depthLevel.value
          currentRoundIds.value.add(card.id)
          card.blur = 0
          card.opacity = 1
          card.pinned = true
          if (cmd.x != null) card.x = 5 + (cmd.x / 100) * 90
          if (cmd.y != null) card.y = 5 + (cmd.y / 100) * 75
          const z = cmd.z != null ? cmd.z : 30
          card.intraZ = z
          card.z = z
          card.scale = 1
          card.zIndex = 100 + Math.floor(z / 10)
        }
      })
    } else if (cmd.cmd === 'update') {
      const target = (cmd.title || '').toLowerCase()
      cards.forEach((card) => {
        const title = getCardTitle(card)
        if (title.includes(target)) {
          card.depth = depthLevel.value
          card.pinned = true
          currentRoundIds.value.add(card.id)
          card.blur = 0
          card.opacity = 1
          // Apply updates
          const { cmd: _, title: __, ...updates } = cmd
          if (updates.newTitle) {
            updates.title = updates.newTitle
            delete updates.newTitle
          }
          Object.assign(card.data, updates)
        }
      })
    }
  }

  function toggleSelect(id) {
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

  function beginRound() {
    currentRoundDepth.value = -1
    currentRoundIds.value = new Set()
  }

  return {
    cards,
    depthLevel,
    currentRoundDepth,
    currentRoundIds,
    selectedIds,
    greetingVisible,
    pushOldBlocks,
    addCard,
    executeCommand,
    toggleSelect,
    clearSelection,
    getSelectedContext,
    getCanvasContext,
    updateCardPosition,
    beginRound,
  }
})
