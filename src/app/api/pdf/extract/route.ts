import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

/**
 * サーバーサイド PDF テキスト抽出 API
 *
 * pdf.js でテキスト抽出が不十分な PDF（CIDフォント ToUnicode欠落等）に対して
 * poppler の pdftotext をフォールバックとして使う。
 *
 * POST /api/pdf/extract
 * Body: { pdfBase64: string }
 * Response: { text: string, pageCount: number }
 */

// レート制限（IP毎 30回/日）
const rateMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 30
const RATE_WINDOW = 24 * 60 * 60_000

if (typeof globalThis !== 'undefined') {
  const existing = (globalThis as Record<string, unknown>).__pdfRateLimitCleanup
  if (!existing) {
    ;(globalThis as Record<string, unknown>).__pdfRateLimitCleanup = setInterval(() => {
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

const MAX_PDF_SIZE = 20 * 1024 * 1024 // 20MB
const PDFTOTEXT_TIMEOUT = 30_000 // 30秒

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: { pdfBase64?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { pdfBase64 } = body
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return NextResponse.json({ error: 'Missing pdfBase64' }, { status: 400 })
  }

  // サイズチェック（Base64は元の約1.33倍）
  const estimatedSize = pdfBase64.length * 0.75
  if (estimatedSize > MAX_PDF_SIZE) {
    return NextResponse.json(
      { error: `PDF too large (${(estimatedSize / 1024 / 1024).toFixed(1)}MB > 20MB)` },
      { status: 413 },
    )
  }

  const tmpId = randomBytes(8).toString('hex')
  const tmpPath = join(tmpdir(), `rp_pdf_${tmpId}.pdf`)

  try {
    // Base64 → 一時ファイル
    const buffer = Buffer.from(pdfBase64, 'base64')
    await writeFile(tmpPath, buffer)

    // pdftotext -layout で抽出
    const rawText = await new Promise<string>((resolve, reject) => {
      const proc = execFile(
        'pdftotext',
        ['-layout', tmpPath, '-'],
        { timeout: PDFTOTEXT_TIMEOUT, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message))
          } else {
            resolve(stdout)
          }
        },
      )
      // タイムアウト時にプロセスを確実に終了
      proc.on('error', reject)
    })

    // フォームフィード(\f)をページ区切りに変換
    const pages = rawText.split('\f')
    const formatted = pages
      .filter((p) => p.trim().length > 0)
      .map((page, i) => `--- Page ${i + 1} ---\n${page.trim()}`)
      .join('\n\n')

    return NextResponse.json({
      text: formatted,
      pageCount: pages.filter((p) => p.trim().length > 0).length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    // pdftotext が見つからない場合は 501
    if (message.includes('ENOENT') || message.includes('not found')) {
      return NextResponse.json(
        { error: 'pdftotext is not available on this server' },
        { status: 501 },
      )
    }
    return NextResponse.json({ error: `pdftotext failed: ${message}` }, { status: 500 })
  } finally {
    // 一時ファイルのクリーンアップ
    try {
      await unlink(tmpPath)
    } catch {
      // ignore cleanup errors
    }
  }
}
