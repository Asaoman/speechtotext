/**
 * =========================================================================================
 * 字幕生成 API - 文脈を考慮した業界標準字幕作成システム
 * =========================================================================================
 *
 * このモジュールは、音声認識結果から映画・放送業界標準に準拠した字幕を生成します。
 *
 * 【字幕生成の哲学】
 * 1. 文脈の連続性（Contextual Continuity）
 *    - 各字幕セクションは意味のまとまりを保持
 *    - 前後の字幕との文脈的繋がりを維持
 *    - 視聴者の理解を妨げない自然な区切り
 *
 * 2. 意味単位の保持（Semantic Unit Preservation）
 *    - 句読点、接続詞などの自然な区切り位置で分割
 *    - 文法的な完全性を維持
 *    - 単語の続き方（連続性）を考慮
 *
 * 3. 読み取り速度の最適化（Reading Speed Optimization）
 *    - 言語別の読み取り速度（CPS）に基づく表示時間計算
 *    - 最小/最大表示時間の遵守
 *    - 視聴者の快適な読み取りペースの確保
 *
 * 4. タイミングの精密制御（Precise Timing Control）
 *    - 字幕間の最小間隔確保（視覚的区切りの明確化）
 *    - 音声とのシンクロナイゼーション
 *    - 過度なギャップの調整
 *
 * 【実装アプローチ】
 * - calculateBreakScore: 区切り位置のスコアリング（句読点、接続詞の検出）
 * - groupWordsIntoSubtitles: 文脈を考慮した単語グループ化
 * - adjustSubtitleTimings: タイミングの最適化と調整
 * - optimizeLineBreaks: AI支援による改行位置の最適化
 *
 * 【字幕レギュレーション準拠】
 * - Netflix/BBC字幕ガイドライン
 * - 日本字幕協会標準
 * - 業界標準CPS（Characters Per Second）
 *
 * =========================================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  TranscriptionWord,
  SubtitleGenerationSettings,
  SubtitleEntry,
  SubtitleGenerationResult,
  SubtitleValidationResult,
  LanguageTimingConfig,
  FrameRate,
  TimingViolation,
  SubtitleTimingValidation,
  MovieSubtitleEntry,
  SubtitlePlatform,
  LineBreakPatternType,
  SegmentSplitPatternType
} from '@/lib/types'
import { formatTimestampSRT, formatTimestampVTT } from '@/lib/utils'
import {
  SUBTITLE_PRESETS,
  LINE_BREAK_PATTERNS,
  SEGMENT_SPLIT_PATTERNS,
  getPresetById
} from '@/lib/subtitlePresets'

export const runtime = 'nodejs'
export const maxDuration = 300

interface SubtitleGenerationRequest {
  words: TranscriptionWord[]
  settings: SubtitleGenerationSettings
  language: 'en' | 'ja'
  fps?: FrameRate
  enableTimingValidation?: boolean
  autoFixViolations?: boolean
  includeSpeakerTags?: boolean
  speakerMapping?: Record<string, string>  // speakerId -> characterName
  // プリセット設定
  presetId?: SubtitlePlatform             // プラットフォームプリセット
  lineBreakPattern?: LineBreakPatternType // 改行パターン
  segmentSplitPattern?: SegmentSplitPatternType // セグメント分割パターン
}

// プリセットからタイミング設定を取得
function getTimingConfigFromPreset(presetId: SubtitlePlatform, fps: FrameRate): LanguageTimingConfig {
  const preset = getPresetById(presetId)
  if (!preset) {
    // デフォルトのNetflix日本語設定
    return TIMING_CONFIG['ja']
  }
  
  return {
    minDuration: preset.minDuration,
    maxDuration: preset.maxDuration,
    maxCPS: preset.maxCPS,
    minGapFrames: preset.minGapFrames,
    forbiddenGapRange: preset.forbiddenGapRange,
    outExtensionFrames: preset.outExtensionFrames,
    maxCharsPerLine: preset.maxCharsPerLine,
  }
}

// ============================================
// Netflix/業界標準 言語別タイミング設定
// ============================================

const TIMING_CONFIG: Record<'en' | 'ja', LanguageTimingConfig> = {
  en: {
    minDuration: 0.833,       // 5/6秒 = 833ms (20フレーム@24fps)
    maxDuration: 7.0,         // 最大7秒
    maxCPS: 20,               // 20文字/秒
    minGapFrames: 2,          // 最小2フレーム
    forbiddenGapRange: {      // 3-11フレームは禁止
      min: 3,
      max: 11,
    },
    outExtensionFrames: 12,   // OUT点延長: 最大12フレーム (0.5秒@24fps)
    maxCharsPerLine: 42,
  },
  ja: {
    minDuration: 0.5,         // 500ms (12フレーム@24fps)
    maxDuration: 6.5,         // 最大6.5秒
    maxCPS: 4,                // 4文字/秒
    minGapFrames: 3,          // 最小3フレーム
    outExtensionFrames: 12,   // OUT点延長: 最大12フレーム
    maxCharsPerLine: 13,
  },
}

// 読み取り速度の定数（秒あたりの文字数）- 後方互換性のため維持
const READING_SPEED = {
  en: 20, // 英語: 20 CPS (characters per second)
  ja: 4,  // 日本語: 4文字/秒
}

// フレームをに変換
function framesToSeconds(frames: number, fps: FrameRate = 24): number {
  return frames / fps
}

// 秒をフレームに変換
function secondsToFrames(seconds: number, fps: FrameRate = 24): number {
  return Math.round(seconds * fps)
}

// ============================================
// 禁止ギャップルール (24fps)
// 3-11フレームのギャップは禁止 → 2フレームに縮める
// ============================================
function normalizeGap(gap: number, fps: FrameRate, language: 'en' | 'ja'): number {
  const config = TIMING_CONFIG[language]
  const frames = gap * fps
  
  // 英語のみ禁止ギャップルール適用
  if (config.forbiddenGapRange) {
    const { min, max } = config.forbiddenGapRange
    if (frames >= min && frames <= max) {
      // 禁止範囲内のギャップは最小ギャップに正規化
      return framesToSeconds(config.minGapFrames, fps)
    }
  }
  
  // 最小ギャップより短い場合は最小ギャップに
  if (frames < config.minGapFrames) {
    return framesToSeconds(config.minGapFrames, fps)
  }
  
  return gap
}

// ============================================
// OUT点延長ルール
// 発話終了後、一定時間（最大12フレーム）まで字幕を延長表示
// ============================================
function applyOutExtension(
  currentEndTime: number,
  nextStartTime: number | null,
  textLength: number,
  language: 'en' | 'ja',
  fps: FrameRate = 24
): number {
  const config = TIMING_CONFIG[language]
  
  // 読み取り時間に基づいた理想的な表示時間
  const idealDuration = textLength / config.maxCPS
  
  // OUT点延長の最大値（秒）
  const maxExtension = framesToSeconds(config.outExtensionFrames, fps)
  
  // 次の字幕との間隔を考慮
  const minGap = framesToSeconds(config.minGapFrames, fps)
  
  if (nextStartTime !== null) {
    // 次の字幕がある場合、ギャップを確保しつつ延長
    const availableSpace = nextStartTime - currentEndTime - minGap
    const extension = Math.min(maxExtension, Math.max(0, availableSpace))
    return currentEndTime + extension
  } else {
    // 最後の字幕の場合、最大延長を適用
    return currentEndTime + maxExtension
  }
}

// 旧TIMINGオブジェクト（後方互換性）
// 推奨: 新規コードでは SUBTITLE_PRESETS を使用してください
const TIMING = {
  minDuration: 0.833,  // 最小表示時間（秒）- 英語デフォルト
  maxDuration: 7,      // 最大表示時間（秒）- 英語デフォルト
  minGap: 0.083,       // 最小字幕間隔（2フレーム@24fps）
}

// プリセットベースの改行ルールを適用
function applyLineBreakPattern(
  text: string, 
  patternId: LineBreakPatternType,
  maxCharsPerLine: number
): string[] {
  const pattern = LINE_BREAK_PATTERNS[patternId]
  if (!pattern) {
    // デフォルトの改行処理
    return splitIntoLines(text, maxCharsPerLine)
  }
  
  const rules = pattern.rules
  
  // 日本語: 句読点なしモードの処理
  if (rules.noPunctuationMode) {
    text = text.replace(/、/g, ' ').replace(/。/g, '')
  }
  
  // 単純な文字数ベースの分割（実際の実装ではAIを使用）
  return splitIntoLines(text, maxCharsPerLine)
}

// 単純な行分割（ヘルパー関数）
function splitIntoLines(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) {
    return [text]
  }
  
  // 日本語と英語を判定
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)
  
  if (isJapanese) {
    // 日本語: 文字数で分割
    const mid = Math.ceil(text.length / 2)
    return [text.slice(0, mid), text.slice(mid)]
  } else {
    // 英語: スペースで分割
    const words = text.split(' ')
    let line1 = ''
    let line2 = ''
    
    for (const word of words) {
      if (line1.length + word.length + 1 <= maxCharsPerLine) {
        line1 += (line1 ? ' ' : '') + word
      } else {
        line2 += (line2 ? ' ' : '') + word
      }
    }
    
    return line2 ? [line1, line2] : [line1]
  }
}

// 日本語の句読点を処理（字幕表示用）
// 重要：疑問符・感嘆符は絶対に保持する
function processJapanesePunctuation(text: string): string {
  return text
    .replace(/、/g, ' ')  // 読点を半角スペースに変換
    .replace(/。(?![！？!?])/g, '')   // 句点のみ削除（疑問符・感嘆符の前の句点は保持しない）
    // 疑問符・感嘆符は絶対に保持
    // ！ → そのまま
    // ？ → そのまま
}

// 改行位置最適化APIを呼び出す
async function optimizeLineBreaks(
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
  language: 'en' | 'ja',
  service: 'chatgpt' | 'claude' | 'gemini',
  apiKey?: string
): Promise<string[]> {
  // 日本語の場合、句読点を処理
  const processedText = language === 'ja' ? processJapanesePunctuation(text) : text

  // APIキーがない場合は直接fallbackを使用
  if (!apiKey) {
    console.log('No API key, using fallback line breaking')
    return fallbackLineBreak(processedText, maxCharsPerLine, maxLines, language)
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/subtitles/optimize-line-breaks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: processedText,
        maxCharsPerLine,
        maxLines,
        language,
        service,
        apiKey,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Line break optimization failed')
    }

    const data = await response.json()
    return data.lines
  } catch (error) {
    console.error('Line break optimization failed, using fallback:', error)
    // フォールバック: シンプルな分割
    return fallbackLineBreak(processedText, maxCharsPerLine, maxLines, language)
  }
}

// フォールバック: AIが使えない場合のシンプルな行分割
function fallbackLineBreak(text: string, maxCharsPerLine: number, maxLines: number, language: 'en' | 'ja' = 'en'): string[] {
  // 日本語の場合の処理
  if (language === 'ja') {
    const lines: string[] = []
    let currentLine = ''

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const testLine = currentLine + char

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
        }
        currentLine = char
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    // 最大行数を超える場合は統合
    while (lines.length > maxLines) {
      const lastTwo = lines.slice(-2).join('')
      lines.splice(-2, 2, lastTwo)
    }

    return lines.length > 0 ? lines : [text]
  }

  // 英語の場合の処理（既存のロジック）
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    // 単語が1行の最大文字数を超える場合
    if (word.length > maxCharsPerLine) {
      // 現在の行を保存
      if (currentLine) {
        lines.push(currentLine.trim())
        currentLine = ''
      }
      // 長い単語を分割
      let remainingWord = word
      while (remainingWord.length > maxCharsPerLine) {
        lines.push(remainingWord.slice(0, maxCharsPerLine - 1) + '-')
        remainingWord = remainingWord.slice(maxCharsPerLine - 1)
      }
      currentLine = remainingWord + ' '
    } else {
      const testLine = currentLine + word + ' '
      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine
      } else {
        lines.push(currentLine.trim())
        currentLine = word + ' '
      }
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim())
  }

  // 最大行数を超える場合は統合
  while (lines.length > maxLines) {
    const lastTwo = lines.slice(-2).join(' ')
    lines.splice(-2, 2, lastTwo)
  }

  return lines.length > 0 ? lines : [text]
}

// 文の区切りポイントをスコアリング（高いほど良い区切り位置）
function calculateBreakScore(
  word: string,
  nextWord: string | undefined,
  language: 'en' | 'ja'
): number {
  let score = 0

  if (language === 'ja') {
    // 日本語の区切り判定
    // 句点・読点の後（最優先）
    if (word.endsWith('。') || word.endsWith('、')) score += 100
    if (word.endsWith('！') || word.endsWith('？')) score += 100

    // 接続助詞・接続詞の前
    if (nextWord) {
      const connectionWords = ['しかし', 'そして', 'また', 'それで', 'だから', 'でも', 'すると', 'では', 'そこで', 'ところが', 'けれども', 'ただし']
      if (connectionWords.some(conn => nextWord.startsWith(conn))) score += 80

      // 接続助詞の前（て、で、が、けど、から、ので、のに、たり、し、etc）
      if (word.endsWith('て') || word.endsWith('で')) score += 60
      if (word.endsWith('が') && word.length > 1) score += 50
      if (word.endsWith('けど') || word.endsWith('から')) score += 70
      if (word.endsWith('ので') || word.endsWith('のに')) score += 70
    }

    // 名詞止め・動詞の終止形
    if (word.endsWith('だ') || word.endsWith('です') || word.endsWith('ます')) score += 40
    if (word.endsWith('た') || word.endsWith('だった') || word.endsWith('でした')) score += 40
    if (word.endsWith('る') || word.endsWith('う')) score += 30

  } else {
    // 英語の区切り判定
    // 文末（最優先）
    if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) score += 100

    // カンマの後
    if (word.endsWith(',')) score += 80
    if (word.endsWith(';') || word.endsWith(':')) score += 70

    // 接続詞の前
    if (nextWord) {
      const conjunctions = ['and', 'but', 'or', 'so', 'yet', 'for', 'nor', 'because', 'although', 'while', 'if', 'when', 'since', 'unless', 'however', 'therefore', 'moreover', 'furthermore']
      const nextLower = nextWord.toLowerCase()
      if (conjunctions.includes(nextLower)) score += 70

      // 前置詞の前（程々のスコア）
      const prepositions = ['at', 'by', 'for', 'from', 'in', 'of', 'on', 'to', 'with', 'about', 'after', 'before', 'during', 'through', 'under']
      if (prepositions.includes(nextLower)) score += 40
    }
  }

  return score
}

// ============================================
// タイミングバリデーション
// ============================================
function validateSubtitleTiming(
  subtitles: SubtitleEntry[],
  language: 'en' | 'ja',
  fps: FrameRate = 24
): SubtitleTimingValidation {
  const config = TIMING_CONFIG[language]
  const violations: TimingViolation[] = []
  const minGap = framesToSeconds(config.minGapFrames, fps)
  
  let totalDuration = 0
  let totalCPS = 0
  let minDuration = Infinity
  let maxDuration = 0
  let totalGap = 0
  let gapCount = 0

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i]
    const next = i < subtitles.length - 1 ? subtitles[i + 1] : null
    
    const duration = subtitle.endTime - subtitle.startTime
    const textLength = subtitle.text.length
    const cps = textLength / duration

    // 統計情報の収集
    totalDuration += duration
    totalCPS += cps
    minDuration = Math.min(minDuration, duration)
    maxDuration = Math.max(maxDuration, duration)

    // === 負の表示時間チェック ===
    if (duration <= 0) {
      violations.push({
        type: 'negative_duration',
        severity: 'error',
        subtitleIndex: i + 1,
        message: `字幕 #${i + 1}: 表示時間が0以下です (${duration.toFixed(3)}秒)`,
        details: { actual: duration, expected: config.minDuration, unit: 'seconds' },
        autoFixable: true,
        suggestedFix: { endTime: subtitle.startTime + config.minDuration },
      })
    }

    // === 最小表示時間チェック ===
    if (duration > 0 && duration < config.minDuration) {
      violations.push({
        type: 'min_duration',
        severity: 'warning',
        subtitleIndex: i + 1,
        message: `字幕 #${i + 1}: 表示時間が短すぎます (${duration.toFixed(3)}秒 < ${config.minDuration}秒)`,
        details: { actual: duration, expected: config.minDuration, unit: 'seconds' },
        autoFixable: true,
        suggestedFix: { endTime: subtitle.startTime + config.minDuration },
      })
    }

    // === 最大表示時間チェック ===
    if (duration > config.maxDuration) {
      violations.push({
        type: 'max_duration',
        severity: 'warning',
        subtitleIndex: i + 1,
        message: `字幕 #${i + 1}: 表示時間が長すぎます (${duration.toFixed(3)}秒 > ${config.maxDuration}秒)`,
        details: { actual: duration, expected: config.maxDuration, unit: 'seconds' },
        autoFixable: true,
        suggestedFix: { endTime: subtitle.startTime + config.maxDuration },
      })
    }

    // === 読み取り速度チェック ===
    if (cps > config.maxCPS) {
      violations.push({
        type: 'reading_speed',
        severity: 'error',
        subtitleIndex: i + 1,
        message: `字幕 #${i + 1}: 読み取り速度が速すぎます (${cps.toFixed(1)} CPS > ${config.maxCPS} CPS)`,
        details: { actual: cps, expected: config.maxCPS, unit: 'cps' },
        autoFixable: false,
      })
    }

    // === 文字数チェック ===
    const lines = subtitle.lines || [subtitle.text]
    for (const line of lines) {
      if (line.length > config.maxCharsPerLine) {
        violations.push({
          type: 'char_limit',
          severity: 'warning',
          subtitleIndex: i + 1,
          message: `字幕 #${i + 1}: 1行あたりの文字数が多すぎます (${line.length}文字 > ${config.maxCharsPerLine}文字)`,
          details: { actual: line.length, expected: config.maxCharsPerLine, unit: 'characters' },
          autoFixable: false,
        })
        break
      }
    }

    // === ギャップチェック ===
    if (next) {
      const gap = next.startTime - subtitle.endTime
      totalGap += gap
      gapCount++

      // 重複チェック
      if (gap < 0) {
        violations.push({
          type: 'overlap',
          severity: 'error',
          subtitleIndex: i + 1,
          message: `字幕 #${i + 1} と #${i + 2}: 時間が重複しています (${Math.abs(gap).toFixed(3)}秒)`,
          details: { actual: gap, expected: minGap, unit: 'seconds' },
          autoFixable: true,
          suggestedFix: { endTime: next.startTime - minGap },
        })
      }

      // 禁止ギャップチェック（英語のみ）
      if (config.forbiddenGapRange) {
        const gapFrames = gap * fps
        const { min, max } = config.forbiddenGapRange
        if (gapFrames >= min && gapFrames <= max) {
          violations.push({
            type: 'forbidden_gap',
            severity: 'warning',
            subtitleIndex: i + 1,
            message: `字幕 #${i + 1} と #${i + 2}: 禁止ギャップ範囲です (${gapFrames.toFixed(1)}フレーム, 許容: <${min}または>${max}フレーム)`,
            details: { actual: gapFrames, expected: config.minGapFrames, unit: 'frames' },
            autoFixable: true,
            suggestedFix: { endTime: next.startTime - framesToSeconds(config.minGapFrames, fps) },
          })
        }
      }
    }
  }

  const totalCount = subtitles.length
  const errorCount = violations.filter(v => v.severity === 'error').length
  const warningCount = violations.filter(v => v.severity === 'warning').length

  return {
    isValid: errorCount === 0,
    totalViolations: violations.length,
    errors: errorCount,
    warnings: warningCount,
    violations,
    statistics: {
      totalSubtitles: totalCount,
      avgDuration: totalCount > 0 ? totalDuration / totalCount : 0,
      avgCPS: totalCount > 0 ? totalCPS / totalCount : 0,
      minDuration: minDuration === Infinity ? 0 : minDuration,
      maxDuration,
      avgGap: gapCount > 0 ? totalGap / gapCount : 0,
    },
  }
}

// ============================================
// Phase 1: AI一括セグメント分割
// ============================================
async function aiSegmentText(
  words: TranscriptionWord[],
  settings: SubtitleGenerationSettings,
  geminiApiKey: string
): Promise<string[] | null> {
  const fullText = words.map(w => w.word).join(settings.language === 'ja' ? '' : ' ')
  const maxCharsTotal = settings.maxCharsPerLine * settings.maxLines

  const genAI = new GoogleGenerativeAI(geminiApiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = settings.language === 'ja'
    ? `以下の書き起こしテキストを字幕用にセグメント分割せよ。

制約:
- 1セグメントの最大文字数: ${maxCharsTotal}文字
- 各セグメントは意味的に完結した単位であること
- 文の途中でセグメントを切らないこと

セグメント分割の優先順位:
1. 文の完結点（文末表現: 〜た、〜です、〜ます、〜よ、〜ね、〜な）で切る
2. 接続詞・接続助詞の前で切る（しかし、そして、だから、でも等）
3. 引用・会話の区切りで切る
4. 読点の前後で切る（ただし意味のまとまり優先）

絶対禁止:
- 助詞の直前・直後で切らない（〜は、〜が、〜を、〜に等）
- 修飾語と被修飾語を分断しない
- 固有名詞を分断しない
- 1セグメントが${maxCharsTotal}文字を超えないこと

テキスト:
${fullText}

出力形式（JSONのみ、コードブロックなし）:
{"segments": ["セグメント1テキスト", "セグメント2テキスト", ...]}`
    : `Split the following transcription into subtitle segments.

Constraints:
- Max chars per segment: ${maxCharsTotal}
- Each segment must be a semantically complete unit
- Never split mid-sentence

Priority order for split points:
1. Sentence boundaries (periods, question marks, exclamation marks)
2. Before conjunctions (but, and, so, because, however)
3. After quoted speech
4. After commas that mark natural pauses

Forbidden:
- Never split before/after articles (a, an, the) and their nouns
- Never split between modifier and modified word
- Never split proper nouns
- No segment longer than ${maxCharsTotal} chars

Text:
${fullText}

Output format (JSON only, no code blocks):
{"segments": ["segment1 text", "segment2 text", ...]}`

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })

    const rawText = result.response.text().trim()
    const parsed = JSON.parse(rawText)

    if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      return null
    }

    // 検証: maxCharsTotal を超えるセグメントがないか
    const hasOversized = parsed.segments.some(
      (s: string) => typeof s === 'string' && s.length > maxCharsTotal * 1.2
    )
    if (hasOversized) {
      console.warn('[Phase1] Oversized segment detected, falling back to rule-based')
      return null
    }

    return parsed.segments.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
  } catch (err) {
    console.error('[Phase1] AI segmentation failed:', err)
    return null
  }
}

// ============================================
// Phase 2: タイムスタンプ割当 (CPU処理)
// ============================================
function assignTimestamps(
  segments: string[],
  words: TranscriptionWord[],
  language: 'en' | 'ja'
): SubtitleEntry[] {
  const subtitles: SubtitleEntry[] = []
  let wordIdx = 0

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segText = segments[segIdx].trim()
    if (!segText) continue

    // セグメントテキストの正規化（スペース除去で比較）
    const normalize = (s: string) => s.replace(/\s+/g, '')
    const normalizedSeg = normalize(segText)

    let accumulated = ''
    const startWordIdx = wordIdx
    let endWordIdx = wordIdx

    // words を順に消費してセグメントテキストと一致するまで進める
    while (wordIdx < words.length) {
      const w = words[wordIdx]
      const sep = language === 'ja' ? '' : (accumulated ? ' ' : '')
      const candidate = accumulated + sep + w.word
      const normalizedCandidate = normalize(candidate)

      // セグメントテキストの先頭部分とマッチしているか確認
      if (normalizedSeg.startsWith(normalizedCandidate)) {
        accumulated = candidate
        endWordIdx = wordIdx
        wordIdx++

        // 完全一致
        if (normalize(accumulated) === normalizedSeg) {
          break
        }
      } else if (normalizedSeg.length <= normalize(accumulated).length) {
        // 行き過ぎた場合は終了
        break
      } else {
        // 不一致だが進める（fuzzyマッチング）
        accumulated = candidate
        endWordIdx = wordIdx
        wordIdx++

        if (normalize(accumulated).length >= normalizedSeg.length) {
          break
        }
      }
    }

    if (startWordIdx > endWordIdx && wordIdx > 0) {
      endWordIdx = wordIdx - 1
    }

    const startWord = words[startWordIdx]
    const endWord = words[Math.min(endWordIdx, words.length - 1)]

    if (!startWord) continue

    subtitles.push({
      index: segIdx + 1,
      startTime: startWord.start,
      endTime: endWord ? endWord.end : startWord.end,
      text: segText,
      lines: [segText], // Phase 3で上書き
    })
  }

  return subtitles
}

// ============================================
// Phase 3: バッチ行分割 (1回のAI呼び出し)
// ============================================
async function batchOptimizeLineBreaks(
  subtitles: SubtitleEntry[],
  settings: SubtitleGenerationSettings
): Promise<SubtitleEntry[]> {
  if (!settings.lineBreakApiKey || subtitles.length === 0) {
    // APIキーなし: フォールバック
    return subtitles.map(s => ({
      ...s,
      lines: fallbackLineBreak(
        language === 'ja' ? processJapanesePunctuation(s.text) : s.text,
        settings.maxCharsPerLine,
        settings.maxLines,
        settings.language
      ),
    }))
  }

  const language = settings.language
  const texts = subtitles.map(s => language === 'ja' ? processJapanesePunctuation(s.text) : s.text)

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/subtitles/optimize-line-breaks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'batch',
        texts,
        maxCharsPerLine: settings.maxCharsPerLine,
        maxLines: settings.maxLines,
        language,
        service: settings.lineBreakService,
        apiKey: settings.lineBreakApiKey,
      }),
    })

    if (!response.ok) {
      throw new Error(`Batch line-break request failed: ${response.status}`)
    }

    const data = await response.json()

    if (!Array.isArray(data.results)) {
      throw new Error('Batch response missing results')
    }

    // 結果をインデックスでマッピング
    const resultMap = new Map<number, string[]>()
    for (const r of data.results) {
      if (typeof r.index === 'number' && Array.isArray(r.lines)) {
        resultMap.set(r.index, r.lines)
      }
    }

    return subtitles.map((s, i) => ({
      ...s,
      lines: resultMap.get(i + 1) || [texts[i]],
    }))
  } catch (err) {
    console.error('[Phase3] Batch line-break failed, using fallback:', err)
    return subtitles.map((s, i) => ({
      ...s,
      lines: fallbackLineBreak(texts[i], settings.maxCharsPerLine, settings.maxLines, language),
    }))
  }
}

// ============================================
// Phase 5: AI包括検証
// ============================================
async function validateSubtitlesWithAI(
  subtitles: SubtitleEntry[],
  language: 'en' | 'ja',
  service: string,
  apiKey: string
): Promise<SubtitleValidationResult | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/subtitles/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtitles, language, service, apiKey }),
    })

    if (!response.ok) return null

    const data = await response.json()
    if (data.success === false) return null

    return data as SubtitleValidationResult
  } catch (err) {
    console.error('[Phase5] AI validation failed:', err)
    return null
  }
}

// 変数参照用（Phase 3のfallback内で使用）
const language_placeholder = 'ja' as 'en' | 'ja'

// 文脈を考慮した単語グループ化（字幕生成のコアロジック）
async function groupWordsIntoSubtitles(
  words: TranscriptionWord[],
  settings: SubtitleGenerationSettings,
  fps: FrameRate = 24,
  autoFix: boolean = true
): Promise<SubtitleEntry[]> {
  const subtitles: SubtitleEntry[] = []
  const maxCharsTotal = settings.maxCharsPerLine * settings.maxLines
  const readingSpeed = READING_SPEED[settings.language]

  let currentGroup: TranscriptionWord[] = []
  let currentText = ''
  let index = 1

  // === 字幕レギュレーションに基づくグループ化戦略 ===
  // 1. 意味のまとまり（semantic units）を保持
  // 2. 自然な区切り位置（句読点、接続詞）で分割
  // 3. 読み取り速度（CPS）を考慮した表示時間の最適化
  // 4. 前後の字幕との文脈的繋がりを維持

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const nextWord = i < words.length - 1 ? words[i + 1] : null

    // 現在のグループにwordを追加した場合のテキスト
    const separator = settings.language === 'ja' && currentText ? '' : (currentText ? ' ' : '')
    const testText = currentText + separator + word.word
    const testTextLength = testText.length

    // === 基本条件：文字数制限と単語数制限 ===
    const withinCharLimit = testTextLength <= maxCharsTotal
    const withinWordLimit = currentGroup.length < 50
    const canAddWord = currentGroup.length === 0 || (withinCharLimit && withinWordLimit)

    // === 区切りポイントのスコアリング ===
    // 現在の単語が自然な区切り位置かどうかを評価
    const breakScore = calculateBreakScore(
      word.word,
      nextWord?.word,
      settings.language
    )

    // === タイミング分析：表示時間の適切性 ===
    let timingScore = 0
    if (currentGroup.length > 0) {
      const groupStartTime = currentGroup[0].start
      const currentEndTime = word.end
      const duration = currentEndTime - groupStartTime
      const currentTextChars = testText.length
      const requiredDuration = currentTextChars / readingSpeed

      // 理想的な表示時間に近いほど高スコア
      if (duration >= requiredDuration * 0.8 && duration <= requiredDuration * 1.5) {
        timingScore = 50
      } else if (duration < requiredDuration * 0.5) {
        // 表示時間が短すぎる場合は区切らない
        timingScore = -50
      }
    }

    // === セクション区切りの決定ロジック ===
    const shouldBreakHere = !canAddWord || (
      currentGroup.length > 0 &&
      canAddWord &&
      breakScore >= 70 && // 高スコアの区切り位置
      timingScore >= 0 && // タイミングが適切
      testTextLength >= maxCharsTotal * 0.4 // 最低文字数を確保（短すぎる字幕を防ぐ）
    )

    if (!shouldBreakHere && canAddWord) {
      // === 単語を現在のグループに追加 ===
      currentGroup.push(word)
      currentText = testText
    } else {
      // === 現在のグループを字幕エントリとして確定 ===
      if (currentGroup.length > 0) {
        const subtitle = await createSubtitleEntry(
          currentGroup,
          currentText,
          index,
          settings,
          readingSpeed
        )
        subtitles.push(subtitle)
        index++
      }

      // === 新しいセクション（字幕グループ）を開始 ===
      currentGroup = [word]
      currentText = word.word
    }

    // === 最後の単語：残りをすべて確定 ===
    if (i === words.length - 1 && currentGroup.length > 0) {
      const subtitle = await createSubtitleEntry(
        currentGroup,
        currentText,
        index,
        settings,
        readingSpeed
      )
      subtitles.push(subtitle)
    }
  }

  // === タイミング調整：字幕間の重なりや間隔を最適化 ===
  // 言語別のタイミングルールを適用
  return adjustSubtitleTimings(subtitles, settings.language, fps, autoFix)
}

// 字幕エントリを作成
async function createSubtitleEntry(
  words: TranscriptionWord[],
  text: string,
  index: number,
  settings: SubtitleGenerationSettings,
  readingSpeed: number
): Promise<SubtitleEntry> {
  // 開始時刻と終了時刻を決定
  const startTime = words[0].start
  let endTime = words[words.length - 1].end

  // 読み取り時間に基づいた最小表示時間を計算
  const minDurationByReadingSpeed = text.length / readingSpeed
  const requiredDuration = Math.max(minDurationByReadingSpeed, TIMING.minDuration)

  // 実際の音声の長さ
  const actualDuration = endTime - startTime

  // 必要な表示時間が実際の音声より長い場合は延長
  if (actualDuration < requiredDuration) {
    endTime = startTime + Math.min(requiredDuration, TIMING.maxDuration)
  }

  // 改行位置を最適化
  const lines = await optimizeLineBreaks(
    text,
    settings.maxCharsPerLine,
    settings.maxLines,
    settings.language,
    settings.lineBreakService,
    settings.lineBreakApiKey
  )

  return {
    index,
    startTime,
    endTime,
    text,
    lines,
  }
}

// 字幕のタイミングを調整（文脈を考慮した重なりや間隔の最適化）
// language と fps パラメータを追加して言語別ルールを適用
function adjustSubtitleTimings(
  subtitles: SubtitleEntry[], 
  language: 'en' | 'ja' = 'en',
  fps: FrameRate = 24,
  autoFix: boolean = true
): SubtitleEntry[] {
  const config = TIMING_CONFIG[language]
  const minGap = framesToSeconds(config.minGapFrames, fps)
  
  // === タイミング調整戦略（字幕レギュレーション準拠） ===
  // 1. 字幕間の最小間隔を確保（視覚的な区切りの明確化）
  // 2. 読み取り速度に基づく最小/最大表示時間の遵守
  // 3. 禁止ギャップ（3-11フレーム@24fps、英語のみ）の正規化
  // 4. OUT点延長ルールの適用
  // 5. 前後の字幕との自然な流れを保つ

  for (let i = 0; i < subtitles.length; i++) {
    const current = subtitles[i]
    const next = i < subtitles.length - 1 ? subtitles[i + 1] : null
    const prev = i > 0 ? subtitles[i - 1] : null

    // === OUT点延長ルールの適用 ===
    // 発話終了後、最大12フレームまで字幕を延長表示
    if (autoFix) {
      const nextStartTime = next ? next.startTime : null
      current.endTime = applyOutExtension(
        current.endTime,
        nextStartTime,
        current.text.length,
        language,
        fps
      )
    }

    if (next) {
      // === 字幕間のギャップ分析 ===
      let actualGap = next.startTime - current.endTime

      // === 禁止ギャップルールの適用（英語のみ） ===
      // 3-11フレームのギャップは2フレームに正規化
      if (autoFix) {
        const normalizedGap = normalizeGap(actualGap, fps, language)
        if (normalizedGap !== actualGap) {
          // ギャップを正規化するため、現在の字幕の終了時刻を調整
          current.endTime = next.startTime - normalizedGap
          actualGap = normalizedGap
        }
      }

      // 現在の字幕が次の字幕と重なっている、または間隔が短すぎる場合
      if (actualGap < minGap) {
        // === 調整戦略1: 現在の字幕の終了時刻を調整 ===
        current.endTime = next.startTime - minGap

        // 調整後の表示時間が最小表示時間を下回るか確認
        const adjustedDuration = current.endTime - current.startTime

        if (adjustedDuration < config.minDuration && autoFix) {
          // === 調整戦略2: 開始時刻を前にずらす（前の字幕との兼ね合いを考慮） ===
          const adjustment = config.minDuration - adjustedDuration

          if (prev) {
            const prevMinGap = framesToSeconds(config.minGapFrames, fps)
            const availableSpace = current.startTime - prev.endTime - prevMinGap
            const shift = Math.min(adjustment, Math.max(0, availableSpace))

            if (shift > 0) {
              current.startTime -= shift
            } else {
              // 前にずらせない場合は、次の字幕の開始時刻を調整
              const pushForward = adjustment - shift
              next.startTime = Math.min(next.startTime + pushForward, next.endTime - config.minDuration)
              current.endTime = next.startTime - minGap
            }
          } else {
            // 最初の字幕の場合は開始時刻を0.5秒前にずらす
            current.startTime = Math.max(0, current.startTime - adjustment)
          }
        }
      } else if (actualGap > 2.0 && autoFix) {
        // === ギャップが大きすぎる場合の処理（文脈の連続性を考慮） ===
        // 2秒以上のギャップがある場合、現在の字幕を少し延長して
        // 視覚的な繋がりを改善（ただし最大表示時間は超えない）
        const currentDuration = current.endTime - current.startTime
        const maxExtension = Math.min(
          config.maxDuration - currentDuration,
          actualGap - minGap * 2
        )

        if (maxExtension > 0) {
          // 最大1秒まで延長
          const extension = Math.min(maxExtension, 1.0)
          current.endTime += extension
        }
      }
    }

    // === 最大表示時間の制限 ===
    const duration = current.endTime - current.startTime
    if (duration > config.maxDuration && autoFix) {
      current.endTime = current.startTime + config.maxDuration
    }

    // === 読み取り速度に基づく表示時間の検証 ===
    // 各字幕が十分な読み取り時間を確保しているか確認
    const textLength = current.text.length
    const requiredDuration = textLength / config.maxCPS
    const finalDuration = current.endTime - current.startTime

    if (finalDuration < requiredDuration * 0.7 && next && autoFix) {
      // 表示時間が不足している場合、可能な範囲で延長
      const neededExtension = requiredDuration * 0.7 - finalDuration
      const maxPossibleExtension = next.startTime - minGap - current.endTime

      if (maxPossibleExtension > 0) {
        const extension = Math.min(neededExtension, maxPossibleExtension)
        current.endTime += extension
      }
    }
  }

  // === 最後の字幕の調整 ===
  if (subtitles.length > 0) {
    const last = subtitles[subtitles.length - 1]
    const duration = last.endTime - last.startTime

    // 最大表示時間チェック
    if (duration > config.maxDuration && autoFix) {
      last.endTime = last.startTime + config.maxDuration
    }

    // 最小表示時間チェック
    if (duration < config.minDuration && autoFix) {
      // 最後の字幕は後ろに延長できる
      last.endTime = last.startTime + config.minDuration
    }
  }

  return subtitles
}

// SRTコンテンツを生成
function generateSRTContent(subtitles: SubtitleEntry[]): string {
  let content = ''

  for (const subtitle of subtitles) {
    content += `${subtitle.index}\n`
    content += `${formatTimestampSRT(subtitle.startTime)} --> ${formatTimestampSRT(subtitle.endTime)}\n`
    content += subtitle.lines.join('\n')
    content += '\n\n'
  }

  return content
}

// VTTコンテンツを生成
function generateVTTContent(subtitles: SubtitleEntry[]): string {
  let content = 'WEBVTT\n\n'

  for (const subtitle of subtitles) {
    content += `${formatTimestampVTT(subtitle.startTime)} --> ${formatTimestampVTT(subtitle.endTime)}\n`
    content += subtitle.lines.join('\n')
    content += '\n\n'
  }

  return content
}

// 話者タグ付きSRTコンテンツを生成（Netflix形式）
function generateSRTContentWithSpeakers(
  subtitles: SubtitleEntry[],
  speakerMapping?: Record<string, string>,
  words?: TranscriptionWord[],
  speakerTagFormat: 'brackets' | 'dash' | 'colon' = 'brackets'
): string {
  let content = ''

  // 各字幕の話者を特定するためのヘルパー
  const getSpeakerForSubtitle = (subtitle: SubtitleEntry, index: number): string | undefined => {
    if (!words || !speakerMapping) return undefined
    
    // 字幕の時間範囲内にある最初の単語の話者を使用
    const wordInRange = words.find(
      w => w.start >= subtitle.startTime && w.start < subtitle.endTime && w.speaker
    )
    
    if (wordInRange?.speaker && speakerMapping[wordInRange.speaker]) {
      return speakerMapping[wordInRange.speaker]
    }
    return undefined
  }

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i]
    const speakerName = getSpeakerForSubtitle(subtitle, i)
    
    content += `${subtitle.index}\n`
    content += `${formatTimestampSRT(subtitle.startTime)} --> ${formatTimestampSRT(subtitle.endTime)}\n`
    
    // 話者タグを追加
    if (speakerName) {
      const lines = subtitle.lines.join('\n')
      switch (speakerTagFormat) {
        case 'brackets':
          content += `[${speakerName}] ${lines}`
          break
        case 'dash':
          content += `- ${speakerName}: ${lines}`
          break
        case 'colon':
          content += `${speakerName.toUpperCase()}: ${lines}`
          break
      }
    } else {
      content += subtitle.lines.join('\n')
    }
    content += '\n\n'
  }

  return content
}

export async function POST(request: NextRequest) {
  try {
    const body: SubtitleGenerationRequest = await request.json()
    const {
      words,
      settings,
      fps = 24,
      enableTimingValidation = true,
      autoFixViolations = true,
      includeSpeakerTags = false,
      speakerMapping
    } = body

    if (!words || words.length === 0) {
      return NextResponse.json(
        { error: 'Words array is required' },
        { status: 400 }
      )
    }

    const fpsVal = fps as FrameRate
    const lang = settings.language

    console.log(`[subtitle generate] ${words.length} words, lang=${lang}, fps=${fpsVal}`)

    let subtitles: SubtitleEntry[]
    let phase1Segments = 0
    let usedAIPipeline = false

    // ============================================================
    // 3フェーズAIパイプライン (APIキーがある場合)
    // ============================================================
    if (settings.lineBreakApiKey) {
      // Phase 1: AI一括セグメント分割
      console.log('[Phase1] AI segmentation starting...')
      const aiSegments = await aiSegmentText(words, settings, settings.lineBreakApiKey)

      if (aiSegments && aiSegments.length > 0) {
        phase1Segments = aiSegments.length
        usedAIPipeline = true
        console.log(`[Phase1] Got ${aiSegments.length} segments`)

        // Phase 2: タイムスタンプ割当
        console.log('[Phase2] Assigning timestamps...')
        let rawSubtitles = assignTimestamps(aiSegments, words, lang)

        // Phase 3: バッチ行分割最適化
        console.log('[Phase3] Batch line-break optimization...')
        rawSubtitles = await batchOptimizeLineBreaks(rawSubtitles, settings)

        // Phase 4: タイミング調整（既存ロジック）
        console.log('[Phase4] Adjusting timings...')
        subtitles = adjustSubtitleTimings(rawSubtitles, lang, fpsVal, autoFixViolations)
      } else {
        // Phase 1 失敗 → ルールベースフォールバック
        console.log('[Phase1] Falling back to rule-based segmentation')
        subtitles = await groupWordsIntoSubtitles(words, settings, fpsVal, autoFixViolations)
        phase1Segments = subtitles.length
      }
    } else {
      // APIキーなし: 既存ルールベース
      console.log('[generate] No API key, using rule-based pipeline')
      subtitles = await groupWordsIntoSubtitles(words, settings, fpsVal, autoFixViolations)
      phase1Segments = subtitles.length
    }

    console.log(`[generate] ${subtitles.length} subtitles generated`)

    // SRT / VTT 生成
    let srtContent: string
    if (includeSpeakerTags && speakerMapping) {
      srtContent = generateSRTContentWithSpeakers(subtitles, speakerMapping, words, 'brackets')
    } else {
      srtContent = generateSRTContent(subtitles)
    }
    const vttContent = generateVTTContent(subtitles)

    // タイミングバリデーション（既存）
    let timingValidation: SubtitleTimingValidation | undefined
    if (enableTimingValidation) {
      timingValidation = validateSubtitleTiming(subtitles, lang, fpsVal)
      console.log(`[timing validation] ${timingValidation.isValid ? 'PASSED' : 'FAILED'} (${timingValidation.errors} errors, ${timingValidation.warnings} warnings)`)
    }

    // Phase 5: AI包括検証（APIキーがある場合のみ）
    let aiValidation: SubtitleValidationResult | undefined
    if (settings.lineBreakApiKey && subtitles.length > 0) {
      console.log('[Phase5] AI holistic validation...')
      const validationResult = await validateSubtitlesWithAI(
        subtitles,
        lang,
        settings.lineBreakService,
        settings.lineBreakApiKey
      )
      if (validationResult) {
        aiValidation = validationResult
        console.log(`[Phase5] Score: ${aiValidation.overallScore}, errors: ${aiValidation.errorCount}, warnings: ${aiValidation.warningCount}`)
      }
    }

    const result = {
      success: true,
      subtitles,
      srtContent,
      vttContent,
      validation: timingValidation,
      aiValidation,
      generationStats: {
        phase1_segments: phase1Segments,
        phase3_batchSize: usedAIPipeline ? subtitles.length : 0,
        phase5_issues: aiValidation?.issues.length ?? 0,
        totalAICalls: usedAIPipeline ? 3 : 0,
      },
      timingConfig: TIMING_CONFIG[lang],
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Subtitle generation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Subtitle generation failed',
        subtitles: [],
        srtContent: '',
        vttContent: '',
      },
      { status: 500 }
    )
  }
}
