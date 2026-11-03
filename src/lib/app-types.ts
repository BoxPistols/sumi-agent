/**
 * 画面間で受け渡すデータの型
 *
 * 取り込み画面（UploadScreen / processFileEntry）が作る解析結果を、確認・整える・書き出す画面が読む。
 */
import type { AppDetection } from '@/lib/redact-engine'
import type { XlSheetMeta } from '@/lib/parsers/types'

export type Edition = 'lite' | 'pro'

/** 設定モーダルで編集し、localStorage（rp_*）に保存する AI 関連の設定 */
export interface AppSettings {
  apiKey: string
  model: string
  aiDetect: boolean
  aiProfile: string
  provider: string
  /** URL 取り込みで使う自前プロキシ（{url} を含む URL テンプレート） */
  proxyUrl: string
  /** ローカル LLM（Ollama 等）の OpenAI 互換エンドポイント */
  localEndpoint?: string
}

export interface AnalysisStats {
  total: number
  regex: number
  dict: number
  ai: number
  heuristic: number
}

/** 1 ファイル分の解析結果。確認画面以降はこれを編集しながら使う */
export interface AnalysisResult {
  file_name: string
  file_format: string
  page_count: number | null
  /** 画面の初期表示用に先頭 8000 文字だけ切り出したもの */
  text_preview: string
  /** マスク対象の全文（AI 整形・OCR 後） */
  fullText: string
  /** AI 整形・OCR 前の抽出テキスト（「生テキスト」表示と差分に使う） */
  rawText: string
  sparsePageCount: number
  detections: AppDetection[]
  stats: AnalysisStats
  fileSize: string
  isDemo: boolean
  analysis_ms: number
  maskOpts: { keepPrefecture: boolean; nameInitial: boolean }
  xlMeta?: XlSheetMeta[] | null
}

export type BatchFileStatus = 'queued' | 'processing' | 'done' | 'error' | 'cancelled'

/** 複数ファイル取り込み（Pro）のタブ 1 つ分 */
export interface BatchFileEntry {
  id: string
  file: File
  fileName: string
  status: BatchFileStatus
  stage: string
  progress: number
  data: AnalysisResult | null
  error?: string | null
  /** タブを閉じたときに、まだ始まっていない／処理中の解析を止める */
  abortController: AbortController
}
