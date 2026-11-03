import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side URL scraping proxy.
 * Eliminates CORS issues since the request is made server-side.
 *
 * GET /api/scrape?url=https://example.com
 *
 * Security:
 * - Only allows http/https protocols
 * - Blocks private/internal IP ranges (SSRF prevention)
 * - Rate-limited per IP with automatic cleanup
 * - Same-origin CORS only
 */

// ═══ Rate Limiter with auto-cleanup ═══
const rateMap = new Map<string, { count: number; resetAt: number }>()

// Cleanup stale entries every 5 minutes to prevent memory leak
if (typeof globalThis !== 'undefined') {
  const existing = (globalThis as Record<string, unknown>).__scrapeRateLimitCleanup
  if (!existing) {
    ;(globalThis as Record<string, unknown>).__scrapeRateLimitCleanup = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of rateMap) {
        if (now > entry.resetAt) rateMap.delete(key)
      }
    }, 5 * 60_000)
  }
}

function checkRateLimit(ip: string): boolean {
  const limit = parseInt(process.env.SCRAPE_RATE_LIMIT || '30')
  const now = Date.now()
  const entry = rateMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

// ═══ SSRF Prevention ═══
function isPrivateOrReservedHost(hostname: string): boolean {
  // Block localhost variants
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return true
  }

  // Block IP addresses in private/reserved ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    // 10.0.0.0/8
    if (a === 10) return true
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true
    // 169.254.0.0/16 (link-local / AWS metadata)
    if (a === 169 && b === 254) return true
    // 0.0.0.0/8
    if (a === 0) return true
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true
    // 198.18.0.0/15 (benchmark)
    if (a === 198 && (b === 18 || b === 19)) return true
  }

  // Block cloud metadata endpoints
  if (hostname === 'metadata.google.internal') return true
  if (hostname === 'metadata.google.com') return true

  return false
}

function validateTargetURL(raw: string): { valid: boolean; error?: string; parsed?: URL } {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Protocol not allowed: ${parsed.protocol}` }
  }

  // Block private/reserved hosts
  if (isPrivateOrReservedHost(parsed.hostname)) {
    return { valid: false, error: 'Access to internal/private addresses is not allowed' }
  }

  // Block URLs with credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with credentials are not allowed' }
  }

  return { valid: true, parsed }
}

// ═══ CORS Helper ═══
function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  // In development, allow localhost origins (strict hostname check)
  let isLocalhost = false
  try {
    const url = new URL(origin)
    isLocalhost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
  } catch {
    isLocalhost = false
  }
  const allowedOrigin = isLocalhost ? origin : ''

  return {
    'Access-Control-Allow-Origin': allowedOrigin || 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
}

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request)

  if (process.env.SCRAPE_ENABLED === 'false') {
    return NextResponse.json({ error: 'Scraping disabled' }, { status: 403, headers: corsHeaders })
  }

  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json(
      { error: 'Missing ?url= parameter' },
      { status: 400, headers: corsHeaders },
    )
  }

  // SSRF validation
  const validation = validateTargetURL(url)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400, headers: corsHeaders })
  }

  // Rate limit
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: corsHeaders },
    )
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)

    // After redirect, validate the final URL too (prevent SSRF via redirects)
    if (res.url && res.url !== url) {
      const redirectValidation = validateTargetURL(res.url)
      if (!redirectValidation.valid) {
        return NextResponse.json(
          { error: `Redirect blocked: ${redirectValidation.error}` },
          { status: 403, headers: corsHeaders },
        )
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502, headers: corsHeaders },
      )
    }

    // Only allow text content types
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/') && !contentType.includes('application/xhtml')) {
      return NextResponse.json(
        { error: 'Response is not HTML/text content' },
        { status: 400, headers: corsHeaders },
      )
    }

    const html = await res.text()

    // Limit response size (5MB max)
    if (html.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Response too large (>5MB)' },
        { status: 413, headers: corsHeaders },
      )
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'text/html; charset=utf-8',
        ...corsHeaders,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: msg.includes('abort') ? 'Timeout (15s)' : msg },
      { status: msg.includes('abort') ? 504 : 500, headers: corsHeaders },
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}
