import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// 入力型定義
interface AudioSpeaker {
  speakerId: string           // speaker_0, speaker_1等
  segments: Array<{
    text: string
    startTime: number
    endTime: number
  }>
  totalDuration: number
  wordCount: number
}

interface ScriptCharacterDialogue {
  text: string
  approximateTime?: number  // 脚本上の推定タイミング
}

interface ScriptCharacter {
  name: string
  dialogues: ScriptCharacterDialogue[]
  persona?: {
    personality?: string
    speechPatterns?: {
      firstPerson?: string
      secondPerson?: string
      sentenceEndings?: string[]
      catchphrases?: string[]
    }
  }
}

interface AutoMapSpeakersRequest {
  audioSpeakers: AudioSpeaker[]
  scriptCharacters: ScriptCharacter[]
  scriptText: string
  apiKey?: string
}

interface SpeakerMapping {
  speakerId: string
  characterId: string
  characterName: string
  confidence: number          // 0-1の確信度
  reasoning: string           // マッピングの根拠
}

interface AutoMapSpeakersResponse {
  success: boolean
  mappings?: SpeakerMapping[]
  unassignedSpeakers?: string[]  // マッピングできなかった話者ID
  unassignedCharacters?: string[] // マッピングできなかったキャラクター名
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: AutoMapSpeakersRequest = await request.json()
    const { audioSpeakers, scriptCharacters, scriptText, apiKey } = body

    if (!audioSpeakers || audioSpeakers.length === 0) {
      return NextResponse.json<AutoMapSpeakersResponse>({
        success: false,
        error: '音声の話者データが必要です'
      }, { status: 400 })
    }

    if (!scriptCharacters || scriptCharacters.length === 0) {
      return NextResponse.json<AutoMapSpeakersResponse>({
        success: false,
        error: '脚本のキャラクターデータが必要です'
      }, { status: 400 })
    }

    // API キーの取得
    const geminiApiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    
    if (!geminiApiKey) {
      return NextResponse.json<AutoMapSpeakersResponse>({
        success: false,
        error: 'Gemini APIキーが設定されていません'
      }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // 音声話者情報を整形
    const audioSpeakersText = audioSpeakers.map(speaker => {
      const sampleTexts = speaker.segments
        .slice(0, 5)
        .map(seg => seg.text)
        .join(' / ')
      return `- ${speaker.speakerId}: ${speaker.wordCount}語、${Math.round(speaker.totalDuration)}秒、セリフ例: "${sampleTexts}"`
    }).join('\n')

    // 脚本キャラクター情報を整形
    const scriptCharactersText = scriptCharacters.map((char, idx) => {
      const dialogueSamples = char.dialogues
        .slice(0, 3)
        .map(d => d.text)
        .join(' / ')
      const personaInfo = char.persona 
        ? `\n  ペルソナ: ${char.persona.personality || '不明'}\n  話し方: ${char.persona.speechPatterns?.firstPerson || ''}、${char.persona.speechPatterns?.sentenceEndings?.join('、') || ''}`
        : ''
      return `- ${char.name} (ID: char_${idx}): セリフ例: "${dialogueSamples}"${personaInfo}`
    }).join('\n')

    // 脚本テキストの一部（コンテキスト用）
    const scriptContext = scriptText.length > 5000
      ? scriptText.substring(0, 5000) + '\n\n[... 続きは省略 ...]'
      : scriptText

    const prompt = `あなたは映画・ドラマの音声と脚本を照合する専門家です。
音声データから検出された話者IDと、脚本に登場するキャラクターを自動的にマッチングしてください。

## 音声から検出された話者:
${audioSpeakersText}

## 脚本に登場するキャラクター:
${scriptCharactersText}

## 参考: 脚本の一部
${scriptContext}

## タスク:
1. 各話者ID（speaker_0, speaker_1等）がどのキャラクター（char_0, char_1等）に対応するかを判定
2. 以下の要素を総合的に判断:
   - セリフ内容の意味的類似度
   - 脚本上の順序と音声のタイミングの照合
   - 話し方の特徴（語尾、一人称等）とペルソナ情報の一致度
   - セリフの長さや頻度の一致度
3. 各マッピングの確信度（0-1）を計算
4. 確信度が低い（0.5未満）マッピングは除外

## 出力形式（JSON）:
{
  "mappings": [
    {
      "speakerId": "speaker_0",
      "characterId": "char_0",
      "characterName": "キャラクター名",
      "confidence": 0.95,
      "reasoning": "マッピングの根拠（なぜこのマッピングが正しいと思われるか）"
    }
  ],
  "unassignedSpeakers": ["speaker_X"],
  "unassignedCharacters": ["キャラクター名"]
}

## 注意事項:
- 必ず有効なJSONのみを出力（マークダウンのコードブロック不要）
- 確信度は0.5以上の場合のみマッピングしてください
- 1つの話者IDは1つのキャラクターにのみマッピングしてください
- 1つのキャラクターは1つの話者IDにのみマッピングしてください（ただし、1人のキャラクターが複数の話者IDに分かれる可能性もあるため、その場合は最も確信度の高いマッピングを優先）
- reasoningは具体的で説得力のある説明を記述してください`

    console.log('[auto-map-speakers] Sending prompt to Gemini...')
    const result = await model.generateContent(prompt)
    const response = await result.response
    let responseText = response.text()
    
    console.log('[auto-map-speakers] Gemini raw response length:', responseText.length)
    console.log('[auto-map-speakers] Gemini raw response (first 500 chars):', responseText.substring(0, 500))

    // JSONを抽出（マークダウンコードブロックを除去）
    responseText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let parsed
    try {
      parsed = JSON.parse(responseText)
      console.log('[auto-map-speakers] Parsed mappings:', JSON.stringify(parsed, null, 2))
    } catch (parseError) {
      console.error('[auto-map-speakers] Failed to parse Gemini response:', responseText)
      console.error('[auto-map-speakers] Parse error:', parseError)
      return NextResponse.json<AutoMapSpeakersResponse>({
        success: false,
        error: 'AIの応答をパースできませんでした'
      }, { status: 500 })
    }

    // 結果を整形
    const mappings: SpeakerMapping[] = (parsed.mappings || []).map((m: any) => ({
      speakerId: m.speakerId || '',
      characterId: m.characterId || '',
      characterName: m.characterName || '不明',
      confidence: Math.max(0, Math.min(1, m.confidence || 0.5)),
      reasoning: m.reasoning || ''
    }))

    // 確信度でソート（高い順）
    mappings.sort((a, b) => b.confidence - a.confidence)

    return NextResponse.json<AutoMapSpeakersResponse>({
      success: true,
      mappings,
      unassignedSpeakers: parsed.unassignedSpeakers || [],
      unassignedCharacters: parsed.unassignedCharacters || []
    })

  } catch (error: any) {
    console.error('[auto-map-speakers] Error:', error)
    return NextResponse.json<AutoMapSpeakersResponse>({
      success: false,
      error: error.message || '話者マッピングに失敗しました'
    }, { status: 500 })
  }
}

