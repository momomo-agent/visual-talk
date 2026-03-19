<template>
  <div class="bubble" :class="bubbleClass">{{ text }}</div>
</template>

<script setup>
import { computed, watch, ref } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  visible: { type: Boolean, default: false },
})

const isFading = ref(false)
let fadeTimer = null

const bubbleClass = computed(() => ({
  visible: props.visible && !isFading.value,
  fading: isFading.value,
}))

// When visible goes from true to false, do fading transition
watch(() => props.visible, (newVal, oldVal) => {
  clearTimeout(fadeTimer)
  if (oldVal && !newVal) {
    // Start fading
    isFading.value = true
    fadeTimer = setTimeout(() => {
      isFading.value = false
    }, 500)
  } else if (newVal) {
    isFading.value = false
  }
})
</script>
