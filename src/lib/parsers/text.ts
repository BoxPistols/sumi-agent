// ═══ テキスト系ファイルのパーサー（TXT/TSV/Markdown/HTML/RTF/JSON。すべて文字コード判定してから読む） ═══

import { extractTextFromHTML } from '@/lib/url-import'
import { decodeText, readBuf } from './encoding'
import type { ParsedFile } from './types'

export async function parseTXT(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  const { text, encoding } = decodeText(ab)
  return { text, pageCount: null, format: `Text (${encoding})` }
}

export async function parseMD(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  const { text, encoding } = decodeText(ab)
  return { text, pageCount: null, format: `Markdown (${encoding})` }
}

export async function parseHTML(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  const { text } = decodeText(ab)
  const extracted = extractTextFromHTML(text)
  return { text: extracted, pageCount: null, format: 'HTML' }
}

export async function parseRTF(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  const { text } = decodeText(ab)
  // Basic RTF text extraction: strip control words, extract text
  let result = text
  // Remove RTF header/font tables etc inside { } groups (greedy for nested)
  result = result.replace(/\{\\fonttbl[^}]*(\{[^}]*\})*[^}]*\}/g, '')
  result = result.replace(/\{\\colortbl[^}]*\}/g, '')
  result = result.replace(/\{\\stylesheet[^}]*(\{[^}]*\})*[^}]*\}/g, '')
  result = result.replace(/\{\\info[^}]*(\{[^}]*\})*[^}]*\}/g, '')
  // Handle common RTF control words
  result = result.replace(/\\par[d]?\s?/g, '\n')
  result = result.replace(/\\line\s?/g, '\n')
  result = result.replace(/\\tab\s?/g, '\t')
  result = result.replace(/\\\n/g, '\n')
  // Handle Unicode characters: \'XX (hex) and \uNNNN
  result = result.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  )
  result = result.replace(/\\u(\d+)\s?\??/g, (_m, n: string) => String.fromCharCode(parseInt(n)))
  // Strip remaining control words and braces
  result = result.replace(/\\[a-z]+[-]?\d*\s?/g, '')
  result = result.replace(/[{}]/g, '')
  result = result.replace(/\n{3,}/g, '\n\n').trim()
  return { text: result, pageCount: null, format: 'RTF' }
}

// Recursively extract string values for PII scanning
function extractJsonValues(o: unknown, path = ''): string {
  if (typeof o === 'string') return `${path}: ${o}`
  if (Array.isArray(o)) {
    return o
      .map((v, i) => extractJsonValues(v, `${path}[${i}]`))
      .filter(Boolean)
      .join('\n')
  }
  if (o && typeof o === 'object') {
    return Object.entries(o)
      .map(([k, v]) => extractJsonValues(v, path ? `${path}.${k}` : k))
      .filter(Boolean)
      .join('\n')
  }
  if (o !== null && o !== undefined) return `${path}: ${String(o)}`
  return ''
}

export async function parseJSON(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  const { text } = decodeText(ab)
  try {
    const obj: unknown = JSON.parse(text)
    return { text: extractJsonValues(obj), pageCount: null, format: 'JSON' }
  } catch {
    // 壊れた JSON でも PII を検出できるよう、生テキストのまま返す
    return { text, pageCount: null, format: 'JSON (raw)' }
  }
}
