<template>
  <div class="map-block">
    <div ref="mapEl" class="map-container"></div>
    <div v-if="data.title || data.footer" class="win-body map-info">
      <h2 v-if="data.title">{{ data.title }}</h2>
      <div v-if="data.footer" class="footer">{{ data.footer }}</div>
    </div>
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

// Warm light tile style — CartoDB Voyager (warm tones, matches our card aesthetic)
// Proxied through proxy.link2web.site to bypass GFW
const TILE_STYLE = {
  version: 8,
  name: 'Voyager',
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://proxy.link2web.site?url=https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://proxy.link2web.site?url=https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://proxy.link2web.site?url=https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'carto-voyager-layer',
      type: 'raster',
      source: 'carto-voyager',
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
    style: TILE_STYLE,
    center: [center[1], center[0]], // data: [lat, lng] → MapLibre: [lng, lat]
    zoom,
    attributionControl: false,
    interactive: true,
  })

  map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

  // Add markers immediately (DOM elements, don't need style)
  addMarkers(d.markers, ml)

  // Route needs style to be loaded (addSource/addLayer require it)
  // Retry approach: try immediately, then retry with delays
  if (d.route?.length >= 2) {
    const tryRoute = (attempt = 0) => {
      if (!map) return
      try {
        if (map.getSource('route')) return // already added
        addRoute(d.route, d.routeColor)
      } catch (e) {
        if (attempt < 5) setTimeout(() => tryRoute(attempt + 1), 500 * (attempt + 1))
      }
    }
    if (map.isStyleLoaded()) {
      tryRoute()
    } else {
      map.on('style.load', () => tryRoute())
      // Fallback: try after 2s even if style.load didn't fire
      setTimeout(() => tryRoute(), 2000)
    }
  }

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

  // Try OSRM for real road routing, fallback to straight line
  // Proxy through proxy.link2web.site to bypass GFW
  const coords = route.map(p => `${p[1]},${p[0]}`).join(';') // [lat,lng] → lng,lat
  const rawUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  const osrmUrl = `https://proxy.link2web.site?url=${encodeURIComponent(rawUrl)}`

  fetch(osrmUrl)
    .then(r => r.json())
    .then(data => {
      if (data.code === 'Ok' && data.routes?.[0]?.geometry) {
        drawRouteLine(data.routes[0].geometry, routeColor)
      } else {
        drawRouteLine(straightLine(route), routeColor)
      }
    })
    .catch(() => {
      drawRouteLine(straightLine(route), routeColor)
    })
}

function straightLine(route) {
  return {
    type: 'LineString',
    coordinates: route.map(p => [p[1], p[0]]),
  }
}

function drawRouteLine(geometry, color) {
  if (!map) return

  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry,
    },
  })

  // Route outline (wider, darker)
  map.addLayer({
    id: 'route-outline',
    type: 'line',
    source: 'route',
    paint: {
      'line-color': 'rgba(0,0,0,0.2)',
      'line-width': 5,
    },
  })

  // Route line
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    paint: {
      'line-color': color,
      'line-width': 3,
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

.map-container {
  flex: 1;
  min-height: 200px;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f0e8;
}

.map-info {
  padding: 8px 12px 6px;
}

.map-info h2 {
  font-size: 13px;
  font-weight: 500;
  margin: 0;
}

.map-info .footer {
  font-size: 10px;
  margin-top: 2px;
}

/* MapLibre overrides for warm theme */
:deep(.maplibregl-ctrl-group) {
  background: rgba(245, 240, 232, 0.9) !important;
  border: 1px solid rgba(138, 122, 96, 0.2) !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1) !important;
}
:deep(.maplibregl-ctrl-group button) {
  color: #6a5a4a;
}

:deep(.map-popup-dark .maplibregl-popup-content) {
  background: rgba(245, 240, 232, 0.95);
  color: #4a3f35;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(138, 122, 96, 0.2);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
:deep(.map-popup-dark .maplibregl-popup-tip) {
  border-top-color: rgba(245, 240, 232, 0.95);
}

.map-marker {
  cursor: pointer;
  transition: transform 0.2s;
}
.map-marker:hover {
  transform: scale(1.2);
}
</style>
