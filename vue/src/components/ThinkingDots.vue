<template>
  <div class="thinking" :class="{ visible: visible }">
    <div class="thinking-dot"></div>
    <div class="thinking-dot"></div>
    <div class="thinking-dot"></div>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
})
</script>
