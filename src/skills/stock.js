/**
 * Stock Skill — Yahoo Finance via public query API
 * 
 * Provides: get_stock
 * No API key needed — uses Yahoo Finance public endpoints
 */

async function getStock(args) {
  const symbol = (args.symbol || '').toUpperCase().trim()
  if (!symbol) return { error: 'Stock symbol required (e.g. AAPL, 0700.HK, 600519.SS)' }

  try {
    // Yahoo Finance v8 quote endpoint (public, no auth)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`
    
    let data
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Yahoo ${res.status}`)
      data = await res.json()
    } catch (e) {
      // GFW fallback through fetch proxy
      try {
        const proxyUrl = `https://fetch.link2web.site?url=${encodeURIComponent(url)}&mode=raw`
        const proxyRes = await fetch(proxyUrl)
        if (!proxyRes.ok) throw new Error(`Proxy ${proxyRes.status}`)
        const text = await proxyRes.text()
        data = JSON.parse(text)
      } catch (e2) {
        throw new Error(`Direct: ${e.message}, Proxy: ${e2.message}`)
      }
    }

    const result = data?.chart?.result?.[0]
    if (!result) return { error: `No data found for ${symbol}` }

    const meta = result.meta
    const quotes = result.indicators?.quote?.[0] || {}
    const timestamps = result.timestamp || []
    
    // Current price info
    const current = {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || symbol,
      currency: meta.currency,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose || meta.previousClose,
      change: null,
      changePercent: null,
      marketState: meta.exchangeName,
    }
    
    if (current.price && current.previousClose) {
      current.change = +(current.price - current.previousClose).toFixed(2)
      current.changePercent = +((current.change / current.previousClose) * 100).toFixed(2)
    }

    // Recent daily data
    const history = timestamps.slice(-5).map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open: quotes.open?.[i]?.toFixed(2),
      high: quotes.high?.[i]?.toFixed(2),
      low: quotes.low?.[i]?.toFixed(2),
      close: quotes.close?.[i]?.toFixed(2),
      volume: quotes.volume?.[i],
    }))

    return { ...current, history }
  } catch (e) {
    return { error: `Stock query failed: ${e.message}`, symbol }
  }
}

export const tools = [
  {
    name: 'get_stock',
    description: 'Get stock price and recent history. Use standard ticker symbols: US stocks (AAPL, TSLA, MSFT), HK stocks (0700.HK, 9988.HK), China A-shares (600519.SS for Shanghai, 000858.SZ for Shenzhen). Returns current price, change, and 5-day history.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL, 0700.HK, 600519.SS)' },
      },
      required: ['symbol'],
    },
    execute: async (input) => getStock(input),
  },
]

export default { name: 'stock', tools }
