/**
 * URL から経歴書ページを取り込む（Pro の「URLから取り込む」と HTML 貼り付け）
 *
 * 取得は次の順に試す。後ろほど第三者を経由するので、画面と README でその旨を明示している。
 *   0. 自前のサーバー中継 /api/scrape（SSRF 対策済み）
 *   1. 利用者が設定した自前プロキシ
 *   2. ブラウザから直接（CORS を許可しているサイトのみ成功）
 *   3. 公開 CORS プロキシ（第三者のサービス。並列に投げて最初の成功を使う）
 */
import { SPA_DOMAINS } from '@/lib/constants'

export type ProgressFn = (message: string) => void

// ═══ HTML Text Extraction (shared by parseHTML + URL scraping) ═══
const BLOCK_TAGS = new Set([
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'tr',
  'br',
  'hr',
  'section',
  'article',
  'header',
  'footer',
  'blockquote',
  'pre',
  'table',
  'thead',
  'tbody',
  'main',
  'aside',
  'figcaption',
  'dt',
  'dd',
])

function walk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  let t = ''
  for (const c of Array.from(el.childNodes)) t += walk(c)
  if (tag === 'br') return '\n'
  if (tag === 'hr') return '\n---\n'
  if (tag === 'li') return '・' + t.trim() + '\n'
  if (tag === 'tr') return t.trim() + '\n'
  if (tag === 'td' || tag === 'th') return t.trim() + ' | '
  if (tag === 'a') {
    const href = el.getAttribute('href')
    return href && href.startsWith('http') ? `${t.trim()} (${href}) ` : `${t} `
  }
  if (BLOCK_TAGS.has(tag)) return '\n' + t.trim() + '\n'
  return t
}

/** HTML から本文テキストを取り出す。タイトル・og:title・description を先頭に添える */
export function extractTextFromHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const noise = doc.querySelectorAll('script,style,noscript,svg,path,nav,iframe,link,meta')
  noise.forEach((el) => el.remove())
  const body = doc.body
  if (!body) return ''
  const title = doc.querySelector('title')?.textContent?.trim() || ''
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
  let prefix = ''
  if (title) prefix += title + '\n'
  if (ogTitle && ogTitle !== title) prefix += ogTitle + '\n'
  if (metaDesc) prefix += metaDesc + '\n'
  if (prefix) prefix += '\n---\n\n'
  const bodyText = walk(body)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return prefix + bodyText
}

// ═══ URL Scraping ═══
// 2025年実態調査結果:
// corsproxy.io → HTML無効化(フィッシング対策)。JSON/XML/CSVのみ。使用不可
// allorigins.win → 動作するが50%の確率でCORSヘッダー欠落(GitHub issue #135)
// cors.lol → 2025-05-25にサービス終了
// corsfix.com → 動作。無料(開発用60req/min)。本番は有料
// everyorigin → 動作。無料。レート制限なし。Netlifyホスト
// codetabs → 不安定
export const CORS_PROXIES: Array<{ name: string; build: (url: string) => string }> = [
  {
    name: 'allOrigins',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'everyOrigin',
    build: (url) => `https://everyorigin.jwvbremen.nl/api/get?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'CodeTabs',
    build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  },
  { name: 'Corsfix', build: (url) => `https://proxy.corsfix.com/?${encodeURIComponent(url)}` },
]

const FETCH_FAILED_MESSAGE =
  'URLの取得に失敗しました。CORSポリシーによりブロックされた可能性があります。\n\n代替手段：\n・ブラウザでページを開き Ctrl+A → Ctrl+C でコピー\n・「テキスト/HTML貼付」タブに貼り付けてください\n・Ctrl+U でHTMLソースをコピーするとより高精度です'

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function fetchURL(
  rawUrl: string,
  onProgress?: ProgressFn,
  customProxy?: string,
): Promise<string> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl
  onProgress?.('URL取得中...')

  // 0. Auto-detect Next.js environment: use /api/scrape if available
  if (!customProxy && typeof window !== 'undefined' && window.location?.origin) {
    const localProxy = window.location.origin + '/api/scrape?url={url}'
    try {
      onProgress?.('サーバー経由で取得中...')
      const proxyUrl = localProxy.replace('{url}', encodeURIComponent(url))
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const html = await res.text()
        if (html.length > 100 && !html.startsWith('{"error')) {
          onProgress?.('サーバー経由で取得成功')
          return html
        }
      }
    } catch (e) {
      console.log('Local /api/scrape not available:', errorMessage(e))
    }
  }

  // 1. Custom proxy (self-hosted, most reliable)
  if (customProxy) {
    onProgress?.('自前プロキシ経由で取得中...')
    try {
      const proxyUrl = customProxy.replace('{url}', encodeURIComponent(url))
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const html = await res.text()
        if (html.length > 100) {
          onProgress?.('自前プロキシ経由で取得成功')
          return html
        }
      }
    } catch (e) {
      console.log('Custom proxy failed:', errorMessage(e))
    }
  }

  // 2. Direct fetch (works for CORS-enabled sites)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('text/html') || ct.includes('text/plain') || !ct) {
        const html = await res.text()
        if (html.length > 100) {
          onProgress?.('直接取得成功')
          return html
        }
      }
    }
  } catch (e) {
    console.log('Direct fetch failed:', errorMessage(e))
  }

  // 3. CORS proxies (try all in parallel for speed, use first success)
  onProgress?.(`CORSプロキシ経由で取得中 (${CORS_PROXIES.length}件並列)...`)
  const results = await Promise.allSettled(
    CORS_PROXIES.map(async (proxy) => {
      const res = await fetch(proxy.build(url), { signal: AbortSignal.timeout(12000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      // Validate: must be real HTML, not error JSON
      if (html.length < 100 || html.startsWith('{"error')) throw new Error('Invalid response')
      return { html, proxy: proxy.name }
    }),
  )
  const success = results.find(
    (r): r is PromiseFulfilledResult<{ html: string; proxy: string }> => r.status === 'fulfilled',
  )
  if (success) {
    onProgress?.(`${success.value.proxy}経由で取得成功`)
    return success.value.html
  }

  throw new Error(FETCH_FAILED_MESSAGE)
}

/** JavaScript で描画する SPA は HTML を取っても本文が空なので、取得前に断る */
export function isSPADomain(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    return SPA_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}

export interface ScrapeResult {
  text: string
  format: string
  fileName: string
  pageCount: null
}

export async function scrapeURL(
  url: string,
  onProgress?: ProgressFn,
  customProxy?: string,
  extractText: (html: string) => string = extractTextFromHTML,
): Promise<ScrapeResult> {
  if (isSPADomain(url)) {
    const domain = new URL(url).hostname.replace(/^www\./, '')
    throw new Error(
      `${domain} はJavaScript描画のSPAサイトのため、URLスクレイピングではテキストを取得できません。\n\n代替手段：\n1. サイト上で「PDFダウンロード」→「ファイル」タブからアップロード\n2. テキストをコピー →「テキスト/HTML貼付」タブに貼り付け\n3. ブラウザで Ctrl+P → PDF保存 → アップロード`,
    )
  }
  const html = await fetchURL(url, onProgress, customProxy)
  onProgress?.('テキスト抽出中...')

  const text = extractText(html)
  if (!text || text.length < 20)
    throw new Error(
      'ページからテキストを抽出できませんでした。JavaScript描画のSPAサイトの場合、HTMLコピー＆ペーストをお試しください。',
    )

  let domain = ''
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // ホスト名が取れなくてもファイル名の既定値で続ける
  }

  return {
    text,
    format: `Web (${domain})`,
    fileName: domain ? `${domain}_scraped.html` : 'web_scraped.html',
    pageCount: null,
  }
}
