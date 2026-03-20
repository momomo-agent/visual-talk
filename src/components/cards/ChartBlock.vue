<template>
  <div class="win-body">
    <h3 v-if="data.title">{{ data.title }}</h3>
    <ChartRenderer :data="data" />
  </div>
</template>

<script setup>
import ChartRenderer from '../ChartRenderer.vue'

defineProps({
  data: { type: Object, required: true },
})
</script>
