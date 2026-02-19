import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side AI proxy.
 * Routes AI API calls through the server to keep API keys secret.
 *
 * POST /api/ai
 * Body: { provider, model, messages, maxTokens?, system? }
 */

// Rate limiter (per-IP, 60 req/min)
const rateMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 60
const RATE_WINDOW = 60_000

// Cleanup stale entries every 5 minutes
if (typeof globalThis !== 'undefined') {
  const existing = (globalThis as Record<string, unknown>).__aiRateLimitCleanup
  if (!existing) {
    ;(globalThis as Record<string, unknown>).__aiRateLimitCleanup = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of rateMap) {
        if (now > entry.resetAt) rateMap.delete(key)
      }
    }, 5 * 60_000)
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

interface ContentBlock {
  type: string
  text?: string
  source?: { media_type: string; data: string; type?: string }
  [key: string]: unknown
}

interface AIRequestBody {
  provider: 'openai' | 'anthropic' | 'google'
  model: string
  messages: Array<{ role: string; content: string | ContentBlock[] }>
  maxTokens?: number
  system?: string
  apiKey?: string
}

const AI_REQUEST_TIMEOUT_MS = 90_000

interface OpenAIOutputPart {
  type?: string
  text?: string
  refusal?: string
}

interface OpenAIMessage {
  content?: string | OpenAIOutputPart[] | null
  refusal?: string | null
}

interface OpenAIChoice {
  message?: OpenAIMessage
}

interface OpenAIResponseBody {
  choices?: OpenAIChoice[]
}

function extractOpenAIText(body: OpenAIResponseBody): string {
  const msg = body.choices?.[0]?.message
  if (!msg) return ''

  if (typeof msg.content === 'string') return msg.content

  if (Array.isArray(msg.content)) {
    // Check for refusal parts in content array
    for (const part of msg.content) {
      if (
        part.type === 'refusal' ||
        (typeof part.refusal === 'string' && part.refusal.trim())
      ) {
        return part.refusal || ''
      }
    }
    // Extract text parts
    const joined = msg.content
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim()
    if (joined) return joined
  }

  if (typeof msg.refusal === 'string' && msg.refusal.trim()) {
    return msg.refusal
  }

  return ''
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const externalSignal = init.signal
  const onAbort = () => controller.abort()

  if (externalSignal) {
    if (externalSignal.aborted) {
      onAbort()
    } else {
      externalSignal.addEventListener('abort', onAbort)
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort)
    }
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: AIRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { provider, model, messages, maxTokens = 4000, system, apiKey: userKey } = body

  if (!provider || !model || !messages) {
    return NextResponse.json(
      { error: 'Missing required fields: provider, model, messages' },
      { status: 400 },
    )
  }

  try {
    if (provider === 'openai') {
      const key = userKey || process.env.OPENAI_API_KEY
      if (!key) {
        return NextResponse.json({ error: 'OpenAI APIキーが未設定です' }, { status: 400 })
      }

      const msgs: Array<{ role: string; content: unknown }> = []
      if (system) msgs.push({ role: 'system', content: system })

      for (const m of messages) {
        if (typeof m.content === 'string') {
          msgs.push(m)
        } else {
          const parts = m.content.map((c: ContentBlock) => {
            if (c.type === 'text') return { type: 'text', text: c.text }
            if (c.type === 'image' && c.source) {
              return {
                type: 'image_url',
                image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` },
              }
            }
            if (c.type === 'document') {
              return { type: 'text', text: '[PDF document attached]' }
            }
            return { type: 'text', text: JSON.stringify(c) }
          })
          msgs.push({ role: m.role, content: parts })
        }
      }

      const reqBody: Record<string, unknown> = {
        model,
        messages: msgs,
        max_completion_tokens: maxTokens,
      }
      // GPT-5 family can spend the entire budget on hidden reasoning tokens,
      // yielding empty visible output for small max_completion_tokens.
      if (model.startsWith('gpt-5')) reqBody.reasoning_effort = 'minimal'

      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(reqBody),
      })

      if (!res.ok) {
        const e = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `OpenAI ${res.status}: ${e.slice(0, 200)}` },
          { status: 502 },
        )
      }

      const d = (await res.json()) as OpenAIResponseBody
      const text = extractOpenAIText(d)
      return NextResponse.json({ text })
    }

    if (provider === 'google') {
      const key = userKey || process.env.GOOGLE_AI_API_KEY
      if (!key) {
        return NextResponse.json({ error: 'Gemini APIキーが未設定です' }, { status: 400 })
      }

      const parts: Array<Record<string, unknown>> = []
      if (system) parts.push({ text: system + '\n\n' })

      for (const m of messages) {
        if (typeof m.content === 'string') {
          parts.push({ text: m.content })
        } else {
          for (const c of m.content) {
            if (c.type === 'text') parts.push({ text: c.text })
            else if (c.type === 'image' && c.source) {
              parts.push({ inlineData: { mimeType: c.source.media_type, data: c.source.data } })
            } else if (c.type === 'document' && c.source) {
              parts.push({ inlineData: { mimeType: 'application/pdf', data: c.source.data } })
            }
          }
        }
      }

      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: maxTokens },
          }),
        },
      )

      if (!res.ok) {
        const e = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `Gemini ${res.status}: ${e.slice(0, 200)}` },
          { status: 502 },
        )
      }

      const d = await res.json()
      const text =
        d.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') ||
        ''
      return NextResponse.json({ text })
    }

    if (provider === 'anthropic') {
      const key = userKey || process.env.ANTHROPIC_API_KEY
      if (!key) {
        return NextResponse.json({ error: 'Anthropic APIキーが未設定です' }, { status: 400 })
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      }

      const reqBody: Record<string, unknown> = {
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages,
      }
      if (system) reqBody.system = system

      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      })

      if (!res.ok) {
        const e = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `Claude ${res.status}: ${e.slice(0, 200)}` },
          { status: 502 },
        )
      }

      const d = await res.json()
      const text =
        d.content
          ?.map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : ''))
          .join('') || ''
      return NextResponse.json({ text })
    }

    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        {
          error: `AI APIリクエストがタイムアウトしました (${Math.floor(AI_REQUEST_TIMEOUT_MS / 1000)}s)`,
        },
        { status: 504 },
      )
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
