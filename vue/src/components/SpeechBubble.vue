<template>
  <div class="bubble" :class="{ visible: visible }">{{ text }}</div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
  visible: { type: Boolean, default: false },
})
</script>
