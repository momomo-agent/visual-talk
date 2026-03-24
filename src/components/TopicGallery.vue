<template>
  <Transition name="gallery">
    <div v-if="open" class="topic-gallery-overlay" @click.self="$emit('close')">
      <div class="topic-gallery">
        <div class="gallery-header">
          <span class="gallery-title">话题</span>
          <button class="gallery-close" @click="$emit('close')">×</button>
        </div>
        <div class="gallery-grid">
          <div
            v-for="tree in trees"
            :key="tree.id"
            class="topic-card"
            :class="{ active: tree.isActive }"
            @click="selectTree(tree.id)"
          >
            <!-- Mini canvas preview -->
            <div class="topic-preview">
              <div
                v-for="card in tree.preview"
                :key="card.id"
                class="preview-block"
                :style="{
                  left: card.x + '%',
                  top: card.y + '%',
                  width: (card.w || 25) + '%',
                  opacity: Math.max(0.3, card.opacity || 1),
                }"
              >
                <div class="preview-block-inner" :class="'preview-type-' + (card.type || 'card')"></div>
              </div>
            </div>
            <!-- Meta -->
            <div class="topic-meta">
              <span class="topic-name">{{ tree.name || '新对话' }}</span>
              <span class="topic-time">{{ formatTime(tree.updatedAt) }}</span>
            </div>
            <!-- Delete button (not for active) -->
            <button
              v-if="!tree.isActive && trees.length > 1"
              class="topic-delete"
              @click.stop="deleteTree(tree.id)"
              title="删除"
            >×</button>
          </div>
          <!-- New topic card -->
          <div class="topic-card topic-card-new" @click="createNew">
            <div class="topic-preview new-preview">
              <span class="new-icon">+</span>
            </div>
            <div class="topic-meta">
              <span class="topic-name">新话题</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useForestStore } from '../stores/forest.js'
import { useTimelineStore } from '../stores/timeline.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const forest = useForestStore()
const timeline = useTimelineStore()

// Preview data for all trees
const previews = ref({})

// Load previews when gallery opens
watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  // Save current tree before showing gallery
  await forest.saveCurrentTree()

  for (const t of forest.treeList) {
    if (t.isActive) {
      // Active tree: compute from live timeline
      const tip = timeline.activeTip
      if (tip != null) {
        const cards = timeline.computeCanvas(tip)
        if (cards) {
          previews.value[t.id] = Array.from(cards.values()).slice(0, 12).map(c => ({
            id: c.id,
            x: c.x ?? 10,
            y: c.y ?? 10,
            w: c.w,
            opacity: c.opacity,
            type: c.type || c.data?.type || 'card',
          }))
        }
      }
    } else {
      // Non-active: load from IndexedDB
      previews.value[t.id] = await forest.getTreePreview(t.id)
    }
  }
})

const trees = computed(() => {
  return forest.treeList.map(t => ({
    ...t,
    preview: previews.value[t.id] || [],
  }))
})

async function selectTree(id) {
  if (id === forest.activeTreeId) {
    emit('close')
    return
  }
  await forest.switchTree(id)
  emit('close')
}

function createNew() {
  forest.newTree()
  emit('close')
}

async function deleteTree(id) {
  await forest.deleteTree(id)
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style>
/* ── Topic Gallery ── */
.topic-gallery-overlay {
  position: fixed; inset: 0; z-index: 180;
  background: rgba(10,10,8,0.85);
  backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: center;
}

.topic-gallery {
  width: 90%; max-width: 720px; max-height: 80vh;
  display: flex; flex-direction: column;
}

.gallery-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 4px 16px;
}

.gallery-title {
  font-size: 14px; font-weight: 500; letter-spacing: 2px;
  color: var(--text-secondary, rgba(196,168,130,0.5));
  text-transform: uppercase;
}

.gallery-close {
  background: none; border: none; color: var(--text-secondary, rgba(196,168,130,0.3));
  font-size: 20px; cursor: pointer; padding: 4px 8px;
  transition: color 0.2s;
}
.gallery-close:hover { color: var(--text-primary, rgba(196,168,130,0.8)); }

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 4px;
}

/* ── Topic Card ── */
.topic-card {
  position: relative;
  background: var(--card-bg, rgba(28,24,18,0.6));
  border: 1px solid var(--card-border, rgba(196,168,130,0.06));
  border-radius: var(--card-radius, 14px);
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
  overflow: hidden;
}

.topic-card:hover {
  transform: translateY(-2px);
  border-color: var(--card-border-hover, rgba(196,168,130,0.15));
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.topic-card.active {
  border-color: var(--accent, rgba(196,168,130,0.3));
  box-shadow: 0 0 0 1px var(--accent, rgba(196,168,130,0.15));
}

/* ── Preview area ── */
.topic-preview {
  position: relative;
  height: 120px;
  overflow: hidden;
  background: var(--canvas-bg, rgba(10,10,8,0.4));
  border-bottom: 1px solid var(--card-border, rgba(196,168,130,0.04));
}

.preview-block {
  position: absolute;
  pointer-events: none;
}

.preview-block-inner {
  width: 100%; height: 8px;
  border-radius: 2px;
  background: var(--text-secondary, rgba(196,168,130,0.15));
}

/* Different block types get slightly different preview shapes */
.preview-type-media .preview-block-inner,
.preview-type-image .preview-block-inner {
  height: 20px;
  background: var(--text-secondary, rgba(196,168,130,0.1));
  border-radius: 3px;
}

.preview-type-chart .preview-block-inner {
  height: 16px;
  background: var(--accent, rgba(196,168,130,0.12));
}

.preview-type-metric .preview-block-inner {
  height: 12px; width: 60%;
  background: var(--accent, rgba(196,168,130,0.18));
}

/* ── New topic card ── */
.topic-card-new {
  border-style: dashed;
  border-color: var(--card-border, rgba(196,168,130,0.08));
}

.new-preview {
  display: flex; align-items: center; justify-content: center;
}

.new-icon {
  font-size: 28px; color: var(--text-secondary, rgba(196,168,130,0.15));
  transition: color 0.2s;
}

.topic-card-new:hover .new-icon {
  color: var(--text-secondary, rgba(196,168,130,0.4));
}

/* ── Meta ── */
.topic-meta {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 2px;
}

.topic-name {
  font-size: 13px; font-weight: 500;
  color: var(--text-primary, rgba(196,168,130,0.7));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.topic-time {
  font-size: 11px;
  color: var(--text-secondary, rgba(196,168,130,0.3));
}

/* ── Delete ── */
.topic-delete {
  position: absolute; top: 6px; right: 6px;
  background: rgba(0,0,0,0.5); border: none;
  color: rgba(196,168,130,0.4); font-size: 14px;
  width: 22px; height: 22px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.2s, color 0.2s;
}

.topic-card:hover .topic-delete { opacity: 1; }
.topic-delete:hover { color: #e66; background: rgba(200,60,60,0.3); }

/* ── Transitions ── */
.gallery-enter-active { transition: opacity 0.25s ease; }
.gallery-leave-active { transition: opacity 0.2s ease; }
.gallery-enter-from, .gallery-leave-to { opacity: 0; }
.gallery-enter-active .topic-gallery { transition: transform 0.3s cubic-bezier(.22,1,.36,1); }
.gallery-leave-active .topic-gallery { transition: transform 0.2s ease; }
.gallery-enter-from .topic-gallery { transform: scale(0.95) translateY(10px); }
.gallery-leave-to .topic-gallery { transform: scale(0.98); }
</style>
