// ═══ 履歴書テキスト → 印刷用 HTML 変換 ═══
// マスキング済みテキスト（Markdown 風 / AI 整形出力）を A4 印刷向けの HTML に組み立てる。
// プレビュー・PDF 出力・一括出力（zip）で共用する。

import { PH_RE } from '@/lib/redact-engine'

export interface CleanContentOptions {
  /** 値がプレースホルダーだけの行（例: 「氏名：[氏名非公開]」）を除去する。既定 true */
  removeRedactionOnlyLines?: boolean
}

export interface MdToHTMLOptions extends CleanContentOptions {
  /** プレースホルダーを本文から取り除く。既定 true */
  stripRedactions?: boolean
  /** stripRedactions=false のとき、プレースホルダーを <span class="rd"> で強調する。既定 false */
  highlightRedactions?: boolean
}

export type FontType = 'gothic' | 'mincho'

const BR_SP = "<br class='sp'>"

// --- Shared utilities ---
export const escHTML = (t: string | null | undefined): string =>
  (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const isPIIValue = (v: string): boolean => /^\s*(\[[^\]]*非公開[^\]]*\]\s*)+$/.test(v)

export function cleanContent(text: string, opts?: CleanContentOptions): string {
  const removeRedactionOnlyLines = opts?.removeRedactionOnlyLines !== false
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      // Remove page markers (internal use only)
      if (/^-{2,}\s*Page\s+\d+\s*-{2,}$/.test(trimmed)) return false
      if (/^-{2,}\s*Sheet:\s*.+\s*-{2,}$/.test(trimmed)) return false
      if (removeRedactionOnlyLines) {
        const kv = trimmed.match(/^(.+?)[：:]\s*(.+)$/)
        if (kv && isPIIValue(kv[2])) return false
        if (isPIIValue(trimmed)) return false
      }
      return true
    })
    .join('\n')
}

// --- Markdown → HTML ---
export function mdToHTML(text: string, opts?: MdToHTMLOptions): string {
  const stripRedactions = opts?.stripRedactions !== false
  const highlightRedactions = !!opts?.highlightRedactions
  const cleaned = cleanContent(text, { removeRedactionOnlyLines: opts?.removeRedactionOnlyLines })
  const lines = cleaned.split('\n')
  const out: string[] = []
  let prevBlank = false
  const redRe = new RegExp(PH_RE.source, 'g')
  for (const line of lines) {
    let t = line
    if (stripRedactions) {
      t = t.replace(redRe, '')
    }
    const trimmed = t.trim()
    if (!trimmed) {
      // Collapse consecutive blanks to max 1
      if (!prevBlank) out.push(BR_SP)
      prevBlank = true
      continue
    }
    prevBlank = false
    // Heuristic headings (for non-markdown AI output)
    const numHead =
      trimmed.match(/^(?:\(|（)\s*\d+\s*(?:\)|）)\s*(.+)$/) ||
      trimmed.match(/^\(\s*\d+\s*\)\s*(.+)$/)
    if (numHead) {
      out.push(`<h2>${escHTML(numHead[1])}</h2>`)
      continue
    }
    const bracketHead = trimmed.match(/^【(.+?)】$/)
    if (bracketHead) {
      out.push(`<h2>${escHTML(bracketHead[1])}</h2>`)
      continue
    }
    const symbolHead = trimmed.match(/^[■●◆◇▶▷☆★]+\s*(.+)$/)
    if (symbolHead) {
      out.push(`<h2>${escHTML(symbolHead[1])}</h2>`)
      continue
    }
    if (
      /^(?:職務経歴書|履歴書|基本情報|職務要約|職務経歴|学歴|資格|スキル|自己PR|志望動機|プロフィール|連絡先|Contact)\s*$/i.test(
        trimmed,
      )
    ) {
      out.push(`<h2>${escHTML(trimmed)}</h2>`)
      continue
    }
    // Horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      out.push(`<hr class="hr">`)
      continue
    }
    // Company/project-ish line: treat as subheading
    // Guard: do NOT upgrade list items or key-value lines into headings
    const isListLike = /^[-*]\s+/.test(trimmed) || /^・\s*/.test(trimmed)
    const isKvLike = /^(.{1,30}?)[：:]\s*(.+)$/.test(trimmed)
    if (
      !isListLike &&
      !isKvLike &&
      !/[：:]/.test(trimmed) &&
      /.+（\d{4}.*?）/.test(trimmed) &&
      trimmed.length <= 48
    ) {
      out.push(`<h3>${escHTML(trimmed)}</h3>`)
      continue
    }
    // Headers (no extra <br> needed — CSS margin handles spacing)
    const h4 = trimmed.match(/^###\s+(.+)$/)
    if (h4) {
      out.push(`<h4>${escHTML(h4[1])}</h4>`)
      continue
    }
    const h3 = trimmed.match(/^##\s+(.+)$/)
    if (h3) {
      out.push(`<h3>${escHTML(h3[1])}</h3>`)
      continue
    }
    const h2 = trimmed.match(/^#\s+(.+)$/)
    if (h2) {
      out.push(`<h2>${escHTML(h2[1])}</h2>`)
      continue
    }
    // List items
    const li = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^・\s*(.+)$/)
    if (li) {
      let html = escHTML(li[1])
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      if (!stripRedactions && highlightRedactions)
        html = html.replace(redRe, '<span class="rd">$&</span>')
      out.push(`<div class="li">・${html}</div>`)
      continue
    }
    // Key: Value lines (resume fields)
    const kv = trimmed.match(/^(.{1,30}?)[：:]\s*(.+)$/)
    if (kv) {
      const k = escHTML(kv[1]).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      let v = escHTML(kv[2]).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      if (stripRedactions) v = v.replace(redRe, '')
      if (!stripRedactions && highlightRedactions)
        v = v.replace(redRe, '<span class="rd">$&</span>')
      out.push(
        `<div class="kv"><div class="k">${k}</div><div class="v">${v || '&nbsp;'}</div></div>`,
      )
      continue
    }
    // Bold **text**
    let html = escHTML(t)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    if (!stripRedactions && highlightRedactions)
      html = html.replace(redRe, '<span class="rd">$&</span>')
    out.push(`<div>${html}</div>`)
  }
  // Remove leading/trailing <br>
  while (out.length > 0 && out[0] === BR_SP) out.shift()
  while (out.length > 0 && out[out.length - 1] === BR_SP) out.pop()
  // Remove <br> right before/after headers (headers have CSS margin)
  const filtered = out.filter((l, i) => {
    if (l !== BR_SP) return true
    const next = out[i + 1] || ''
    const prev = out[i - 1] || ''
    if (/^<h[234]/.test(next) || /<\/h[234]>$/.test(prev)) return false
    return true
  })
  return filtered.join('\n')
}

// --- PDF Document Generator ---
export const FONT_IMPORTS: Readonly<Record<FontType, string>> = {
  gothic: `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap');`,
  mincho: `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&display=swap');`,
}
export const FONT_FAMILIES: Readonly<Record<FontType, string>> = {
  gothic: "'Noto Sans JP',sans-serif",
  mincho: "'Noto Serif JP',serif",
}

// 呼び出し側は任意文字列（state 値）を渡すため、未知のキーは gothic にフォールバックさせる
const lookupFont = (table: Readonly<Record<string, string>>, key: string): string | undefined =>
  table[key]

export function generatePDFHTML(text: string, fontType: string, mdOpts?: MdToHTMLOptions): string {
  const fontCSS = lookupFont(FONT_IMPORTS, fontType) || FONT_IMPORTS.gothic
  const fontFamily = lookupFont(FONT_FAMILIES, fontType) || FONT_FAMILIES.gothic
  const body = mdToHTML(text, mdOpts)
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>Resume</title>
<style>
${fontCSS}
@page{size:A4;margin:18mm 20mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${fontFamily};color:#111827;background:#fff;font-size:10.2pt;line-height:1.75}
.page{max-width:660px;margin:0 auto;padding:26px 30px}
h2{font-size:14pt;font-weight:700;color:#0f172a;margin:18px 0 8px;padding-bottom:7px;border-bottom:1px solid #d1d5db;letter-spacing:.2px}
h3{font-size:11.5pt;font-weight:700;color:#111827;margin:14px 0 6px}
h4{font-size:10.6pt;font-weight:700;color:#1f2937;margin:12px 0 4px}
strong{font-weight:700}
.body{font-size:10pt;word-break:break-word}
.body div{line-height:1.75}
.body br.sp{display:block;content:"";margin-top:8px}
.kv{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:2.5px 0}
.k{color:#475569;font-weight:700}
.v{color:#0f172a}
.li{padding-left:1em;text-indent:-1em;line-height:1.75;margin:1px 0}
.rd{background:#fee;color:#c33;padding:0 4px;border-radius:3px;font-weight:700}
.hr{border:0;border-top:1px solid #e5e7eb;margin:12px 0}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="page"><div class="body">${body}</div></div></body></html>`
}
