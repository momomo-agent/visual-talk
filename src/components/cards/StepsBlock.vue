<template>
  <div class="win-body">
    <h3 v-if="data.title">{{ data.title }}</h3>
    <div v-for="(ev, i) in (data.items || [])" :key="i" class="tl-item">
      <div v-if="ev.time" class="tl-time">{{ ev.time }}</div>
      <div class="tl-title">{{ ev.title || '' }}</div>
      <div v-if="ev.detail" class="tl-detail">{{ ev.detail }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, required: true },
})
</script>
