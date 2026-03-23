import { onMounted, onUnmounted, ref } from 'vue'
import { useTimelineStore } from '../stores/timeline.js'
import { useCanvasStore } from '../stores/canvas.js'

const SCROLL_THRESHOLD = 80

/**
 * useTimeline — handles scroll wheel and keyboard navigation
 * through the conversation tree.
 * 
 * Up/Down = parent/child (time axis)
 * Left/Right = sibling branches (parallel universes)
 */
export function useTimeline() {
  const timeline = useTimelineStore()
  const canvas = useCanvasStore()
  
  const isScrollingTimeline = ref(false)
  let scrollAccumX = 0
  let scrollAccumY = 0
  let scrollTimer = null
  let bubbleHideTimer = null

  function showTimelineBubble() {
    isScrollingTimeline.value = true
    clearTimeout(bubbleHideTimer)
    bubbleHideTimer = setTimeout(() => {
      isScrollingTimeline.value = false
    }, 3000)
  }

  function navigateAndRestore(direction) {
    const moved = timeline.navigate(direction)
    if (!moved) return false

    // Clear selection when navigating timeline
    canvas.clearSelection()

    const viewId = timeline.viewingId ?? timeline.activeTip
    if (viewId != null) {
      if (timeline.isLive) {
        const snapshot = timeline.computeCanvas(timeline.activeTip)
        canvas.applySnapshot(snapshot, { animate: true, navigate: true })
        isScrollingTimeline.value = false
        clearTimeout(bubbleHideTimer)
      } else {
        showTimelineBubble()
        const snapshot = timeline.computeCanvas(viewId)
        canvas.applySnapshot(snapshot, { animate: true, navigate: true })
      }
    }
    return true
  }

  function handleWheel(e) {
    if (timeline.nodeCount <= 1) return
    // Don't intercept if over config panel
    if (e.target.closest('.config-overlay')) return

    const dx = Math.abs(e.deltaX)
    const dy = Math.abs(e.deltaY)

    // Determine primary axis
    if (dx > dy && dx > 5) {
      // Horizontal scroll → sibling navigation
      scrollAccumX += e.deltaX
      if (Math.abs(scrollAccumX) > SCROLL_THRESHOLD) {
        const dir = scrollAccumX > 0 ? 'right' : 'left'
        navigateAndRestore(dir)
        scrollAccumX = 0
      }
      e.preventDefault()
    } else if (dy > 5) {
      // Vertical scroll → time navigation
      scrollAccumY += e.deltaY
      if (Math.abs(scrollAccumY) > SCROLL_THRESHOLD) {
        const dir = scrollAccumY > 0 ? 'up' : 'down'
        navigateAndRestore(dir)
        scrollAccumY = 0
      }
      e.preventDefault()
    }

    // Reset accumulators after pause
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      scrollAccumX = 0
      scrollAccumY = 0
    }, 200)
  }

  function handleKeyDown(e) {
    if (timeline.nodeCount <= 1) return
    // Don't intercept if typing in input
    if (e.target.matches('input, textarea, select')) return

    const dirMap = {
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
    }

    const dir = dirMap[e.key]
    if (dir) {
      e.preventDefault()
      navigateAndRestore(dir)
    }
  }

  onMounted(() => {
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('wheel', handleWheel)
    window.removeEventListener('keydown', handleKeyDown)
    clearTimeout(scrollTimer)
  })

  return {
    isScrollingTimeline,
    navigateAndRestore,
  }
}
