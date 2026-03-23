<template>
  <div class="card-inner" :class="{ 'card-compact': compact }">
    <img
      v-if="data.image"
      :src="data.image"
      :data-original-src="data.image"
      loading="eager"
      referrerpolicy="no-referrer"
      class="card-img"
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
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { handleImageError } from '../../lib/imageProxy.js'

const props = defineProps({
  data: { type: Object, required: true },
  w: { type: Number, default: 25 },
})

// Auto layout: narrow cards with images → compact (image left, text right)
const compact = computed(() => props.data.image && props.w <= 22)
</script>

<style scoped>
.card-inner {
  display: flex;
  flex-direction: column;
}

.card-inner .card-img {
  width: 100%;
  object-fit: cover;
  border-radius: 0;
  margin: 0;
  background: rgba(0,0,0,0.05);
}

/* Compact: image left, text right */
.card-compact {
  flex-direction: row;
}
.card-compact .card-img {
  width: 80px;
  min-height: 80px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  margin: 10px;
}
.card-compact .win-body {
  padding-top: 8px;
  padding-right: 12px;
}
.card-compact .win-body h2 {
  font-size: 13px;
  margin: 0 0 3px;
}
.card-compact .win-body .sub {
  font-size: 11px;
}
</style>
