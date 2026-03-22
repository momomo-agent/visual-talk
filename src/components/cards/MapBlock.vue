<template>
  <div class="map-block">
    <h2 v-if="data.title">{{ data.title }}</h2>
    <div ref="mapEl" class="map-container"></div>
    <div v-if="data.footer" class="footer">{{ data.footer }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, shallowRef } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const mapEl = ref(null)
let map = null
let maplibregl = null

// Lazy-load maplibre-gl
async function loadMapLibre() {
  if (maplibregl) return maplibregl
  // Dynamic CSS import
  await import('maplibre-gl/dist/maplibre-gl.css')
  maplibregl = await import('maplibre-gl')
  return maplibregl
}

// Dark tile style — CartoDB dark_matter (free, no key)
const DARK_STYLE = {
  version: 8,
  name: 'Dark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
}

const COLORS = {
  gold: '#e8a849',
  pink: '#ef8f6e',
  mint: '#7ec8a4',
  blue: '#8bacd4',
}

async function initMap() {
  if (!mapEl.value) return
  if (map) { map.remove(); map = null }

  const ml = await loadMapLibre()

  const d = props.data
  const center = d.center || [116.4074, 39.9042] // Default: Beijing
  const zoom = d.zoom || 11

  map = new ml.Map({
    container: mapEl.value,
    style: DARK_STYLE,
    center: [center[1], center[0]], // data: [lat, lng] → MapLibre: [lng, lat]
    zoom,
    attributionControl: false,
    interactive: true,
  })

  map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

  // Add markers and fitBounds immediately, don't wait for tile load
  // (tile load may fail due to GFW/network issues, blocking load event)
  addMarkers(d.markers, ml)
  addRoute(d.route, d.routeColor)

  // Auto fit bounds to markers + route
  const pts = []
  if (d.markers?.length) {
    for (const m of d.markers) pts.push([m.lng, m.lat])
  }
  if (d.route?.length) {
    for (const p of d.route) pts.push([p[1], p[0]]) // [lat,lng] → [lng,lat]
  }
  if (pts.length >= 2) {
    const lngs = pts.map(p => p[0])
    const lats = pts.map(p => p[1])
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 50, maxZoom: 14, duration: 0 }
    )
  }
}

function addMarkers(markers, ml) {
  if (!markers?.length || !map || !ml) return

  for (const m of markers) {
    const color = m.color || COLORS.gold

    const el = document.createElement('div')
    el.className = 'map-marker'
    el.innerHTML = `
      <svg width="24" height="32" viewBox="0 0 24 32">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>
        <circle cx="12" cy="11" r="4" fill="rgba(0,0,0,0.3)"/>
      </svg>
    `

    const marker = new ml.Marker({ element: el })
      .setLngLat([m.lng, m.lat])
      .addTo(map)

    if (m.label) {
      const popup = new ml.Popup({
        offset: [0, -32],
        closeButton: false,
        closeOnClick: false,
        className: 'map-popup-dark',
      }).setHTML(`<span>${m.label}</span>`)

      marker.setPopup(popup)
      popup.addTo(map) // Show by default
    }
  }
}

function addRoute(route, color) {
  if (!route?.length || route.length < 2 || !map) return

  const routeColor = color || COLORS.blue

  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.map(p => [p[1], p[0]]), // [lat,lng] → [lng,lat]
      },
    },
  })

  // Route outline (wider, darker)
  map.addLayer({
    id: 'route-outline',
    type: 'line',
    source: 'route',
    paint: {
      'line-color': 'rgba(0,0,0,0.4)',
      'line-width': 6,
    },
  })

  // Route line
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    paint: {
      'line-color': routeColor,
      'line-width': 3,
      'line-dasharray': [2, 1],
    },
  })
}

onMounted(() => {
  nextTick(initMap)
})

onUnmounted(() => {
  if (map) { map.remove(); map = null }
})

// Re-init if data changes
watch(() => props.data, () => {
  nextTick(initMap)
}, { deep: true })
</script>

<style scoped>
.map-block {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.map-block h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: #e0e0e0;
}

.map-container {
  flex: 1;
  min-height: 200px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.06);
}

.map-block .footer {
  font-size: 11px;
  color: #888;
  margin-top: 6px;
}

/* MapLibre overrides for dark theme */
:deep(.maplibregl-ctrl-group) {
  background: rgba(30, 30, 30, 0.8) !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
}
:deep(.maplibregl-ctrl-group button) {
  filter: invert(1);
}

:deep(.map-popup-dark .maplibregl-popup-content) {
  background: rgba(20, 20, 20, 0.9);
  color: #e0e0e0;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
:deep(.map-popup-dark .maplibregl-popup-tip) {
  border-top-color: rgba(20, 20, 20, 0.9);
}

.map-marker {
  cursor: pointer;
  transition: transform 0.2s;
}
.map-marker:hover {
  transform: scale(1.2);
}
</style>
