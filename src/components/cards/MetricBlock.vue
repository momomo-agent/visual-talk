<template>
  <div class="win-body">
    <div class="big-num">
      {{ data.value }}<span v-if="data.unit" style="font-size:18px;color:#8a7a60">{{ data.unit }}</span>
    </div>
    <div class="big-label">{{ data.label || '' }}</div>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, required: true },
})
</script>
