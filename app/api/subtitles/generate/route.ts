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
import { TranscriptionWord, SubtitleGenerationSettings, SubtitleEntry, SubtitleGenerationResult } from '@/lib/types'
import { formatTimestampSRT, formatTimestampVTT } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

interface SubtitleGenerationRequest {
  words: TranscriptionWord[]
  settings: SubtitleGenerationSettings
  language: 'en' | 'ja'
}

// 読み取り速度の定数（秒あたりの文字数）
const READING_SPEED = {
  en: 20, // 英語: 20 CPS (characters per second)
  ja: 4,  // 日本語: 4文字/秒
}

// タイミング制約
const TIMING = {
  minDuration: 0.833,  // 最小表示時間（秒）
  maxDuration: 7,      // 最大表示時間（秒）
  minGap: 0.083,       // 最小字幕間隔（2フレーム@24fps）
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

// 文脈を考慮した単語グループ化（字幕生成のコアロジック）
async function groupWordsIntoSubtitles(
  words: TranscriptionWord[],
  settings: SubtitleGenerationSettings
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
  return adjustSubtitleTimings(subtitles)
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
function adjustSubtitleTimings(subtitles: SubtitleEntry[]): SubtitleEntry[] {
  // === タイミング調整戦略（字幕レギュレーション準拠） ===
  // 1. 字幕間の最小間隔を確保（視覚的な区切りの明確化）
  // 2. 読み取り速度に基づく最小/最大表示時間の遵守
  // 3. 文脈の連続性を維持しつつ、視覚的な快適さを確保
  // 4. 前後の字幕との自然な流れを保つ

  for (let i = 0; i < subtitles.length - 1; i++) {
    const current = subtitles[i]
    const next = subtitles[i + 1]

    // === 字幕間のギャップ分析 ===
    const actualGap = next.startTime - current.endTime

    // 現在の字幕が次の字幕と重なっている、または間隔が短すぎる場合
    if (actualGap < TIMING.minGap) {
      // === 調整戦略1: 現在の字幕の終了時刻を調整 ===
      const originalEndTime = current.endTime
      current.endTime = next.startTime - TIMING.minGap

      // 調整後の表示時間が最小表示時間を下回るか確認
      const adjustedDuration = current.endTime - current.startTime

      if (adjustedDuration < TIMING.minDuration) {
        // === 調整戦略2: 開始時刻を前にずらす（前の字幕との兼ね合いを考慮） ===
        const adjustment = TIMING.minDuration - adjustedDuration

        if (i > 0) {
          const prev = subtitles[i - 1]
          const availableSpace = current.startTime - prev.endTime - TIMING.minGap
          const shift = Math.min(adjustment, Math.max(0, availableSpace))

          if (shift > 0) {
            current.startTime -= shift
          } else {
            // 前にずらせない場合は、次の字幕の開始時刻を調整
            const pushForward = adjustment - shift
            next.startTime = Math.min(next.startTime + pushForward, next.endTime - TIMING.minDuration)
            current.endTime = next.startTime - TIMING.minGap
          }
        } else {
          // 最初の字幕の場合は開始時刻を0.5秒前にずらす
          current.startTime = Math.max(0, current.startTime - adjustment)
        }
      }
    } else if (actualGap > 2.0) {
      // === ギャップが大きすぎる場合の処理（文脈の連続性を考慮） ===
      // 2秒以上のギャップがある場合、現在の字幕を少し延長して
      // 視覚的な繋がりを改善（ただし最大表示時間は超えない）
      const currentDuration = current.endTime - current.startTime
      const maxExtension = Math.min(
        TIMING.maxDuration - currentDuration,
        actualGap - TIMING.minGap * 2
      )

      if (maxExtension > 0) {
        // 最大1秒まで延長
        const extension = Math.min(maxExtension, 1.0)
        current.endTime += extension
      }
    }

    // === 最大表示時間の制限 ===
    const duration = current.endTime - current.startTime
    if (duration > TIMING.maxDuration) {
      current.endTime = current.startTime + TIMING.maxDuration
    }

    // === 読み取り速度に基づく表示時間の検証 ===
    // 各字幕が十分な読み取り時間を確保しているか確認
    const textLength = current.text.length
    const requiredDuration = textLength / READING_SPEED.en // 汎用的な計算
    const finalDuration = current.endTime - current.startTime

    if (finalDuration < requiredDuration * 0.7) {
      // 表示時間が不足している場合、可能な範囲で延長
      const neededExtension = requiredDuration * 0.7 - finalDuration
      const maxPossibleExtension = next.startTime - TIMING.minGap - current.endTime

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
    if (duration > TIMING.maxDuration) {
      last.endTime = last.startTime + TIMING.maxDuration
    }

    // 最小表示時間チェック
    if (duration < TIMING.minDuration) {
      // 最後の字幕は後ろに延長できる
      last.endTime = last.startTime + TIMING.minDuration
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

export async function POST(request: NextRequest) {
  try {
    const body: SubtitleGenerationRequest = await request.json()
    const { words, settings } = body

    if (!words || words.length === 0) {
      return NextResponse.json(
        { error: 'Words array is required' },
        { status: 400 }
      )
    }

    if (!settings.lineBreakApiKey) {
      console.log('No API key provided, will use fallback line breaking')
    }

    console.log(`Generating subtitles for ${words.length} words...`)

    // 単語を字幕エントリにグループ化
    const subtitles = await groupWordsIntoSubtitles(words, settings)

    // SRTとVTTコンテンツを生成
    const srtContent = generateSRTContent(subtitles)
    const vttContent = generateVTTContent(subtitles)

    console.log(`Generated ${subtitles.length} subtitle entries`)

    const result: SubtitleGenerationResult = {
      success: true,
      subtitles,
      srtContent,
      vttContent,
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
