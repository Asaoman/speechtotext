import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { MovieSubtitleEntry, ExtractedProperNoun, SubtitleProofreadIssue } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ProofreadRequest {
  subtitles: MovieSubtitleEntry[]
  language: 'ja' | 'en'
  properNouns: ExtractedProperNoun[]
  apiKey: string
  model?: string
}

function buildProofreadPrompt(
  subtitles: MovieSubtitleEntry[],
  language: 'ja' | 'en',
  properNouns: ExtractedProperNoun[]
): string {
  const approvedNouns = properNouns.filter((n) => n.approved)

  const subtitleList = subtitles
    .map((s, i) => {
      const lines = s.lines && s.lines.length > 0 ? s.lines : [s.text]
      return `[${i + 1}] (${s.startTime.toFixed(2)}s → ${s.endTime.toFixed(2)}s)\n${lines.join('\n')}`
    })
    .join('\n\n')

  const nounList =
    approvedNouns.length > 0
      ? approvedNouns
          .map(
            (n) =>
              `- ${n.term}${n.reading ? ` (${n.reading})` : ''}${n.variants.length > 0 ? ` [表記ゆれ: ${n.variants.join(', ')}]` : ''}`
          )
          .join('\n')
      : '（なし）'

  if (language === 'ja') {
    return `あなたはプロの字幕校正者です。以下の字幕エントリを3つの観点から徹底的に検証してください。

## 承認済み固有名詞リスト
${nounList}

## 字幕エントリ一覧
${subtitleList}

## 検証の観点

### 1. 改行校正 (linebreak)
各エントリの改行位置が日本語として自然かを確認。以下は改行NG例：
- 助詞（は、が、を、に、へ、と、から、より、で、や、の、も）の直前での改行
- 接続詞（しかし、そして、また、それで）の直前での改行
- 固有名詞・人名の途中での改行
- 数字＋単位の間での改行（「5 分」など）

### 2. カット点校正 (cutpoint)
連続するエントリ間（[n]→[n+1]）の分割点が文脈・意味的に自然かを確認。以下は問題例：
- 文章が途中で不自然に分断されている（例：主語と述語が別エントリに分かれている）
- 同一発話が不自然なタイミングで分割されている
- 前後エントリが結合したほうが自然な場合

### 3. 固有名詞照合 (properNoun)
承認済み固有名詞リストと字幕テキストを照合：
- リスト内の固有名詞が字幕に出現するが、スペル・表記が異なる場合
- 表記ゆれ（バリアント）が承認されていない形で使用されている場合

## 出力形式
問題が見つかった場合のみ、以下のJSON配列を返してください。問題がなければ空配列 [] を返してください。
コードブロックなし、JSONのみ出力すること。

[
  {
    "subtitleIndex": <エントリ番号（1始まり）>,
    "type": "linebreak" | "cutpoint" | "properNoun",
    "severity": "error" | "warning",
    "message": "<問題の説明（日本語）>",
    "suggestion": "<修正案テキスト（改行は\\nで表現、省略可）>"
  }
]`
  } else {
    return `You are a professional subtitle proofreader. Review the following subtitle entries from three perspectives.

## Approved Proper Nouns
${nounList}

## Subtitle Entries
${subtitleList}

## Review Criteria

### 1. Line Break Proofreading (linebreak)
Check if line breaks within each entry are linguistically natural:
- Never break after articles (a, an, the)
- Never break subject/verb or verb/object
- Never break within proper nouns or names
- Never break between number and unit

### 2. Cut Point Proofreading (cutpoint)
Check if the split between consecutive entries [n]→[n+1] is natural:
- Sentence broken unnaturally mid-clause
- Subject and predicate split across entries
- Two entries that would read more naturally combined

### 3. Proper Noun Matching (properNoun)
Compare subtitle text against the approved proper noun list:
- Proper noun appears in subtitle but spelling differs from approved form
- Unapproved variant used instead of approved term

## Output Format
Return ONLY a JSON array of issues found. If no issues, return [].
No code blocks, JSON only.

[
  {
    "subtitleIndex": <entry number (1-based)>,
    "type": "linebreak" | "cutpoint" | "properNoun",
    "severity": "error" | "warning",
    "message": "<description of the issue>",
    "suggestion": "<suggested corrected text (use \\n for line breaks, optional)>"
  }
]`
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ProofreadRequest = await request.json()
    const { subtitles, language, properNouns, apiKey, model } = body

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'APIキーが必要です', issues: [] },
        { status: 400 }
      )
    }

    if (!subtitles || subtitles.length === 0) {
      return NextResponse.json({ success: true, issues: [] })
    }

    const actualModel = model || 'gemini-3-flash-preview'
    const genAI = new GoogleGenerativeAI(apiKey)
    const geminiModel = genAI.getGenerativeModel({ model: actualModel })

    const prompt = buildProofreadPrompt(subtitles, language || 'ja', properNouns || [])

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })

    const rawText = result.response.text().trim()

    let issues: SubtitleProofreadIssue[] = []
    try {
      const parsed = JSON.parse(rawText)
      if (Array.isArray(parsed)) {
        issues = parsed.filter(
          (item): item is SubtitleProofreadIssue =>
            typeof item.subtitleIndex === 'number' &&
            ['linebreak', 'cutpoint', 'properNoun'].includes(item.type) &&
            ['error', 'warning'].includes(item.severity) &&
            typeof item.message === 'string'
        )
      }
    } catch {
      console.error('[proofread] JSON parse error, raw:', rawText)
    }

    return NextResponse.json({ success: true, issues })
  } catch (error: any) {
    console.error('[proofread] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error', issues: [] },
      { status: 500 }
    )
  }
}
