'use client'

import styles from './SampleCard.module.css'

export interface SampleItem {
  /** handleDemo に渡す種別キー（pdf / xlsx / csv / text） */
  type: string
  label: string
  desc: string
  /** カテゴリ色（ドット表示のみ） */
  color: string
}

export interface SampleCardProps {
  items: SampleItem[]
  onPick: (type: string) => void
  /** intro.js ツアー用の data-intro 値 */
  introId?: string
  /** モック一式のダウンロードリンク（Pro） */
  zipHref?: string
}

/**
 * 「サンプルで試す」カード。
 * 手元にファイルがない初見ユーザーが、1クリックで検出〜書き出しの流れを体験できる入口。
 */
export function SampleCard({ items, onPick, introId, zipHref }: SampleCardProps) {
  return (
    <section className={styles.card} data-intro={introId} aria-label="サンプルで試す">
      <div className={styles.head}>
        <span className={styles.title}>サンプルで試す</span>
        <span className={styles.lead}>
          手元にファイルがなくても、検出から書き出しまでの流れを体験できます
        </span>
      </div>
      <div className={styles.grid} data-cols={items.length > 1 ? 2 : 1}>
        {items.map((item) => (
          <button
            key={item.type}
            type="button"
            className={styles.item}
            onClick={() => onPick(item.type)}
          >
            <span className={styles.dot} style={{ background: item.color }} aria-hidden="true" />
            <span className={styles.itemBody}>
              <span className={styles.itemLabel}>{item.label}</span>
              <span className={styles.itemDesc}>{item.desc}</span>
            </span>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
      {zipHref && (
        <a
          href={zipHref}
          download
          className={styles.zip}
          title="モック履歴書一式をダウンロード（ZIP）"
          aria-label="モック履歴書一式をダウンロード（ZIP）"
        >
          <span className={styles.zipLabel}>モック履歴書一式をダウンロード（ZIP）</span>
          <span className={styles.zipDesc}>18種 / TXT・CSV・XLSX・HTML・MD・JSON・RTF・DOCX</span>
        </a>
      )}
    </section>
  )
}
