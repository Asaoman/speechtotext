import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ペルソナ情報の型定義
interface PersonaInfo {
  name: string
  gender: 'male' | 'female' | 'unknown'
  ageGroup: string
  speechStyle: string
  // 包括的ペルソナ情報
  personality: string           // 性格の詳細説明
  background: string            // 背景・経歴
  relationships: string         // 他のキャラクターとの関係性
  speechPatterns: {
    firstPerson: string         // 一人称
    secondPerson: string        // 二人称
    sentenceEndings: string[]   // 語尾パターン
    catchphrases: string[]      // 口癖・決め台詞
    emotionalExpressions: string[] // 感情表現の特徴
  }
  behavioralTraits: string[]    // 行動パターン
  values: string[]              // 価値観・信念
  socialPosition: string        // 社会的立場
  // コメディ関連
  comedyLevel?: 'none' | 'subtle' | 'moderate' | 'high' | 'extreme'
  localGags?: string[]          // ローカルなギャグの種類
  humorStyle?: string           // ユーモアのスタイル
  // 文脈依存性
  contextDependentSpeech: string // 状況による話し方の変化
}

interface ExtractPersonaRequest {
  scriptText: string
  characterName?: string        // 特定のキャラクター名を指定する場合
  apiKey?: string
}

interface ExtractPersonaResponse {
  success: boolean
  persona?: PersonaInfo
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ExtractPersonaRequest = await request.json()
    const { scriptText, characterName, apiKey } = body

    if (!scriptText) {
      return NextResponse.json<ExtractPersonaResponse>({
        success: false,
        error: '脚本テキストが必要です'
      }, { status: 400 })
    }

    // API キーの取得
    const geminiApiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    
    if (!geminiApiKey) {
      return NextResponse.json<ExtractPersonaResponse>({
        success: false,
        error: 'Gemini APIキーが設定されていません'
      }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // 脚本が長い場合は先頭部分のみ使用（コンテキスト制限対策）
    const maxLength = 20000
    const truncatedText = scriptText.length > maxLength 
      ? scriptText.substring(0, maxLength) + '\n\n[... 続きは省略 ...]'
      : scriptText

    // キャラクター名が指定されている場合は、そのキャラクターに焦点を当てる
    const characterFocus = characterName 
      ? `\n\n特に「${characterName}」というキャラクターのペルソナ情報を詳細に抽出してください。`
      : '\n\n脚本に登場する主要キャラクターのペルソナ情報を抽出してください。複数のキャラクターがいる場合は、最も重要と思われるキャラクターを優先してください。'

    const prompt = `あなたは映画・ドラマの脚本分析の専門家です。
以下の脚本テキストを分析し、キャラクターの包括的なペルソナ情報を抽出してください。
${characterFocus}

## 分析対象の脚本:
${truncatedText}

## 抽出する情報（必ず以下のJSON形式で回答）:

{
  "name": "キャラクター名",
  "gender": "male/female/unknown",
  "ageGroup": "child/teen/young_adult/adult/middle_aged/elderly",
  "speechStyle": "formal/casual/rough/polite/cute/elderly/child/archaic",
  "personality": "性格の詳細説明（100-200文字程度）",
  "background": "背景・経歴の説明（100-200文字程度）",
  "relationships": "他のキャラクターとの関係性の説明（100文字程度）",
  "speechPatterns": {
    "firstPerson": "一人称（例: 私、俺、僕、あたし）",
    "secondPerson": "二人称（例: あなた、お前、君、貴方）",
    "sentenceEndings": ["語尾パターン1", "語尾パターン2"],
    "catchphrases": ["口癖1", "口癖2", "決め台詞"],
    "emotionalExpressions": ["感情表現の特徴1", "感情表現の特徴2"]
  },
  "behavioralTraits": ["行動パターン1", "行動パターン2", "行動パターン3"],
  "values": ["価値観1", "価値観2", "信念"],
  "socialPosition": "社会的立場（例: 学生、会社員、医師、主婦、無職）",
  "comedyLevel": "none/subtle/moderate/high/extreme（コメディ作品の場合）",
  "localGags": ["ローカルなギャグの種類1", "ローカルなギャグの種類2"]（コメディ作品の場合のみ）,
  "humorStyle": "ユーモアのスタイル（コメディ作品の場合）",
  "contextDependentSpeech": "状況による話し方の変化の説明（100文字程度）"
}

## 注意事項:
- 必ず有効なJSONのみを出力してください（マークダウンのコードブロックは不要）
- 不明な場合は空文字や空配列を使用
- コメディ作品でない場合は、comedyLevelは"none"、localGagsとhumorStyleは省略してください
- 脚本から読み取れる限り詳細に情報を抽出してください
- 翻訳時にキャラクターの個性を最大限に反映できるよう、話し方の特徴を徹底的に分析してください`

    console.log('[extract-persona] Sending prompt to Gemini...')
    const result = await model.generateContent(prompt)
    const response = await result.response
    let responseText = response.text()
    
    console.log('[extract-persona] Gemini raw response length:', responseText.length)
    console.log('[extract-persona] Gemini raw response (first 500 chars):', responseText.substring(0, 500))

    // JSONを抽出（マークダウンコードブロックを除去）
    responseText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let parsed
    try {
      parsed = JSON.parse(responseText)
      console.log('[extract-persona] Parsed persona:', JSON.stringify(parsed, null, 2).substring(0, 1000))
    } catch (parseError) {
      console.error('[extract-persona] Failed to parse Gemini response:', responseText)
      console.error('[extract-persona] Parse error:', parseError)
      return NextResponse.json<ExtractPersonaResponse>({
        success: false,
        error: 'AIの応答をパースできませんでした'
      }, { status: 500 })
    }

    // 結果を整形
    const persona: PersonaInfo = {
      name: parsed.name || '不明',
      gender: parsed.gender || 'unknown',
      ageGroup: parsed.ageGroup || 'adult',
      speechStyle: parsed.speechStyle || 'casual',
      personality: parsed.personality || '',
      background: parsed.background || '',
      relationships: parsed.relationships || '',
      speechPatterns: {
        firstPerson: parsed.speechPatterns?.firstPerson || '',
        secondPerson: parsed.speechPatterns?.secondPerson || '',
        sentenceEndings: Array.isArray(parsed.speechPatterns?.sentenceEndings) 
          ? parsed.speechPatterns.sentenceEndings 
          : [],
        catchphrases: Array.isArray(parsed.speechPatterns?.catchphrases) 
          ? parsed.speechPatterns.catchphrases 
          : [],
        emotionalExpressions: Array.isArray(parsed.speechPatterns?.emotionalExpressions) 
          ? parsed.speechPatterns.emotionalExpressions 
          : []
      },
      behavioralTraits: Array.isArray(parsed.behavioralTraits) 
        ? parsed.behavioralTraits 
        : [],
      values: Array.isArray(parsed.values) 
        ? parsed.values 
        : [],
      socialPosition: parsed.socialPosition || '',
      contextDependentSpeech: parsed.contextDependentSpeech || '',
      comedyLevel: parsed.comedyLevel || 'none',
      localGags: Array.isArray(parsed.localGags) 
        ? parsed.localGags 
        : undefined,
      humorStyle: parsed.humorStyle || undefined
    }

    return NextResponse.json<ExtractPersonaResponse>({
      success: true,
      persona
    })

  } catch (error: any) {
    console.error('[extract-persona] Error:', error)
    return NextResponse.json<ExtractPersonaResponse>({
      success: false,
      error: error.message || 'ペルソナ抽出に失敗しました'
    }, { status: 500 })
  }
}

