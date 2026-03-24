<template>
  <!-- media type -->
  <template v-if="type === 'media'">
    <template v-if="data.images?.length">
      <div class="win-body">
        <div class="img-grid">
          <img
            v-for="(u, i) in data.images"
            :key="i"
            :src="typeof u === 'string' ? u : u.url"
            loading="eager"
            referrerpolicy="no-referrer"
            style="object-fit:cover;background:rgba(0,0,0,0.05)"
            @error="handleImageError"
          />
        </div>
        <div v-if="data.caption" class="footer">{{ data.caption }}</div>
      </div>
    </template>
    <template v-else-if="data.url">
      <img
        :src="data.url"
        :data-original-src="data.url"
        loading="eager"
        referrerpolicy="no-referrer"
        style="width:100%;object-fit:cover;border-radius:12px 12px 0 0;margin:0;background:rgba(0,0,0,0.05)"
        @error="handleImageError"
      />
      <div class="win-body">
        <div v-if="data.caption" class="footer">{{ data.caption }}</div>
      </div>
    </template>
  </template>

  <!-- embed type -->
  <template v-else-if="type === 'embed'">
    <template v-if="youtubeId">
      <iframe
        :src="`https://www.youtube.com/embed/${youtubeId}`"
        style="width:100%;aspect-ratio:16/9;border:none;border-radius:12px 12px 0 0;display:block"
        allowfullscreen
      ></iframe>
    </template>
    <template v-else-if="bilibiliId">
      <iframe
        :src="`https://player.bilibili.com/player.html?bvid=${bilibiliId}&page=1`"
        style="width:100%;aspect-ratio:16/9;border:none;border-radius:12px 12px 0 0;display:block"
        allowfullscreen
      ></iframe>
    </template>
    <template v-else-if="isMap">
      <iframe
        :src="`https://maps.google.com/maps?q=${encodeURIComponent(data.query || data.title || '')}&output=embed`"
        style="width:100%;height:200px;border:none;border-radius:12px 12px 0 0;display:block"
      ></iframe>
    </template>
    <template v-else>
      <a
        :href="data.url"
        target="_blank"
        rel="noopener"
        style="display:block;padding:12px;background:rgba(0,0,0,0.04);border-radius:6px;text-decoration:none;color:#4a3a2a"
      >
        <img
          v-if="data.image"
          :src="data.image"
          style="width:100%;border-radius:4px;margin-bottom:8px;object-fit:cover"
          @error="handleImageError"
        />
        <div style="font-weight:600;font-size:14px">{{ data.title || data.url }}</div>
        <div v-if="data.description" style="font-size:12px;color:#8a7a60;margin-top:4px">{{ data.description }}</div>
        <div style="font-size:11px;color:#a09080;margin-top:4px">{{ embedHostname }}</div>
      </a>
    </template>
    <div class="win-body">
      <div v-if="data.caption" class="footer">{{ data.caption }}</div>
    </div>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { handleImageError } from '../../lib/imageProxy.js'

const props = defineProps({
  data: { type: Object, required: true },
  type: { type: String, required: true },
})

const youtubeId = computed(() => {
  const url = props.data.url || ''
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
})

const bilibiliId = computed(() => {
  const url = props.data.url || ''
  if (!url.includes('bilibili.com/video/')) return null
  const m = url.match(/(BV[\w]+)/)
  return m ? m[1] : null
})

const isMap = computed(() => {
  const url = props.data.url || ''
  return url.includes('maps') || props.data.type === 'map'
})

const embedHostname = computed(() => {
  try {
    return new URL(props.data.url || '').hostname
  } catch { return '' }
})
</script>
