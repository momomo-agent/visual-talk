<template>
  <!-- Hero layout (default): large image on top, text below -->
  <template v-if="!data.layout || data.layout === 'hero'">
    <img
      v-if="data.image"
      :src="data.image"
      :data-original-src="data.image"
      loading="eager"
      referrerpolicy="no-referrer"
      class="card-img card-img--hero"
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

  <!-- Compact layout: small image left, text right (also fallback for minimal) -->
  <template v-else-if="data.layout === 'compact' || data.layout === 'minimal'">
    <div class="card-compact">
      <img
        v-if="data.image"
        :src="data.image"
        :data-original-src="data.image"
        loading="eager"
        referrerpolicy="no-referrer"
        class="card-img card-img--compact"
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

  <!-- Minimal layout: tiny thumbnail + title inline -->
  <template v-else-if="data.layout === 'minimal'">
    <div class="card-minimal">
      <img
        v-if="data.image"
        :src="data.image"
        :data-original-src="data.image"
        loading="eager"
        referrerpolicy="no-referrer"
        class="card-img card-img--minimal"
        @error="handleImageError"
      />
      <div class="win-body">
        <h2 v-if="data.title">{{ data.title }}</h2>
        <div v-if="data.sub" class="sub">{{ data.sub }}</div>
        <div v-if="data.footer" class="footer">{{ data.footer }}</div>
      </div>
    </div>
  </template>
</template>

<script setup>
import { handleImageError } from '../../lib/imageProxy.js'

defineProps({
  data: { type: Object, required: true },
})
</script>

<style scoped>
.card-img--hero {
  width: 100%;
  object-fit: cover;
  border-radius: 0;
  margin: 0;
  background: rgba(0,0,0,0.05);
}

.card-compact {
  display: flex;
  gap: 12px;
  padding: 8px;
}
.card-img--compact {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: rgba(0,0,0,0.05);
}
.card-compact .win-body {
  padding: 0;
  min-width: 0;
}
.card-compact .win-body h2 {
  font-size: 13px;
  margin: 0 0 2px;
}
.card-compact .win-body .sub {
  font-size: 11px;
}

.card-minimal {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
}
.card-img--minimal {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  background: rgba(0,0,0,0.05);
}
.card-minimal .win-body {
  padding: 0;
  min-width: 0;
}
.card-minimal .win-body h2 {
  font-size: 12px;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-minimal .win-body .sub {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
