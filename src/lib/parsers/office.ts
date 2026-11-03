// ═══ Word/ODT のパーサー（mammoth で本文抽出し、失敗時は ZIP の生バイトから XML タグを剥がす簡易抽出に落とす） ═══

import * as mammoth from 'mammoth'
import { readBuf } from './encoding'
import type { ParsedFile } from './types'

export async function parseDOCX(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: ab })
    const text = result.value || ''
    if (text.trim().length < 5) throw new Error('テキストが抽出できませんでした')
    // Clean up: normalize whitespace, preserve paragraph breaks
    const cleaned = text
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l, i, a) => {
        // Collapse 3+ blank lines into 2
        if (!l.trim() && i > 0 && !a[i - 1].trim() && i > 1 && !a[i - 2].trim()) return false
        return true
      })
      .join('\n')
    // Count approximate "pages" by character count (A4 ≈ 1500 chars)
    const approxPages = Math.max(1, Math.ceil(cleaned.length / 1500))
    return { text: cleaned, pageCount: approxPages, format: 'Word (DOCX)' }
  } catch (e) {
    // Fallback: try as ZIP and extract document.xml text content
    try {
      const bytes = new Uint8Array(ab)
      const decoder = new TextDecoder('utf-8')
      const raw = decoder.decode(bytes)
      const textContent = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (textContent.length > 20)
        return { text: textContent, pageCount: null, format: 'Word (basic)' }
    } catch {
      // 簡易抽出も失敗したら下の DOCX 解析エラーとして報告する
    }
    // mammoth も自前の throw も Error を投げるので message を読む（元実装どおりプロパティ参照のみ）
    throw new Error(
      'DOCX解析エラー: ' + (e as Error).message + '\nファイルが破損している可能性があります',
    )
  }
}

export async function parseODT(f: Blob): Promise<ParsedFile> {
  // ODT is a ZIP file. Try mammoth first (partial ODT support), then fallback to raw XML extraction
  const ab = await readBuf(f)
  try {
    const r = await mammoth.extractRawText({ arrayBuffer: ab })
    if (r.value && r.value.trim().length > 10) {
      return {
        text: r.value
          .split('\n')
          .map((l) => l.trimEnd())
          .join('\n'),
        pageCount: null,
        format: 'ODT',
      }
    }
  } catch {
    // mammoth が ODT を読めないのは想定内。下の簡易抽出へ進む
  }
  // Fallback: try to find content.xml in the ZIP manually (basic ZIP parsing)
  try {
    const bytes = new Uint8Array(ab)
    // Find PK signature and locate content.xml
    const decoder = new TextDecoder('utf-8')
    const raw = decoder.decode(bytes)
    // Extract text between XML tags (very basic)
    const textContent = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim()
    // Filter out binary garbage - keep only printable text runs
    const lines = textContent
      .split(/\s+/)
      .filter((w) => /^[\u0020-\u007E\u00A0-\uFFFF]{2,}$/.test(w))
    if (lines.length > 5) return { text: lines.join(' '), pageCount: null, format: 'ODT (basic)' }
    throw new Error('テキスト抽出失敗')
  } catch {
    // 内部エラーの詳細ではなく、ユーザーが取れる対処（DOCX 保存）を伝える
    throw new Error('ODTの解析に失敗しました。Word(.docx)形式での保存を推奨します。')
  }
}
