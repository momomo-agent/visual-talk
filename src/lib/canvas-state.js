/**
 * CanvasState — Pure state computation for canvas cards.
 * 
 * Single source of truth for how operations produce card state.
 * Used by both computeCanvas (navigation) and live streaming.
 * No DOM, no animation, no reactivity — just data.
 */

import { Z_INTRA_STEP, Z_PINNED, Z_PER_DEPTH } from './z-layers.js'

export class CanvasState {
  constructor() {
    this.cards = new Map()
    this.depthLevel = 0
    this.currentRoundIds = new Set()
    this.pinnedIds = new Set()
  }

  /**
   * Begin a new conversation round.
   * Call before processing a new node's operations.
   */
  beginNode() {
    this.pinnedIds = new Set()
    this.currentRoundIds = new Set()
  }

  /**
   * Pre-scan operations to find pinned cards (promote/update/move targets).
   * Must be called before apply() for correct push behavior.
   */
  preScan(operations) {
    for (const op of operations) {
      if ((op.op === 'promote' || op.op === 'update' || op.op === 'move') && op.cardId != null) {
        this.pinnedIds.add(op.cardId)
      }
    }
  }

  /**
   * Apply a single operation to the state.
   */
  apply(op) {
    switch (op.op) {
      case 'promote':
        this.pinnedIds.add(op.cardId)
        break
      case 'push':
        this._push()
        break
      case 'create':
        this._create(op)
        break
      case 'update':
        this._update(op)
        break
      case 'move':
        this._move(op)
        break
      case 'user-move':
        this._userMove(op)
        break
      case 'remove':
        this.cards.delete(op.cardId)
        break
    }
  }

  _push() {
    this.depthLevel++
    this.cards.forEach((card, id) => {
      if (this.pinnedIds.has(id) || this.currentRoundIds.has(id)) {
        card.depth = this.depthLevel
        // Pinned cards stay visible but behind new cards
        card.intraZ = Z_PINNED
        card.z = Z_PINNED
        card.zIndex = 100 + Math.floor(Z_PINNED / 10)
        card.opacity = 1
        card.scale = 1
        card.blur = 0
        return
      }
      const d = this.depthLevel - card.depth
      if (d > 0) {
        card.z = d * Z_PER_DEPTH
        card.scale = Math.max(0.5, 1 - d * 0.12)
        card.opacity = Math.max(0, 1 - d * 0.45)
        card.blur = d >= 1 ? d * 4 : 0
        card.zIndex = Math.max(1, 50 - d * 20)
      }
      if (card.opacity <= 0) this.cards.delete(id)
    })
  }

  _create(op) {
    const c = op.card
    if (!c) return
    const data = c.data || {}

    // IntraZ: push siblings back, new card goes to front
    const groupCount = this.currentRoundIds.size
    this.currentRoundIds.forEach(sibId => {
      const sib = this.cards.get(sibId)
      if (!sib) return
      const curZ = sib.intraZ || 0
      const pushed = curZ - Z_INTRA_STEP
      sib.intraZ = pushed
      sib.z = pushed
      sib.zIndex = 100 + Math.floor(pushed / 10)
    })

    const llmZ = data.z || 0
    let maxGroupZ = 0
    this.currentRoundIds.forEach(sibId => {
      const sib = this.cards.get(sibId)
      if (sib) {
        const sz = sib.intraZ || 0
        if (sz > maxGroupZ) maxGroupZ = sz
      }
    })
    const intraZ = Math.max(llmZ, maxGroupZ + Z_INTRA_STEP, groupCount * Z_INTRA_STEP)

    this.cards.set(c.id, {
      id: c.id,
      type: c.type,
      data: { ...data },
      x: c.x ?? (data.x != null ? 5 + (data.x / 100) * 90 : 50),
      y: c.y ?? (data.y != null ? 5 + (data.y / 100) * 75 : 30),
      z: intraZ,
      w: c.w ?? data.w ?? 25,
      depth: this.depthLevel,
      opacity: 1,
      scale: 1,
      blur: 0,
      zIndex: 100 + Math.floor(intraZ / 10),
      intraZ,
      pinned: false,
      contentKey: c.contentKey,
    })
    this.currentRoundIds.add(c.id)
  }

  _update(op) {
    const card = this.cards.get(op.cardId)
    if (!card) return
    if (op.changes) {
      Object.assign(card.data, op.changes)
    }
    card.depth = this.depthLevel
    card.intraZ = Z_PINNED
    card.z = Z_PINNED
    card.opacity = 1
    card.blur = 0
    card.scale = 1
    card.zIndex = 100 + Math.floor(Z_PINNED / 10)
    card.pinned = true
    this.currentRoundIds.add(op.cardId)
  }

  _move(op) {
    const card = this.cards.get(op.cardId)
    if (!card || !op.to) return
    if (op.to.x != null) card.x = op.to.x
    if (op.to.y != null) card.y = op.to.y
    // LLM can specify z, but clamp to PINNED range (never above new cards)
    const targetZ = op.to.z != null ? Math.min(op.to.z, Z_PINNED) : Z_PINNED
    card.z = targetZ
    card.intraZ = targetZ
    card.depth = this.depthLevel
    card.opacity = 1
    card.blur = 0
    card.scale = 1
    card.zIndex = 100 + Math.floor(targetZ / 10)
    card.pinned = true
    this.currentRoundIds.add(op.cardId)
  }

  /**
   * User drag — only updates position, preserves all visual state (z/opacity/scale/blur).
   * Used when user manually repositions a card on canvas.
   */
  _userMove(op) {
    const card = this.cards.get(op.cardId)
    if (!card || !op.to) return
    if (op.to.x != null) card.x = op.to.x
    if (op.to.y != null) card.y = op.to.y
  }
}
