'use client'

/**
 * 右下のサポートチャット（FAQ 選択式）
 *
 * 質問を選ぶと定型の回答を会話として追加する。外部への送信はしない。
 * パネルは左上の角をドラッグしてリサイズできる。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import s from '@/app/redact-pro.module.css'
import { T } from '@/lib/theme'

export interface ChatFaqItem {
  q: string
  a: string
}

export interface ChatFaqCategory {
  category: string
  questions: ChatFaqItem[]
}

export const CHAT_FAQ: ChatFaqCategory[] = [
  {
    category: '基本操作',
    questions: [
      {
        q: 'どんなファイルに対応？',
        a: 'PDF, Word(.docx), Excel(.xlsx), CSV, Markdown, HTML, RTF, JSON, ODT, テキストの10形式に対応しています。',
      },
      {
        q: 'テキスト貼り付けはできる？',
        a: 'はい。初期画面の「テキスト入力」タブでテキストを直接貼り付けて処理できます。',
      },
      {
        q: 'URLからテキスト取得できる？',
        a: 'はい。初期画面の「URL」タブでWebページのURLを入力するとテキストを自動取得します。',
      },
    ],
  },
  {
    category: '検出・マスキング',
    questions: [
      {
        q: '何を検出できる？',
        a: '氏名、電話番号、メール、住所、生年月日、マイナンバー、URL、SNSアカウント、組織名の9カテゴリを自動検出します。',
      },
      {
        q: 'マスクプリセットとは？',
        a: '基本（氏名+連絡先）/ 標準（+住所・日付・URL）/ 厳格（組織名含む全項目）の3段階から選べます。',
      },
      {
        q: 'カスタムキーワードとは？',
        a: '任意の文字列を指定してマスキング対象に追加できます。初期画面・エディター画面どちらからでも設定可能です。',
      },
    ],
  },
  {
    category: 'AI機能',
    questions: [
      {
        q: 'AI機能を使うには？',
        a: '設定（⚙）からAPIキーを入力しAIをONにしてください。OpenAI / ローカルAIに対応しています。',
      },
      {
        q: 'AIで何ができる？',
        a: 'AI PII検出（正規表現では困難な個人情報検出）、テキスト再フォーマット、画像OCRの3機能があります。',
      },
    ],
  },
  {
    category: 'エクスポート',
    questions: [
      {
        q: 'どの形式で出力できる？',
        a: 'Text, Markdown, CSV, Excel, PDF（印刷）, Word の6形式で出力できます。',
      },
      {
        q: 'PDF編集モードとは？',
        a: 'マスキング結果をMarkdown記法で編集し、A4プレビューで確認してPDF印刷・Word出力できます。',
      },
    ],
  },
  {
    category: 'その他',
    questions: [
      {
        q: 'データはどこに保存される？',
        a: 'どこにも保存しません。Lite版はファイルの読み取りから検出・マスキングまでブラウザ内で完結し、サーバーに送信しません。Pro版はAI機能（検出・OCR・整形・アドバイザー）と、文字を取り出しにくいPDFの文字抽出のときだけサーバーへ送信します（保存はしません）。アドバイザーは初期設定では元の文書を送るため、個人情報をマスクして送るスイッチを用意しています。URLから取り込む場合、ページの取得に公開CORSプロキシ（第三者のサービス）を使うことがあります。',
      },
      {
        q: 'ダークモード切替は？',
        a: 'ヘッダーの☀/🌙ボタンで切替できます。設定はブラウザに保存されます。',
      },
    ],
  },
]

interface ChatMessage {
  type: 'bot' | 'user'
  text: string
}

export type ChatWidgetProps = Record<string, never>

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { type: 'bot', text: 'こんにちは！Sumiのサポートです。\n質問を選んでください。' },
  ])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 420, h: 560 })

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  const botMsgRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (botMsgRef.current)
      botMsgRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const onResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX,
        startY = e.clientY
      const startW = size.w,
        startH = size.h
      const onMove = (ev: MouseEvent) => {
        const newW = Math.max(280, Math.min(600, startW - (ev.clientX - startX)))
        const newH = Math.max(320, Math.min(800, startH - (ev.clientY - startY)))
        setSize({ w: newW, h: newH })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [size],
  )

  const selectQuestion = (q: string, a: string) => {
    setMessages((prev) => [...prev, { type: 'user', text: q }, { type: 'bot', text: a }])
  }

  const chatBtnSvg = (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )

  const closeSvg = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )

  const lastBotIdx = messages.findLastIndex((x) => x.type === 'bot')

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'サポートチャットを閉じる' : 'サポートチャットを開く'}
        className={s['chat-fab']}
        data-open={open}
      >
        {open ? closeSvg : chatBtnSvg}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={s['chat-panel']} style={{ width: size.w, height: size.h }}>
          {/* Resize handle (top-left corner) */}
          <div onMouseDown={onResizeStart} className={s['chat-resize']} title="ドラッグでリサイズ">
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              style={{ position: 'absolute', left: 4, top: 4, opacity: 0.4 }}
            >
              <line x1="0" y1="10" x2="10" y2="0" stroke={T.text2} strokeWidth="1.5" />
              <line x1="0" y1="5" x2="5" y2="0" stroke={T.text2} strokeWidth="1.5" />
            </svg>
          </div>
          {/* Header */}
          <div className={s['chat-header']}>
            <span className={s['chat-title']}>サポート</span>
            <button onClick={() => setOpen(false)} aria-label="閉じる" className={s['chat-close']}>
              {closeSvg}
            </button>
          </div>

          {/* Messages + Options (single scroll area) */}
          <div ref={scrollRef} className={s['chat-body']}>
            {messages.map((m, i) => (
              <div
                key={i}
                ref={i === lastBotIdx ? botMsgRef : null}
                className={s['chat-msg']}
                data-type={m.type}
              >
                {m.text}
              </div>
            ))}
            {/* FAQ options inline */}
            <div style={{ marginTop: 4 }}>
              {CHAT_FAQ.map((cat, ci) => (
                <div key={ci}>
                  <div className={s['chat-faq-cat']}>{cat.category}</div>
                  {cat.questions.map((item, qi) => (
                    <button
                      key={qi}
                      onClick={() => selectQuestion(item.q, item.a)}
                      className={s['chat-faq-btn']}
                    >
                      {item.q}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
