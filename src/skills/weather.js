/**
 * Weather Skill — Open-Meteo API (free, no key needed)
 * 
 * Provides: get_weather
 * Uses geocoding API for city name → coordinates
 */

const WMO_CODES = {
  0: '晴', 1: '大部晴', 2: '多云', 3: '阴', 45: '雾', 48: '霜雾',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '小阵雨', 81: '阵雨', 82: '大阵雨',
  85: '小阵雪', 86: '大阵雪',
  95: '雷暴', 96: '雷暴+小冰雹', 99: '雷暴+大冰雹',
}

async function getWeather(args) {
  let lat = args.latitude
  let lon = args.longitude
  const city = args.city

  // Geocode city name if no coordinates
  if (!lat || !lon) {
    if (!city) return { error: 'Provide city name or latitude/longitude' }
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`)
      const geoData = await geoRes.json()
      if (!geoData.results?.length) return { error: `City not found: ${city}` }
      lat = geoData.results[0].latitude
      lon = geoData.results[0].longitude
    } catch (e) {
      return { error: `Geocoding failed: ${e.message}` }
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=auto&forecast_days=3`
    const res = await fetch(url)
    const data = await res.json()
    const c = data.current
    const d = data.daily

    return {
      location: city || `${lat},${lon}`,
      current: {
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        weather: WMO_CODES[c.weathercode] || `code ${c.weathercode}`,
        windSpeed: c.windspeed_10m,
        humidity: c.relative_humidity_2m,
      },
      forecast: d.time.map((date, i) => ({
        date,
        high: d.temperature_2m_max[i],
        low: d.temperature_2m_min[i],
        weather: WMO_CODES[d.weathercode[i]] || `code ${d.weathercode[i]}`,
        rainChance: d.precipitation_probability_max[i],
      })),
    }
  } catch (e) {
    return { error: `Weather fetch failed: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'get_weather',
    description: 'Get current weather and 3-day forecast for a location. Use city name or coordinates.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. "北京", "Tokyo", "New York")' },
        latitude: { type: 'number', description: 'Latitude (use with longitude)' },
        longitude: { type: 'number', description: 'Longitude (use with latitude)' },
      },
    },
    execute: async (input) => getWeather(input),
  },
]

export default { name: 'weather', tools }
