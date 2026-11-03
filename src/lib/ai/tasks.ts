/**
 * AI タスク（PII 検出・OCR・テキスト整形）の公開窓口
 *
 * 画面側はここから import する。実装は用途ごとのモジュールに分けている。
 */
export {
  detectWithAI,
  ensureUniqueDetectionIds,
  parseAIDetectionJson,
  type AIDetection,
  type AIDetectionParseResult,
  type DetectWithAIResult,
} from '@/lib/ai/detect'
export { mergeOcrResults, ocrSparsePages, type OcrResults } from '@/lib/ai/ocr'
export { aiCleanupText, aiReformat } from '@/lib/ai/cleanup'
