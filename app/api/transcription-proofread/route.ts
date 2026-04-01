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
    ? `\n## 分析コンテキスト（音声の背景情報）\n${context.trim()}\n`
    : ''

  if (language === 'ja') {
    return `あなたは音声書き起こしテキストの固有名詞検出・校正エキスパートです。
${contextSection}
## 既知の固有名詞リスト
${nounList}

## 書き起こしテキスト
${text}

## タスク：固有名詞のみを抽出してください

### 抽出対象（固有名詞 = 世界に唯一存在する特定の名前）
- **person**: 実在の人名・キャラクター名（例: 浅尾、スピルバーグ、クエンティン・タランティーノ）
- **place**: 実在の地名・施設名（例: 渋谷、アメリカ、六本木ヒルズ）
- **organization**: 実在の会社名・団体名・ブランド名（例: Apple、NHK、4S）
- **work**: 実在の作品タイトル（例: パラノーマル・アクティビティ、スター・ウォーズ）
- **technical**: 登録商標・固有の製品/サービス名（例: iPhone、WhisperX、ChatGPT、YouTube）

### 抽出しないもの（一般名詞・業界用語・概念は除外）
- 職業・役職（映像制作者、カメラマン、プロデューサー）
- 一般的な業種・業界語（プロダクション、制作会社、映画業界）
- 概念・カテゴリ（長編映画、低予算映画、ドキュメンタリー）
- 一般動詞・形容詞・副詞
- 曖昧でどの固有名詞か特定できないもの

### 重要：正式名称の使用
- **termフィールドには必ず正式・標準的な表記を使用せよ**。音声認識の誤りや全大文字を修正すること
  - 例: "YOUTUBE" → "YouTube"、"IPHONE" → "iPhone"、"ぐーぐる" → "Google"
  - 映画タイトルは正式な日本語公開タイトル（例: "スパイダーマン", "キル・ビル"）
  - 人名は一般的に認知されている正式名称（例: "タランティーノ" → "クエンティン・タランティーノ"、略称でよければ"タランティーノ"）
  - ブランド・サービス名は登録商標の正式大文字小文字（YouTube, iPhone, ZOOM など）
- 音声テキストに出現している語形を termとせず、あなたの知識に基づいて正式名称を判断せよ
- **ただし termに対応する語は必ずテキスト中に（部分一致でも）存在すること。テキストに全く登場しない固有名詞は返すな**

### その他の重要ルール
- 同じ語が複数回出ても1件として返す
- 確信度(confidence)は「これは実在する固有名詞である」という確信度（0.0〜1.0）
- 既知リストに存在するものは isNew: false、ないものは isNew: true
- **タイムコード・タイムスタンプ（00:00:00,000 --> 00:00:02,000 形式）は入力テキストに含まれないが、含まれていても一切出力に含めるな**
- **入力テキストそのものを変更・修正・要約するな。固有名詞リストのみを返せ**

## 出力形式（JSONのみ、コードブロックなし）

{
  "issues": [],
  "detectedNouns": [
    {
      "term": "正式名称の固有名詞",
      "reading": "ふりがな（省略可）",
      "category": "person" | "place" | "organization" | "work" | "technical",
      "context": "前後の文脈（30文字程度、テキスト中の実際の表記）",
      "confidence": 0.0から1.0の数値,
      "isNew": true | false
    }
  ]
}`
  } else {
    return `You are an expert at detecting and verifying proper nouns in speech transcription text.
${contextSection}
## Known Proper Nouns (already registered)
${nounList}

## Transcription Text
${text}

## Task: Extract proper nouns ONLY

### What to extract (proper nouns = names that uniquely identify a specific real-world entity)
- **person**: Real person names or character names (e.g., Spielberg, Quentin Tarantino)
- **place**: Real place names, facility names (e.g., Tokyo, Hollywood, Sundance)
- **organization**: Real company, group, or brand names (e.g., Apple, Netflix, 4S)
- **work**: Real titles of films, books, shows (e.g., Star Wars, Paranormal Activity)
- **technical**: Registered trademarks, specific product/service names (e.g., iPhone, WhisperX, ChatGPT, YouTube)

### What NOT to extract (common nouns, industry terms, concepts — exclude these)
- Job titles and roles (director, cinematographer, producer, crew)
- General industry terms (production company, film industry, low-budget)
- Concepts and categories (feature film, documentary, indie film)
- Generic verbs, adjectives, adverbs
- Anything ambiguous that cannot be identified as a specific real entity

### Important: Use canonical names
- **term field MUST use the official/standard spelling** based on your training knowledge
  - e.g., "YOUTUBE" → "YouTube", "IPHONE" → "iPhone"
  - Movie titles in their official English title
  - Brand/service names in their registered trademark casing (YouTube, iPhone, ZOOM, etc.)
- Do NOT use the transcription's surface form if it differs from the canonical spelling
- **The term must correspond to a word actually present in the text (at least partial match)**. Do not hallucinate proper nouns not in the text.

### Other rules
- Return each unique term only once even if it appears multiple times
- confidence = how certain you are this is a real, specific proper noun (0.0–1.0)
- isNew: false if in the known list, true if not
- **Do NOT include timecodes or timestamps in output. Do NOT modify, correct, or summarize the input text. Return only the proper noun list.**

## Output Format (JSON only, no code blocks)

{
  "issues": [],
  "detectedNouns": [
    {
      "term": "canonical proper noun name",
      "reading": "pronunciation (optional)",
      "category": "person" | "place" | "organization" | "work" | "technical",
      "context": "surrounding context from text (~30 chars)",
      "confidence": number between 0.0 and 1.0,
      "isNew": true | false
    }
  ]
}`
  }
}

const VALID_CATEGORIES: ProperNounCategory[] = [
  'person', 'place', 'organization', 'work', 'technical', 'other',
]
const VALID_ISSUE_TYPES = ['homophone', 'properNoun', 'filler', 'context', 'punctuation']
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

    const actualModel = model || 'gemini-3-flash-preview'
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

    try {
      const parsed = JSON.parse(rawText)

      if (Array.isArray(parsed.issues)) {
        issues = parsed.issues.filter(
          (item: any): item is TranscriptionProofreadIssue =>
            typeof item.original === 'string' &&
            VALID_ISSUE_TYPES.includes(item.type) &&
            VALID_SEVERITIES.includes(item.severity) &&
            typeof item.message === 'string' &&
            typeof item.confidence === 'number'
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

    return NextResponse.json({ success: true, issues, detectedNouns })
  } catch (error: any) {
    console.error('[transcription-proofread] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error', issues: [], detectedNouns: [] },
      { status: 500 }
    )
  }
}
