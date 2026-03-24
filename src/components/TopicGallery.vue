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
            <!-- Real canvas scaled down -->
            <div class="topic-preview-clip">
              <div class="topic-preview-canvas">
                <BlockCard
                  v-for="card in tree.preview"
                  :key="card.id"
                  :card="card"
                  @toggle-select="() => {}"
                  @toggle-dock="() => {}"
                  @update-position="() => {}"
                  @drag-end="() => {}"
                />
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
            <div class="topic-preview-clip new-preview">
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
import { computed, ref, watch, reactive } from 'vue'
import { useForestStore } from '../stores/forest.js'
import { useTimelineStore } from '../stores/timeline.js'
import BlockCard from './BlockCard.vue'

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

  const result = {}
  for (const t of forest.treeList) {
    if (t.isActive) {
      // Active tree: compute from live timeline
      const tip = timeline.activeTip
      if (tip != null) {
        try {
          const cards = timeline.computeCanvas(tip)
          if (cards && cards.size > 0) {
            result[t.id] = Array.from(cards.values()).map(c => reactive({
              ...c,
              opacity: 1,
              scale: 1,
              blur: 0,
              selected: false,
              pointerEvents: 'none',
              entranceDelay: 0,
              _isDocked: false,
            }))
            continue
          }
        } catch (e) { /* fallback below */ }
      }
      // Fallback: extract from timeline operations directly
      result[t.id] = extractPreviewFromTimeline()
    } else {
      // Non-active: load from IndexedDB (lightweight preview)
      const rawCards = await forest.getTreePreview(t.id)
      result[t.id] = rawCards.map(c => reactive({
        id: c.id,
        x: c.x ?? 10,
        y: c.y ?? 10,
        w: c.w || 25,
        z: 0,
        scale: 1,
        opacity: 1,
        blur: 0,
        zIndex: 100,
        selected: false,
        pointerEvents: 'none',
        entranceDelay: 0,
        _isDocked: false,
        type: c.type || 'blocks',
        contentKey: c.id,
        data: c.data || { key: String(c.id), blocks: [{ type: 'text', text: '...' }] },
      }))
    }
  }
  previews.value = result
})

// Fallback: extract card positions from timeline operations
function extractPreviewFromTimeline() {
  const cards = []
  const tip = timeline.activeTip
  if (tip == null) return cards

  // Walk all nodes from the store
  const nodes = timeline.nodes
  if (!nodes) return cards

  // Get path from root to tip
  const path = []
  let cur = tip
  while (cur != null) {
    const n = nodes.get ? nodes.get(cur) : nodes[cur]
    if (!n) break
    path.unshift(n)
    cur = n.parentId
  }

  for (const node of path) {
    if (!node.operations) continue
    for (const op of node.operations) {
      if (op.op === 'create' && op.card) {
        cards.push({
          id: op.card.id,
          x: op.card.x ?? 10,
          y: op.card.y ?? 10,
          w: op.card.w,
          opacity: 1,
          type: op.card.type || op.card.data?.type || 'card',
        })
      }
    }
  }
  return cards.slice(-12)
}

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

/* ── Preview area — real canvas scaled down ── */
.topic-preview-clip {
  position: relative;
  height: 140px;
  overflow: hidden;
  border-bottom: 1px solid var(--card-border, rgba(196,168,130,0.04));
  border-radius: var(--card-radius, 14px) var(--card-radius, 14px) 0 0;
}

.topic-preview-canvas {
  position: absolute;
  width: 1280px;
  height: 800px;
  transform: scale(0.175);
  transform-origin: top left;
  pointer-events: none;
}

/* Override card styles inside preview — no transitions, no hover effects */
.topic-preview-canvas .v-block {
  transition: none !important;
  animation: none !important;
  pointer-events: none !important;
  cursor: default !important;
}

/* Hide card elements that don't make sense at tiny scale */
.topic-preview-canvas .win-bar {
  display: none !important;
}

.preview-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: rgba(196,168,130,0.1); font-size: 12px; letter-spacing: 2px;
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

/* ═══════════════════════════════════════════
   Mercury Theme
   ═══════════════════════════════════════════ */
.theme-mercury .topic-gallery-overlay {
  background: rgba(220,221,224,0.9);
  backdrop-filter: blur(20px);
}

.theme-mercury .gallery-title {
  color: rgba(0,0,0,0.35);
}

.theme-mercury .gallery-close {
  color: rgba(0,0,0,0.25);
}
.theme-mercury .gallery-close:hover { color: rgba(0,0,0,0.6); }

.theme-mercury .topic-card {
  background: #fff;
  border: none;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06);
}

.theme-mercury .topic-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.1);
  border-color: transparent;
}

.theme-mercury .topic-card.active {
  box-shadow: 0 0 0 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06);
  border-color: transparent;
}

.theme-mercury .topic-preview-clip {
  background: #f4f4f5;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.theme-mercury .preview-empty { color: rgba(0,0,0,0.08); }

.theme-mercury .topic-name { color: #333; }
.theme-mercury .topic-time { color: #999; }

.theme-mercury .topic-card-new {
  border: 1px dashed rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.6);
  box-shadow: none;
}

.theme-mercury .new-icon { color: rgba(0,0,0,0.12); }
.theme-mercury .topic-card-new:hover .new-icon { color: rgba(0,0,0,0.3); }

.theme-mercury .topic-delete {
  background: rgba(0,0,0,0.06);
  color: rgba(0,0,0,0.3);
}
.theme-mercury .topic-delete:hover { color: #e44; background: rgba(200,60,60,0.1); }

/* ═══════════════════════════════════════════
   Dot Theme
   ═══════════════════════════════════════════ */
.theme-dot .topic-gallery-overlay {
  background: rgba(240,230,220,0.9);
  backdrop-filter: blur(20px);
}

.theme-dot .gallery-title {
  color: rgba(100,80,60,0.4);
}

.theme-dot .gallery-close {
  color: rgba(100,80,60,0.25);
}
.theme-dot .gallery-close:hover { color: rgba(100,80,60,0.6); }

.theme-dot .topic-card {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.5);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.theme-dot .topic-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  border-color: rgba(255,255,255,0.7);
}

.theme-dot .topic-card.active {
  border-color: rgba(180,140,100,0.25);
  box-shadow: 0 0 0 1px rgba(180,140,100,0.15), 0 2px 8px rgba(0,0,0,0.04);
}

.theme-dot .topic-preview-clip {
  background: rgba(240,230,220,0.3);
  border-bottom: 1px solid rgba(180,140,100,0.06);
}

.theme-dot .preview-empty { color: rgba(180,140,100,0.12); }

.theme-dot .topic-name { color: #5a4a3a; }
.theme-dot .topic-time { color: #a09080; }

.theme-dot .topic-card-new {
  border: 1px dashed rgba(180,140,100,0.12);
  background: rgba(255,255,255,0.4);
}

.theme-dot .new-icon { color: rgba(180,140,100,0.15); }
.theme-dot .topic-card-new:hover .new-icon { color: rgba(180,140,100,0.4); }

.theme-dot .topic-delete {
  background: rgba(0,0,0,0.05);
  color: rgba(100,80,60,0.3);
}
.theme-dot .topic-delete:hover { color: #c44; background: rgba(200,60,60,0.1); }
</style>
