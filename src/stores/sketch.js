import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

/**
 * Sketch Store — manages canvas overlay annotations
 * 
 * Types:
 * - arrow: { from: cardKey, to: cardKey, label?, color? }
 * - line: { points: [[x,y]...], color?, width? }
 * - circle: { target: cardKey, color? } OR { cx, cy, r, color? }
 * - label: { text, x, y, color? }
 * - underline: { target: cardKey, color? }
 */
export const useSketchStore = defineStore('sketch', () => {
  const sketches = reactive(new Map())
  let idCounter = 0

  function add(sketch) {
    const id = `sk-${idCounter++}`
    sketches.set(id, { id, ...sketch })
    return id
  }

  function remove(id) {
    sketches.delete(id)
  }

  function clear() {
    sketches.clear()
    idCounter = 0
  }

  function setFromOperations(ops) {
    for (const op of ops) {
      add(op)
    }
  }

  return {
    sketches,
    add,
    remove,
    clear,
    setFromOperations,
  }
})
