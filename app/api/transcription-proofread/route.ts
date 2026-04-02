import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { TranscriptionProofreadIssue, DetectedNoun, ProperNounCategory } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface GlobalNoun {
  term: string
  reading?: string
  category: string
}

interface ProofreadRequest {
  text: string
  language: 'ja' | 'en'
  globalNouns: GlobalNoun[]
  apiKey: string
  model?: string
  context?: string
}

function buildPrompt(text: string, language: 'ja' | 'en', globalNouns: GlobalNoun[], context?: string): string {
  const nounList =
    globalNouns.length > 0
      ? globalNouns
          .map((n) => `- ${n.term}${n.reading ? ` (${n.reading})` : ''} [${n.category}]`)
          .join('\n')
      : '（なし）'

  const contextSection = context?.trim()
    ? `\n## 分析コンテキスト（音声の背景情報 — 精度向上のために活用せよ）\n${context.trim()}\n`
    : ''

  if (language === 'ja') {
    return `あなたは音声書き起こしテキストの校正・固有名詞検出エキスパートです。
以下の書き起こしテキストに対して、3つのタスクを同時に実行してください。
${contextSection}
## 既知の固有名詞リスト（isNew判定に使用）
${nounList}

## 書き起こしテキスト
${text}

---

## タスク1: コンテキスト自動検出

テキスト全体を読み、「何についての音声か」を50〜100文字で簡潔に記述せよ。
例: "映画監督インタビュー。低予算ホラー映画の興行収入・制作手法について話している。"
例: "IT企業の会議。新製品ロードマップとエンジニアリング体制について議論している。"

---

## タスク2: 音声認識の誤認識を検出・修正

### 検出対象（以下のパターンに限る）

1. **固有名詞の音韻崩壊**: 映画タイトル・人名・作品名・製品名が音声上で崩れたもの
   - 例: "カミトミ" → "カメ止め（カメラを止めるな！）" ← 映画タイトルの崩れ
   - 例: "マトリクス" → "マトリックス" ← 正式表記への修正
   - 例: "ブリーウィッチ" → "ブレア・ウィッチ" ← 映画タイトルの崩れ

2. **同音異義語（文脈上で明らかに誤り）**
   - 例: テック系の話で「会社の核心」→「会社の革新」

3. **外来語・固有名詞の片仮名誤り**
   - 例: "アクティビリティ" → "アクティビティ"

### 検出しないもの（以下は返すな）

- フィラー語（「えーと」「あのー」「なんか」「そういう」）
- 文法・表現が気になるだけで意味が通じるもの
- 確信度が 0.65 未満のもの
- テキスト中に存在しない語（必ず original はテキスト内の語）

### 重要ルール

- **originalはテキスト中に完全一致で存在する語句のみ**
- **確信度 0.65 未満は返すな**（false positive を防ぐ）
- コンテキスト（タスク1で検出した内容）を最大限活用して推定精度を上げよ

---

## タスク3: 固有名詞の検出と正規化

### 抽出対象（固有名詞 = 世界に唯一存在する特定の名前）
- **person**: 実在の人名・キャラクター名（例: 浅尾、スピルバーグ、クエンティン・タランティーノ）
- **place**: 実在の地名・施設名（例: 渋谷、ハリウッド）
- **organization**: 実在の会社名・団体名・ブランド名（例: Apple、NHK）
- **work**: 実在の作品タイトル（例: パラノーマル・アクティビティ、カメラを止めるな！）
- **technical**: 登録商標・固有の製品/サービス名（例: iPhone、YouTube、ChatGPT）

### 抽出しないもの（一般名詞は除外）
- 職業・役職（映像制作者、監督、プロデューサー）
- 一般的な業種・業界語（プロダクション、制作会社）
- 概念・カテゴリ（長編映画、低予算映画）

### 正規化ルール（termフィールド）

- 正式・標準的な表記を使用せよ
  - "youtube" → "YouTube"、"iphone" → "iPhone"、"zoom" → "Zoom"
  - 映画タイトルは正式な日本語公開タイトル
  - ブランド・サービス名は登録商標の正式表記
- **termに対応する語は必ずテキスト中に（部分一致・case-insensitiveでも）存在すること**
- 同じ語が複数回出ても1件として返す

---

## 出力形式（JSONのみ、コードブロックなし）

{
  "detectedContext": "自動検出したコンテキスト（50〜100文字）",
  "issues": [
    {
      "original": "テキスト中の誤認識語（完全一致）",
      "type": "misrecognition" | "homophone" | "properNoun" | "context",
      "severity": "error" | "warning",
      "message": "なぜ誤りと判定したかの説明（日本語）",
      "suggestion": "修正候補",
      "confidence": 0.65から1.0の数値
    }
  ],
  "detectedNouns": [
    {
      "term": "正式名称の固有名詞",
      "reading": "ふりがな（省略可）",
      "category": "person" | "place" | "organization" | "work" | "technical",
      "context": "前後の文脈（30文字程度）",
      "confidence": 0.5から1.0の数値,
      "isNew": true | false
    }
  ]
}`
  } else {
    return `You are an expert at proofreading and detecting proper nouns in speech transcription text.
Perform all 3 tasks simultaneously for the transcription below.
${contextSection}
## Known Proper Nouns (for isNew determination)
${nounList}

## Transcription Text
${text}

---

## Task 1: Auto-detect Context

Read the full text and describe in 1-2 sentences what this audio is about.
Example: "Film director interview. Discussing low-budget horror film production and box office performance."

---

## Task 2: Detect and Correct Misrecognitions

### What to detect (these patterns only)

1. **Garbled proper nouns**: Film/product/person names mangled by speech recognition
   - e.g. "paranormal activity" correctly recognized; "blair witch" garbled to "blair witch project" ← already correct
   - e.g. "matix" → "The Matrix" ← garbled film title
   - e.g. "apol" → "Apple" ← brand name garbled

2. **Homophones that are clearly wrong in context**

3. **Foreign name transcription errors**

### Do NOT return

- Filler words (uh, um, like, you know)
- Style issues that don't affect meaning
- Anything with confidence < 0.65
- Words not present verbatim in the text

### Rules

- **original must be an exact substring of the transcription text**
- **confidence < 0.65: do not return** (prevent false positives)
- Use the auto-detected context (Task 1) to improve accuracy

---

## Task 3: Detect and Normalize Proper Nouns

### What to extract
- **person**: Real person/character names (e.g., Spielberg, Tarantino)
- **place**: Real place names (e.g., Tokyo, Hollywood)
- **organization**: Real company/brand names (e.g., Apple, Netflix)
- **work**: Real titles of films/books/shows (e.g., Star Wars, Paranormal Activity)
- **technical**: Registered trademarks, specific product/service names (e.g., iPhone, YouTube)

### Normalization
- Use official canonical spelling: "YOUTUBE" → "YouTube", "iphone" → "iPhone"
- **term must correspond to a word in the text (case-insensitive partial match OK)**

---

## Output Format (JSON only, no code blocks)

{
  "detectedContext": "auto-detected context (1-2 sentences)",
  "issues": [
    {
      "original": "exact substring from text",
      "type": "misrecognition" | "homophone" | "properNoun" | "context",
      "severity": "error" | "warning",
      "message": "why this is likely a misrecognition",
      "suggestion": "corrected form",
      "confidence": number 0.65 to 1.0
    }
  ],
  "detectedNouns": [
    {
      "term": "canonical proper noun name",
      "reading": "pronunciation (optional)",
      "category": "person" | "place" | "organization" | "work" | "technical",
      "context": "surrounding context (~30 chars)",
      "confidence": number 0.5 to 1.0,
      "isNew": true | false
    }
  ]
}`
  }
}

const VALID_CATEGORIES: ProperNounCategory[] = [
  'person', 'place', 'organization', 'work', 'technical', 'other',
]
const VALID_ISSUE_TYPES = ['misrecognition', 'homophone', 'properNoun', 'filler', 'context', 'punctuation']
const VALID_SEVERITIES = ['error', 'warning', 'info']

export async function POST(request: NextRequest) {
  try {
    const body: ProofreadRequest = await request.json()
    const { text, language, globalNouns, apiKey, model, context } = body

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'APIキーが必要です', issues: [], detectedNouns: [] },
        { status: 400 }
      )
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ success: true, issues: [], detectedNouns: [] })
    }

    const MODEL_MIGRATIONS: Record<string, string> = {
      'gemini-3-flash-preview': 'gemini-2.5-flash',
      'gemini-3.1-pro-preview': 'gemini-2.5-pro',
      'gemini-3-pro-preview': 'gemini-2.5-pro',
      'gemini-1.5-flash': 'gemini-2.5-flash-lite',
      'gemini-1.5-flash-latest': 'gemini-2.5-flash-lite',
      'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash',
    }
    const rawModel = model || 'gemini-2.5-flash'
    const actualModel = MODEL_MIGRATIONS[rawModel] ?? rawModel
    if (rawModel !== actualModel) console.log(`[transcription-proofread] model migration: ${rawModel} -> ${actualModel}`)
    const genAI = new GoogleGenerativeAI(apiKey)
    const geminiModel = genAI.getGenerativeModel({ model: actualModel })

    const prompt = buildPrompt(text, language || 'ja', globalNouns || [], context)

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })

    const rawText = result.response.text().trim()

    let issues: TranscriptionProofreadIssue[] = []
    let detectedNouns: DetectedNoun[] = []
    let detectedContext: string | undefined

    try {
      const parsed = JSON.parse(rawText)

      if (typeof parsed.detectedContext === 'string' && parsed.detectedContext.trim()) {
        detectedContext = parsed.detectedContext.trim()
      }

      if (Array.isArray(parsed.issues)) {
        issues = parsed.issues.filter(
          (item: any): item is TranscriptionProofreadIssue =>
            typeof item.original === 'string' &&
            VALID_ISSUE_TYPES.includes(item.type) &&
            VALID_SEVERITIES.includes(item.severity) &&
            typeof item.message === 'string' &&
            typeof item.confidence === 'number' &&
            item.confidence >= 0.65
        )
      }

      if (Array.isArray(parsed.detectedNouns)) {
        detectedNouns = parsed.detectedNouns
          .filter(
            (item: any) =>
              typeof item.term === 'string' &&
              VALID_CATEGORIES.includes(item.category) &&
              typeof item.confidence === 'number' &&
              typeof item.isNew === 'boolean'
          )
          .map((item: any): DetectedNoun => ({
            term: item.term,
            reading: item.reading || undefined,
            category: item.category as ProperNounCategory,
            context: item.context || '',
            confidence: item.confidence,
            isNew: item.isNew,
          }))
      }
    } catch {
      console.error('[transcription-proofread] JSON parse error, raw:', rawText)
    }

    return NextResponse.json({ success: true, detectedContext, issues, detectedNouns })
  } catch (error: any) {
    console.error('[transcription-proofread] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error', issues: [], detectedNouns: [] },
      { status: 500 }
    )
  }
}
