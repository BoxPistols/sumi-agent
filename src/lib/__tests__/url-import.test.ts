import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchURL, isSPADomain, scrapeURL, CORS_PROXIES } from '../url-import'

const HTML = '<html><body>' + 'x'.repeat(200) + '</body></html>'

function ok(body: string, contentType = 'text/html') {
  return new Response(body, { status: 200, headers: { 'content-type': contentType } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isSPADomain', () => {
  it('SPA のドメインとそのサブドメインを判定する', () => {
    expect(isSPADomain('https://www.canva.com/design/abc')).toBe(true)
    expect(isSPADomain('https://foo.notion.so/page')).toBe(true)
    expect(isSPADomain('https://www.wantedly.com/id/someone')).toBe(false)
    expect(isSPADomain('not a url')).toBe(false)
  })
})

describe('fetchURL', () => {
  it('ブラウザではまず自前の /api/scrape を使い、成功すれば第三者へは送らない', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://sumi.example' } })
    const fetchMock = vi.fn().mockResolvedValue(ok(HTML))
    vi.stubGlobal('fetch', fetchMock)

    const html = await fetchURL('example.com/profile')

    expect(html).toBe(HTML)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://sumi.example/api/scrape?url=' + encodeURIComponent('https://example.com/profile'),
    )
  })

  it('直接取得できなければ公開 CORS プロキシへ並列に問い合わせ、成功したものを使う', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchMock = vi.fn(async (input: string) => {
      if (input === 'https://example.com/') throw new Error('CORS')
      if (input.startsWith('https://api.codetabs.com/')) return ok(HTML)
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const progress = vi.fn()

    const html = await fetchURL('https://example.com/', progress)

    expect(html).toBe(HTML)
    // 直接取得 1 回 + プロキシ全件
    expect(fetchMock).toHaveBeenCalledTimes(1 + CORS_PROXIES.length)
    expect(progress).toHaveBeenLastCalledWith('CodeTabs経由で取得成功')
  })

  it('どの経路でも取れなければ、貼り付けでの代替手段を案内するエラーを投げる', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await expect(fetchURL('https://example.com/')).rejects.toThrow('テキスト/HTML貼付')
  })

  it('自前プロキシが設定されていれば {url} を置き換えてそれを先に使う', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(HTML))
    vi.stubGlobal('fetch', fetchMock)
    await fetchURL('https://example.com/', undefined, 'https://proxy.example/?u={url}')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://proxy.example/?u=' + encodeURIComponent('https://example.com/'),
    )
  })
})

describe('scrapeURL', () => {
  it('SPA のサイトは取得を試みずに代替手段を案内する', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(scrapeURL('https://www.figma.com/file/x')).rejects.toThrow('figma.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('取得した HTML からテキストを取り出し、ドメイン名でファイル名を付ける', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(HTML)))
    const r = await scrapeURL(
      'https://www.example.com/me',
      undefined,
      undefined,
      () => '山田 太郎 のプロフィール本文です。経歴とスキルの説明が続きます。',
    )
    expect(r).toEqual({
      text: '山田 太郎 のプロフィール本文です。経歴とスキルの説明が続きます。',
      format: 'Web (example.com)',
      fileName: 'example.com_scraped.html',
      pageCount: null,
    })
  })
})
