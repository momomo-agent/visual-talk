<template>
  <Transition name="dock-panel">
    <div v-if="dockedCards.length" class="docked-sidebar">
      <div class="dock-header">
        <span class="dock-label">⚓</span>
      </div>
      <div class="dock-list">
        <div
          v-for="[id, card] in dockedCards"
          :key="id"
          class="dock-item"
          @dblclick.stop="undock(id)"
          :title="'双击取消固定'"
        >
          <BlockCard
            :card="card"
            class="dock-card-inner"
            @toggle-select="() => {}"
            @update-position="() => {}"
            @drag-end="() => {}"
            @toggle-dock="() => undock(id)"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import { useTimelineStore } from '../stores/timeline.js'
import BlockCard from './BlockCard.vue'

const canvas = useCanvasStore()
const timeline = useTimelineStore()
const { cards } = storeToRefs(canvas)
const { dockedIds } = storeToRefs(timeline)

// Docked cards: look up from canvas by id
const dockedCards = computed(() => {
  const result = []
  dockedIds.value.forEach(id => {
    const card = cards.value.get(id)
    if (card) result.push([id, card])
  })
  return result
})

function undock(cardId) {
  timeline.toggleDock(cardId)
}
</script>

<style scoped>
.docked-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 60px;
  width: 260px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 8px;
  overflow-y: auto;
  pointer-events: auto;
  background: linear-gradient(90deg, rgba(20,18,15,0.6) 0%, transparent 100%);
}

.dock-header {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.dock-label {
  font-size: 11px;
  color: rgba(180,150,110,0.35);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.dock-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dock-item {
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
  transform-origin: left center;
}

.dock-item:hover {
  transform: scale(1.02);
}

/* Override BlockCard positioning — sidebar uses flow layout */
.dock-item :deep(.v-block) {
  position: relative !important;
  transform: none !important;
  width: 100% !important;
  left: auto !important;
  top: auto !important;
  opacity: 1 !important;
  filter: none !important;
  max-width: none !important;
}

/* Transition */
.dock-panel-enter-active,
.dock-panel-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.dock-panel-enter-from,
.dock-panel-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@media (max-width: 768px) {
  .docked-sidebar { width: 200px; }
}
</style>
