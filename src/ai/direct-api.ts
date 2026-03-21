import type { AIConnector, ProofreadResult, ProviderConfig, AIProvider } from '../types/ai'
import { PROVIDER_ENDPOINTS, DEFAULT_PROOFREAD_PROMPT } from '../types/ai'

/**
 * Direct API コネクタ — ブラウザから各AI APIへ直接リクエストを送信
 */
export function createDirectApiConnector(
  config: ProviderConfig,
  customPrompt?: string,
): AIConnector {
  const prompt = customPrompt || DEFAULT_PROOFREAD_PROMPT

  return {
    async proofread(ocrText: string, imageBase64: string): Promise<ProofreadResult> {
      const correctedText = await callProvider(config, prompt, ocrText, imageBase64)
      return { correctedText, changes: [] }
    },

    async testConnection(): Promise<boolean> {
      try {
        await callProvider(config, 'Reply with OK.', 'test', '')
        return true
      } catch {
        return false
      }
    },
  }
}

async function callProvider(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, systemPrompt, userText, imageBase64)
    case 'openai':
    case 'groq':
      return callOpenAICompatible(config, systemPrompt, userText, imageBase64)
    case 'google':
      return callGoogle(config, systemPrompt, userText, imageBase64)
    case 'custom':
      return callOpenAICompatible(config, systemPrompt, userText, imageBase64)
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

function getEndpoint(config: ProviderConfig): string {
  if (config.provider === 'custom' && config.endpoint) return config.endpoint
  return PROVIDER_ENDPOINTS[config.provider]
}

/** data:image/...;base64,XXXX → { mediaType, data } */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
  if (match) return { mediaType: match[1], data: match[2] }
  return { mediaType: 'image/png', data: dataUrl }
}

// ─── Anthropic Messages API ───

async function callAnthropic(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const content: Array<Record<string, unknown>> = []

  if (imageBase64) {
    const { mediaType, data } = parseDataUrl(imageBase64)
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    })
  }

  content.push({ type: 'text', text: userText })

  const res = await fetch(getEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }

  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}

// ─── OpenAI-compatible API (OpenAI, Groq, Custom) ───

async function callOpenAICompatible(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const userContent: Array<Record<string, unknown>> = []

  if (imageBase64 && supportsVision(config.provider)) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`,
      },
    })
  }

  userContent.push({ type: 'text', text: userText })

  const res = await fetch(getEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${config.provider} API error ${res.status}: ${err}`)
  }

  const json = await res.json()
  return json.choices?.[0]?.message?.content ?? ''
}

function supportsVision(provider: AIProvider): boolean {
  // Groqは現時点でvision非対応のモデルが多い
  return provider !== 'groq'
}

// ─── Google Gemini API ───

async function callGoogle(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const parts: Array<Record<string, unknown>> = []

  if (imageBase64) {
    const { mediaType, data } = parseDataUrl(imageBase64)
    parts.push({
      inline_data: { mime_type: mediaType, data },
    })
  }

  parts.push({ text: userText })

  const endpoint = `${PROVIDER_ENDPOINTS.google}/${config.model}:generateContent?key=${config.apiKey}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google API error ${res.status}: ${err}`)
  }

  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}
