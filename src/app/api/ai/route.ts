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
      { status: 400 }
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

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, messages: msgs, max_completion_tokens: maxTokens }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const e = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `OpenAI ${res.status}: ${e.slice(0, 200)}` },
          { status: 502 }
        )
      }

      const d = await res.json()
      return NextResponse.json({ text: d.choices?.[0]?.message?.content || '' })
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

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: maxTokens },
          }),
          signal: controller.signal,
        }
      )

      clearTimeout(timeout)

      if (!res.ok) {
        const e = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `Gemini ${res.status}: ${e.slice(0, 200)}` },
          { status: 502 }
        )
      }

      const d = await res.json()
      const text =
        d.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || '')
          .join('') || ''
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

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const e = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `Claude ${res.status}: ${e.slice(0, 200)}` },
          { status: 502 }
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
      return NextResponse.json({ error: 'AI APIリクエストがタイムアウトしました (30s)' }, { status: 504 })
    }
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
