import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const runtime = 'nodejs'
export const maxDuration = 120

interface Segment {
  start: number
  end: number
  text: string
}

interface Correction {
  original: string
  suggestion: string
}

interface AIGenerateRequest {
  segments: Segment[]
  corrections?: Correction[]
  maxCharsPerLine: number
  maxLines: number
  language: 'ja' | 'en'
  context?: string
  apiKey: string
  model?: string
}

interface SubtitleEntry {
  index: number
  start: number
  end: number
  lines: string[]
}

const MODEL_MIGRATIONS: Record<string, string> = {
  'gemini-3-flash-preview': 'gemini-2.5-flash',
  'gemini-3.1-pro-preview': 'gemini-2.5-pro',
  'gemini-1.5-flash': 'gemini-2.5-flash-lite',
  'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash',
}

function buildPrompt(
  segments: Segment[],
  corrections: Correction[],
  maxCharsPerLine: number,
  maxLines: number,
  language: 'ja' | 'en',
  context?: string
): string {
  const contextSection = context?.trim()
    ? `## コンテキスト（音声の内容・背景）\n${context.trim()}\n\n`
    : ''

  const correctionSection =
    corrections.length > 0
      ? `## 校正修正（必ず適用せよ）\n${corrections
          .map((c) => `- "${c.original}" → "${c.suggestion}"`)
          .join('\n')}\n\n`
      : ''

  const segmentsJson = JSON.stringify(
    segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
    null,
    2
  )

  if (language === 'ja') {
    return `あなたは映像字幕の専門編集者です。
音声認識セグメントを映画・放送業界標準の字幕に変換してください。

${contextSection}${correctionSection}## セグメントデータ（JSON）
${segmentsJson}

## 字幕作成ルール

### テキスト校正
- 上記の「校正修正」をすべて適用すること
- コンテキストを参考に固有名詞・専門用語を正確に表記すること
- 明らかな音声認識誤りがあれば自然な文脈に修正すること

### 字幕の分割・結合
- 1つのセグメントが長すぎる場合（目安: 読み上げ時間 > 4秒 or 文字数 > ${maxCharsPerLine * maxLines * 2}文字）は複数の字幕に分割
- 短いセグメント（< 1秒）は隣接するセグメントと結合可
- 意味のまとまりを優先して分割・結合を判断すること

### 改行ルール（最重要）
- 1行あたり最大${maxCharsPerLine}文字、最大${maxLines}行
- **文節の区切りで改行すること**（例: 「映画を/見てください」ではなく「映画を見て/ください」）
- **助詞・助動詞は必ず前の単語と同じ行に置くこと**（「が」「は」「を」「に」「で」「の」「と」「も」「か」「ね」「よ」など）
- **複合語・固有名詞・人名は絶対に分割しないこと**
- **接続詞は次の文と同じ行に置くこと**（「そして」「だから」「でも」「しかし」など）
- 読点（、）の直後は改行してよい
- 句点（。）で字幕を終わらせてもよい

### タイムスタンプ
- 各字幕のstart/endはセグメントの時間範囲内に収めること
- 分割した場合はセグメント時間を均等に配分すること
- 結合した場合は最初のstart〜最後のendを使うこと

## 出力形式（JSONのみ、コードブロックなし）

[
  {"index": 1, "start": 0.0, "end": 2.5, "lines": ["1行目テキスト", "2行目テキスト"]},
  {"index": 2, "start": 2.5, "end": 5.0, "lines": ["テキスト"]},
  ...
]`
  } else {
    return `You are a professional subtitle editor following Netflix/BBC industry standards.
Convert the following speech recognition segments into properly formatted subtitles.

${contextSection}${correctionSection}## Segment Data (JSON)
${segmentsJson}

## Subtitle Rules

### Text Correction
- Apply all corrections listed above
- Fix obvious speech recognition errors based on context

### Splitting & Merging
- Split long segments (> 4 seconds or > ${maxCharsPerLine * maxLines * 2} chars) into multiple subtitles
- Merge very short segments (< 1 second) with adjacent ones
- Prioritize meaning and natural speech rhythm

### Line Break Rules (Critical)
- Maximum ${maxCharsPerLine} characters per line, maximum ${maxLines} lines
- Break at grammatical boundaries (after conjunctions, before prepositions)
- Never split compound words, proper nouns, or names
- Keep articles with their nouns (e.g., keep "the" with the following noun)
- Prefer "bottom-heavy" layout (shorter top line, longer bottom line)

### Timestamps
- Keep start/end within the source segment time range
- Distribute time evenly when splitting
- Use first start to last end when merging

## Output Format (JSON only, no code blocks)

[
  {"index": 1, "start": 0.0, "end": 2.5, "lines": ["Line 1 text", "Line 2 text"]},
  {"index": 2, "start": 2.5, "end": 5.0, "lines": ["Text"]},
  ...
]`
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AIGenerateRequest = await request.json()
    const { segments, corrections = [], maxCharsPerLine, maxLines, language, context, apiKey, model } = body

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'APIキーが必要です' }, { status: 400 })
    }
    if (!segments || segments.length === 0) {
      return NextResponse.json({ success: false, error: 'セグメントデータが必要です' }, { status: 400 })
    }

    const rawModel = model || 'gemini-2.5-flash'
    const actualModel = MODEL_MIGRATIONS[rawModel] ?? rawModel

    const genAI = new GoogleGenerativeAI(apiKey)
    const geminiModel = genAI.getGenerativeModel({ model: actualModel })

    const prompt = buildPrompt(segments, corrections, maxCharsPerLine, maxLines, language || 'ja', context)

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })

    const rawText = result.response.text().trim()

    let subtitles: SubtitleEntry[] = []
    try {
      const parsed = JSON.parse(rawText)
      if (Array.isArray(parsed)) {
        subtitles = parsed
          .filter(
            (item: any) =>
              typeof item.index === 'number' &&
              typeof item.start === 'number' &&
              typeof item.end === 'number' &&
              Array.isArray(item.lines) &&
              item.lines.every((l: any) => typeof l === 'string')
          )
          .map((item: any, i: number) => ({
            index: i + 1,
            start: item.start,
            end: item.end,
            lines: item.lines.filter((l: string) => l.trim()),
          }))
      }
    } catch {
      console.error('[ai-generate] JSON parse error, raw:', rawText.slice(0, 200))
      return NextResponse.json({ success: false, error: 'AIレスポンスのパースに失敗しました' }, { status: 500 })
    }

    if (subtitles.length === 0) {
      return NextResponse.json({ success: false, error: '字幕データを生成できませんでした' }, { status: 500 })
    }

    return NextResponse.json({ success: true, subtitles })
  } catch (error: any) {
    console.error('[ai-generate] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
