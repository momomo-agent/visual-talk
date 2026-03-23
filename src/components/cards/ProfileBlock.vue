<template>
  <div class="profile-inner">
    <img
      v-if="data.image"
      :src="data.image"
      :data-original-src="data.image"
      loading="eager"
      referrerpolicy="no-referrer"
      class="profile-img"
      @error="handleImageError"
    />
    <div class="win-body">
      <h2 v-if="data.title">{{ data.title }}</h2>
      <div v-if="data.sub" class="sub">{{ data.sub }}</div>
      <div v-if="data.tags?.length" class="tags">
        <span v-for="(t, i) in data.tags" :key="i" class="tag">{{ t }}</span>
      </div>
      <div v-for="(it, i) in (data.items || [])" :key="i" class="list-item">
        {{ typeof it === 'string' ? it : it.title }}
      </div>
      <div v-if="data.footer" class="footer">{{ data.footer }}</div>
    </div>
  </div>
</template>

<script setup>
import { handleImageError } from '../../lib/imageProxy.js'

defineProps({
  data: { type: Object, required: true },
})
</script>

<style scoped>
.profile-inner {
  display: flex;
  flex-direction: row;
  gap: 0;
}
.profile-img {
  width: 88px;
  min-height: 88px;
  object-fit: cover;
  border-radius: 0;
  flex-shrink: 0;
  background: rgba(0,0,0,0.05);
}
.profile-inner .win-body {
  padding: 10px 14px;
  min-width: 0;
}
.profile-inner .win-body h2 {
  font-size: 14px;
  margin: 0 0 3px;
}
.profile-inner .win-body .sub {
  font-size: 11px;
  opacity: 0.7;
  line-height: 1.4;
}
</style>
