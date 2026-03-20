<template>
  <img
    v-if="data.image"
    :src="data.image"
    :data-original-src="data.image"
    loading="eager"
    referrerpolicy="no-referrer"
    style="width:100%;object-fit:cover;border-radius:0;margin:0;background:rgba(0,0,0,0.05)"
    @error="handleImageError"
  />
  <div class="win-body">
    <h2 v-if="data.title">{{ data.title }}</h2>
    <div v-if="data.sub" class="sub">{{ data.sub }}</div>
    <div v-if="data.tags?.length" class="tags">
      <span v-for="(t, i) in data.tags" :key="i" class="tag">{{ t }}</span>
    </div>
    <div v-if="data.progress != null" class="progress-track">
      <div class="progress-bar" :style="{ width: data.progress + '%' }"></div>
    </div>
    <div v-for="(it, i) in (data.items || [])" :key="i" class="list-item">
      {{ typeof it === 'string' ? it : it.title }}
    </div>
    <div v-if="data.footer" class="footer">{{ data.footer }}</div>
  </div>
</template>

<script setup>
import { handleImageError } from '../../lib/imageProxy.js'

defineProps({
  data: { type: Object, required: true },
})
</script>
