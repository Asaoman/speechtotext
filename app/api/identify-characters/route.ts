import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// キャラクター情報の型
interface IdentifiedCharacter {
  id: string
  name: string
  nameReading?: string
  gender: 'male' | 'female' | 'unknown'
  ageGroup: string
  speechStyle: string
  description: string
  dialogueCount: number
  firstAppearance?: number // セリフインデックス
}

// セリフとキャラクターの紐付け
interface DialogueAssignment {
  index: number
  text: string
  characterId: string
  characterName: string
  confidence: number // 0-1の確信度
}

// 分析結果
interface IdentificationResult {
  success: boolean
  characters?: IdentifiedCharacter[]
  assignments?: DialogueAssignment[]
  properNouns?: {
    name: string
    type: 'person' | 'place' | 'work' | 'term' | 'other'
    reading?: string
    translation?: string
  }[]
  error?: string
}

// セリフデータの型
interface DialogueInput {
  index: number
  startTime?: number
  endTime?: number
  text: string
  speaker?: string // 既存の話者情報があれば
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      dialogues,      // セリフ配列
      scriptText,     // 脚本テキスト（オプション）
      existingCharacters, // 既存キャラクター情報（オプション）
      apiKey 
    } = body as {
      dialogues: DialogueInput[]
      scriptText?: string
      existingCharacters?: { name: string; description?: string }[]
      apiKey?: string
    }

    if (!dialogues || dialogues.length === 0) {
      return NextResponse.json<IdentificationResult>({
        success: false,
        error: 'セリフデータが必要です'
      }, { status: 400 })
    }

    // API キー取得
    const geminiApiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    
    if (!geminiApiKey) {
      return NextResponse.json<IdentificationResult>({
        success: false,
        error: 'Gemini APIキーが設定されていません'
      }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // セリフを整形（最大500セリフまで）
    const limitedDialogues = dialogues.slice(0, 500)
    const dialogueText = limitedDialogues
      .map((d, i) => `[${i + 1}] ${d.speaker ? `(${d.speaker}) ` : ''}${d.text}`)
      .join('\n')

    // 脚本がある場合は先頭部分を追加
    const scriptContext = scriptText 
      ? `\n\n## 参考: 脚本の一部\n${scriptText.substring(0, 5000)}`
      : ''

    // 既存キャラクター情報
    const existingContext = existingCharacters?.length
      ? `\n\n## 既知のキャラクター\n${existingCharacters.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')}`
      : ''

    const prompt = `あなたは映画・ドラマの脚本分析の専門家です。
以下のセリフリストを分析し、登場キャラクターを識別してください。

## セリフリスト（${limitedDialogues.length}件）
${dialogueText}
${scriptContext}
${existingContext}

## タスク
1. 登場する全キャラクターを識別（数十人でも可）
2. 各セリフがどのキャラクターのものか判定
3. 固有名詞（人名、地名、作品名、専門用語）を抽出

## 出力形式（JSON）
{
  "characters": [
    {
      "id": "char_001",
      "name": "キャラクター名",
      "nameReading": "よみがな（日本語名の場合）",
      "gender": "male/female/unknown",
      "ageGroup": "child/teen/young_adult/adult/middle_aged/elderly",
      "speechStyle": "polite/casual/rough/formal/childish/elderly/archaic",
      "description": "キャラクターの簡単な説明（20文字程度）",
      "dialogueCount": 10
    }
  ],
  "assignments": [
    {
      "index": 1,
      "text": "セリフの最初の10文字...",
      "characterId": "char_001",
      "characterName": "キャラクター名",
      "confidence": 0.95
    }
  ],
  "properNouns": [
    {
      "name": "固有名詞",
      "type": "person/place/work/term/other",
      "reading": "よみがな",
      "translation": "翻訳案（英語の場合はカタカナ表記など）"
    }
  ]
}

## 注意事項
- 必ず有効なJSONのみを出力（マークダウンのコードブロック不要）
- キャラクターIDは "char_001", "char_002" のような形式
- 話者が不明な場合は "char_unknown" を使用
- confidence は 0.5〜1.0 の範囲
- assignments は全セリフ分出力
- 同一人物の別名（ニックネーム等）は統合`

    const result = await model.generateContent(prompt)
    const response = await result.response
    let responseText = response.text()

    // JSONを抽出
    responseText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let parsed
    try {
      parsed = JSON.parse(responseText)
    } catch {
      console.error('Failed to parse Gemini response:', responseText.substring(0, 500))
      return NextResponse.json<IdentificationResult>({
        success: false,
        error: 'AIの応答をパースできませんでした'
      }, { status: 500 })
    }

    // 結果を整形
    const characters: IdentifiedCharacter[] = (parsed.characters || []).map((c: any, i: number) => ({
      id: c.id || `char_${String(i + 1).padStart(3, '0')}`,
      name: c.name || '不明',
      nameReading: c.nameReading,
      gender: c.gender || 'unknown',
      ageGroup: c.ageGroup || 'adult',
      speechStyle: c.speechStyle || 'casual',
      description: c.description || '',
      dialogueCount: c.dialogueCount || 0,
      firstAppearance: c.firstAppearance
    }))

    const assignments: DialogueAssignment[] = (parsed.assignments || []).map((a: any) => ({
      index: a.index,
      text: a.text || '',
      characterId: a.characterId || 'char_unknown',
      characterName: a.characterName || '不明',
      confidence: Math.max(0, Math.min(1, a.confidence || 0.5))
    }))

    // セリフ数をカウント
    const countMap = new Map<string, number>()
    assignments.forEach(a => {
      countMap.set(a.characterId, (countMap.get(a.characterId) || 0) + 1)
    })
    characters.forEach(c => {
      c.dialogueCount = countMap.get(c.id) || 0
    })

    // firstAppearanceを計算
    const firstAppearanceMap = new Map<string, number>()
    assignments.forEach(a => {
      if (!firstAppearanceMap.has(a.characterId)) {
        firstAppearanceMap.set(a.characterId, a.index)
      }
    })
    characters.forEach(c => {
      c.firstAppearance = firstAppearanceMap.get(c.id)
    })

    // セリフ数でソート
    characters.sort((a, b) => b.dialogueCount - a.dialogueCount)

    return NextResponse.json<IdentificationResult>({
      success: true,
      characters,
      assignments,
      properNouns: parsed.properNouns || []
    })

  } catch (error: any) {
    console.error('Character identification error:', error)
    return NextResponse.json<IdentificationResult>({
      success: false,
      error: error.message || 'キャラクター識別に失敗しました'
    }, { status: 500 })
  }
}

