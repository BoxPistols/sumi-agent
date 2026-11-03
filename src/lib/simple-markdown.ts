// ═══ アドバイザーチャット用の簡易 Markdown → HTML 変換 ═══
// 見出し・太字・箇条書き・番号付きリスト・改行だけを扱う。入力は先に HTML エスケープする。

export function simpleMarkdown(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:13px;font-weight:700">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:14px;font-weight:700">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<div style="padding-left:12px;text-indent:-12px">・$1</div>')
    .replace(/^\d+\. (.+)$/gm, (_, c: string) => `<div style="padding-left:16px">${c}</div>`)
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}
