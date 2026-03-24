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
            class="topic-item"
            :class="{ active: tree.isActive }"
            @click="selectTree(tree.id)"
          >
            <!-- Canvas preview — dark translucent board -->
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
            <!-- Meta — outside the board -->
            <div class="topic-meta">
              <span class="topic-name">{{ tree.name || '新对话' }}</span>
              <span class="topic-time">{{ formatTime(tree.updatedAt) }}</span>
            </div>
            <!-- Delete button -->
            <button
              v-if="!tree.isActive && trees.length > 1"
              class="topic-delete"
              @click.stop="deleteTree(tree.id)"
              title="删除"
            >×</button>
          </div>
          <!-- New topic -->
          <div class="topic-item topic-item-new" @click="createNew">
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


/* ── Topic Item — no card wrapper ── */
.topic-item {
  position: relative;
  cursor: pointer;
}

.topic-item:hover .topic-preview-clip {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(0,0,0,0.12);
}

.topic-item.active .topic-preview-clip {
  box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
}

/* ── Preview board — dark translucent canvas ── */
.topic-preview-clip {
  position: relative;
  height: 140px;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(0,0,0,0.06);
  transition: transform 0.2s, box-shadow 0.2s;
}

.topic-preview-canvas {
  position: absolute;
  width: 1000px;
  height: 600px;
  transform: scale(0.22);
  transform-origin: top left;
  pointer-events: none;
}

/* Override card styles inside preview */
.topic-preview-canvas .v-block {
  transition: none !important;
  animation: none !important;
  pointer-events: none !important;
  cursor: default !important;
  min-width: 0 !important;
  max-width: none !important;
  font-size: 10px !important;
}

.topic-preview-canvas .win-bar {
  display: none !important;
}

.topic-preview-canvas .win-body {
  padding: 6px !important;
}

.topic-preview-canvas .blocks-renderer {
  gap: 3px !important;
  padding: 6px !important;
}

/* ── New topic ── */
.topic-item-new .topic-preview-clip {
  border: 1px dashed rgba(0,0,0,0.08);
  background: rgba(0,0,0,0.02);
}

.new-preview {
  display: flex; align-items: center; justify-content: center;
}

.new-icon {
  font-size: 28px; color: rgba(0,0,0,0.1);
  transition: color 0.2s;
}

.topic-item-new:hover .new-icon {
  color: rgba(0,0,0,0.25);
}

/* ── Meta — outside the board ── */
.topic-meta {
  padding: 8px 2px 4px;
  display: flex; flex-direction: column; gap: 1px;
}

.topic-name {
  font-size: 13px; font-weight: 500;
  color: rgba(0,0,0,0.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.topic-time {
  font-size: 11px;
  color: rgba(0,0,0,0.3);
}

/* ── Delete ── */
.topic-delete {
  position: absolute; top: 6px; right: 6px;
  background: rgba(0,0,0,0.3); border: none;
  color: rgba(255,255,255,0.7); font-size: 14px;
  width: 22px; height: 22px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.2s, color 0.2s;
  z-index: 2;
}

.topic-item:hover .topic-delete { opacity: 1; }
.topic-delete:hover { color: #fff; background: rgba(200,60,60,0.6); }

.preview-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: rgba(0,0,0,0.06); font-size: 12px; letter-spacing: 2px;
}

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

.theme-mercury .gallery-title { color: rgba(0,0,0,0.35); }
.theme-mercury .gallery-close { color: rgba(0,0,0,0.25); }
.theme-mercury .gallery-close:hover { color: rgba(0,0,0,0.6); }

.theme-mercury .topic-preview-clip { background: rgba(0,0,0,0.04); }
.theme-mercury .topic-item.active .topic-preview-clip { box-shadow: 0 0 0 2px rgba(0,0,0,0.08); }
.theme-mercury .topic-item-new .topic-preview-clip { border-color: rgba(0,0,0,0.06); background: rgba(0,0,0,0.02); }
.theme-mercury .new-icon { color: rgba(0,0,0,0.08); }
.theme-mercury .topic-item-new:hover .new-icon { color: rgba(0,0,0,0.2); }
.theme-mercury .topic-name { color: #333; }
.theme-mercury .topic-time { color: #999; }
.theme-mercury .preview-empty { color: rgba(0,0,0,0.06); }

/* ═══════════════════════════════════════════
   Dot Theme
   ═══════════════════════════════════════════ */
.theme-dot .topic-gallery-overlay {
  background: rgba(240,230,220,0.9);
  backdrop-filter: blur(20px);
}

.theme-dot .gallery-title { color: rgba(100,80,60,0.4); }
.theme-dot .gallery-close { color: rgba(100,80,60,0.25); }
.theme-dot .gallery-close:hover { color: rgba(100,80,60,0.6); }

.theme-dot .topic-preview-clip { background: rgba(0,0,0,0.04); }
.theme-dot .topic-item.active .topic-preview-clip { box-shadow: 0 0 0 2px rgba(180,140,100,0.2); }
.theme-dot .topic-item-new .topic-preview-clip { border-color: rgba(180,140,100,0.1); }
.theme-dot .new-icon { color: rgba(180,140,100,0.12); }
.theme-dot .topic-item-new:hover .new-icon { color: rgba(180,140,100,0.3); }
.theme-dot .topic-name { color: #5a4a3a; }
.theme-dot .topic-time { color: #a09080; }
.theme-dot .preview-empty { color: rgba(180,140,100,0.08); }

/* ═══════════════════════════════════════════
   Basic (dark) Theme
   ═══════════════════════════════════════════ */
body:not(.theme-mercury):not(.theme-dot) .topic-gallery-overlay {
  background: rgba(10,10,8,0.85);
  backdrop-filter: blur(12px);
}
body:not(.theme-mercury):not(.theme-dot) .gallery-title { color: rgba(196,168,130,0.5); }
body:not(.theme-mercury):not(.theme-dot) .gallery-close { color: rgba(196,168,130,0.3); }
body:not(.theme-mercury):not(.theme-dot) .gallery-close:hover { color: rgba(196,168,130,0.8); }
body:not(.theme-mercury):not(.theme-dot) .topic-preview-clip { background: rgba(255,255,255,0.04); }
body:not(.theme-mercury):not(.theme-dot) .topic-item.active .topic-preview-clip { box-shadow: 0 0 0 2px rgba(196,168,130,0.2); }
body:not(.theme-mercury):not(.theme-dot) .topic-item-new .topic-preview-clip { border-color: rgba(196,168,130,0.08); }
body:not(.theme-mercury):not(.theme-dot) .new-icon { color: rgba(196,168,130,0.12); }
body:not(.theme-mercury):not(.theme-dot) .topic-name { color: rgba(196,168,130,0.7); }
body:not(.theme-mercury):not(.theme-dot) .topic-time { color: rgba(196,168,130,0.3); }
body:not(.theme-mercury):not(.theme-dot) .preview-empty { color: rgba(196,168,130,0.08); }
</style>
