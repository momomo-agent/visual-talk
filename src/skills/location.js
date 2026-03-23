/**
 * Location Skill — Browser Geolocation API
 * 
 * Provides: get_location
 * Uses navigator.geolocation (requires user permission)
 */

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ error: 'Geolocation not supported by this browser' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        })
      },
      (err) => {
        const reasons = {
          1: 'User denied location access',
          2: 'Position unavailable',
          3: 'Request timed out',
        }
        resolve({ error: reasons[err.code] || `Geolocation error: ${err.message}` })
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  })
}

export const tools = [
  {
    name: 'get_location',
    description: 'Get the user\'s current geographic location (latitude/longitude) via browser GPS. Requires user permission. Use before get_weather to automatically detect the user\'s city.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => getLocation(),
  },
]

export default { name: 'location', tools }
