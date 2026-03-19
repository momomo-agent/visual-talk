<template>
  <div class="canvas" @click="handleBgClick">
    <div class="canvas-space" ref="spaceRef">
      <BlockCard
        v-for="[id, card] in cards"
        :key="id"
        :card="card"
        @toggle-select="toggleSelect(id, $event)"
        @update-position="(x, y) => updateCardPosition(id, x, y)"
      />
    </div>
    <div class="greeting" :class="{ hidden: !greetingVisible }">visual talk</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../stores/canvas.js'
import BlockCard from './BlockCard.vue'

const canvas = useCanvasStore()
const { cards, greetingVisible } = storeToRefs(canvas)
const { toggleSelect, clearSelection, updateCardPosition } = canvas

const spaceRef = ref(null)

function handleBgClick(e) {
  if (e.target.closest('.v-block') || e.target.closest('.input-bar')) return
  clearSelection()
}

function onMouseMove(e) {
  if (!spaceRef.value) return
  const rx = (e.clientY / window.innerHeight - 0.5) * -8
  const ry = (e.clientX / window.innerWidth - 0.5) * 8
  spaceRef.value.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
})
</script>
