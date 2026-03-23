/**
 * Image Generation Skill — OpenAI-compatible images/generations API
 * 
 * Provides: generate_image
 * Uses separate imageBaseUrl/imageApiKey/imageModel config
 */

async function generateImage(args, config) {
  const apiKey = config?.imageApiKey
  const baseUrl = (config?.imageBaseUrl || '').replace(/\/+$/, '')
  
  if (!apiKey || !baseUrl) return { error: 'Image API key/base URL not configured' }

  const payload = {
    model: config?.imageModel || args.model || 'dall-e-3',
    prompt: args.prompt,
    n: 1,
    size: args.size || '1024x1024',
    response_format: 'url',
  }

  try {
    const res = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json()
    const image = data.data?.[0]

    return {
      url: image?.url,
      revised_prompt: image?.revised_prompt,
    }
  } catch (e) {
    return { error: `Image generation failed: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'generate_image',
    description: 'Generate an image from a text description using DALL-E. Returns an image URL that can be used in cards (image block). Use for illustrations, diagrams, artistic visuals, or any time a visual would enhance the response.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate. Be specific about style, composition, colors, and mood.' },
        size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions (default: 1024x1024)' },
      },
      required: ['prompt'],
    },
    execute: async (input, config) => generateImage(input, config),
    requiresConfig: (cfg) => !!(cfg?.imageApiKey && cfg?.imageBaseUrl),
  },
]

export default { name: 'image-gen', tools }
