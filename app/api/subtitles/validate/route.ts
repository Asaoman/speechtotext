import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { SubtitleEntry, SubtitleValidationResult, SubtitleValidationIssue } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ValidateRequest {
  subtitles: SubtitleEntry[]
  language: 'en' | 'ja'
  service: 'chatgpt' | 'claude' | 'gemini'
  apiKey: string
  model?: string
}

function buildValidationPrompt(subtitles: SubtitleEntry[], language: 'en' | 'ja'): string {
  const subtitleList = subtitles.map(s => {
    const lines = s.lines.join('\n  ')
    return `#${s.index}: ${lines}`
  }).join('\n')

  if (language === 'ja') {
    return `あなたは字幕品質検証の専門家です。以下の字幕セット全体を通し読みして品質問題を検出してください。

## 検証する字幕

${subtitleList}

---

## 検証項目

### A. カットポイント検証（字幕の切れ目が適切か）

以下の問題を検出せよ:
1. **文中断切り** (error): 文の途中で字幕が切れている（「英語か英語じゃない」→「かでもう」のように）
2. **主語/述語の分断** (error): 主語が前の字幕に、述語が次の字幕に
3. **助詞・接続詞のみの字幕** (warning): 「でも」「しかし」など1〜2語だけの字幕
4. **異常な短さ** (warning): 2文字以下の字幕

### B. 行分割検証（改行位置が適切か）

以下の問題を検出せよ:
1. **助詞で行開始** (error): 「は」「が」「を」「に」「で」等で行が始まる
2. **固有名詞の分断** (error): カタカナ語が行をまたいで分割されている（「パラノーマルアク」/「ティビティ」等）
3. **視覚的不均衡** (warning): 上行と下行の文字数差が10文字以上

### C. 連続性の問題

以下の問題を検出せよ:
1. **唐突な話題転換** (info): 前後の字幕と意味的に断絶している

---

## 出力形式（JSONのみ、コードブロックなし）

{
  "issues": [
    {
      "subtitleIndex": 3,
      "type": "cutpoint",
      "severity": "error",
      "message": "文の途中で切れている: 「英語か英語じゃない」で終わり、次の字幕「かでもう...」と繋がる",
      "suggestion": "前後の字幕を結合して「英語か英語じゃないかでもう興行収入がまるで違う」とする",
      "affectsIndices": [3, 4]
    }
  ],
  "overallScore": 85,
  "summary": "全体的な品質は良好。3件のエラーを修正すると大幅に改善される。"
}`
  } else {
    return `You are a subtitle quality validation expert. Review the following subtitle set holistically and detect quality issues.

## Subtitles to validate

${subtitleList}

---

## Validation criteria

### A. Cut-point validation

Detect:
1. **Mid-sentence cut** (error): Subtitle ends in the middle of a sentence
2. **Subject/predicate split** (error): Subject in one subtitle, predicate in next
3. **Single-word subtitle** (warning): Only a conjunction or article alone
4. **Abnormally short** (warning): 2 characters or fewer

### B. Line-break validation

Detect:
1. **Article at line start** (error): Line begins with a/an/the/in/of/to etc.
2. **Proper noun split** (error): Proper name split across two lines
3. **Visual imbalance** (warning): Line length difference > 15 chars

### C. Continuity

Detect:
1. **Abrupt topic shift** (info): Content disconnected from surrounding subtitles

---

## Output format (JSON only, no code blocks)

{
  "issues": [
    {
      "subtitleIndex": 3,
      "type": "cutpoint",
      "severity": "error",
      "message": "Mid-sentence cut: subtitle ends with 'Paranormal' while next starts with 'Activity'",
      "suggestion": "Merge #3 and #4 into one subtitle",
      "affectsIndices": [3, 4]
    }
  ],
  "overallScore": 85,
  "summary": "Overall quality is good. Fixing 3 errors will significantly improve the result."
}`
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ValidateRequest = await request.json()
    const { subtitles, language, apiKey, model } = body

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'APIキーが必要です' },
        { status: 400 }
      )
    }

    if (!subtitles || subtitles.length === 0) {
      const result: SubtitleValidationResult = {
        issues: [],
        overallScore: 100,
        passedCount: 0,
        warningCount: 0,
        errorCount: 0,
      }
      return NextResponse.json(result)
    }

    const actualModel = model || 'gemini-2.5-flash'
    const genAI = new GoogleGenerativeAI(apiKey)
    const geminiModel = genAI.getGenerativeModel({ model: actualModel })

    const prompt = buildValidationPrompt(subtitles, language || 'ja')

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })

    const rawText = result.response.text().trim()

    let issues: SubtitleValidationIssue[] = []
    let overallScore = 100

    try {
      const parsed = JSON.parse(rawText)

      if (typeof parsed.overallScore === 'number') {
        overallScore = Math.max(0, Math.min(100, parsed.overallScore))
      }

      const VALID_TYPES = ['cutpoint', 'linebreak', 'continuity', 'length']
      const VALID_SEVERITIES = ['error', 'warning', 'info']

      if (Array.isArray(parsed.issues)) {
        issues = parsed.issues
          .filter((item: any) =>
            typeof item.subtitleIndex === 'number' &&
            VALID_TYPES.includes(item.type) &&
            VALID_SEVERITIES.includes(item.severity) &&
            typeof item.message === 'string'
          )
          .map((item: any): SubtitleValidationIssue => ({
            subtitleIndex: item.subtitleIndex,
            type: item.type as SubtitleValidationIssue['type'],
            severity: item.severity as SubtitleValidationIssue['severity'],
            message: item.message,
            suggestion: item.suggestion || undefined,
            affectsIndices: Array.isArray(item.affectsIndices) ? item.affectsIndices : undefined,
          }))
      }
    } catch {
      console.error('[subtitles/validate] JSON parse error, raw:', rawText)
    }

    const errorCount = issues.filter(i => i.severity === 'error').length
    const warningCount = issues.filter(i => i.severity === 'warning').length
    const passedCount = subtitles.length - new Set(issues.map(i => i.subtitleIndex)).size

    const validationResult: SubtitleValidationResult = {
      issues,
      overallScore,
      passedCount: Math.max(0, passedCount),
      warningCount,
      errorCount,
    }

    return NextResponse.json(validationResult)
  } catch (error: any) {
    console.error('[subtitles/validate] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Validation failed' },
      { status: 500 }
    )
  }
}
