import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// 分析結果の型定義
interface ScriptAnalysisResult {
  success: boolean
  analysis?: {
    title: string
    originalLanguage: 'en' | 'ja' | 'other'
    genres: string[]
    eraSetting: string
    targetAudience: string
    translationStyle: string
    toneDescription: string
    specialInstructions: string
    characters: {
      name: string
      gender: 'male' | 'female' | 'unknown'
      ageGroup: string
      description: string
      speechStyle: string
      sampleDialogues: string[]
    }[]
  }
  error?: string
}

// 脚本から言語を推定
function detectLanguage(text: string): 'en' | 'ja' | 'other' {
  const japaneseChars = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)
  const totalChars = text.replace(/\s/g, '').length
  
  if (!japaneseChars || japaneseChars.length === 0) {
    return 'en'
  }
  
  const japaneseRatio = japaneseChars.length / totalChars
  if (japaneseRatio > 0.3) {
    return 'ja'
  }
  
  return 'en'
}

export async function POST(request: NextRequest) {
  try {
    const { text, apiKey } = await request.json()
    
    console.log('[analyze-script] Request received, text length:', text?.length || 0)

    if (!text) {
      console.log('[analyze-script] Error: No text provided')
      return NextResponse.json<ScriptAnalysisResult>({
        success: false,
        error: '脚本テキストが必要です'
      }, { status: 400 })
    }

    // API キーの取得（リクエストから、または環境変数から）
    const geminiApiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    
    if (!geminiApiKey) {
      console.log('[analyze-script] Error: No API key')
      return NextResponse.json<ScriptAnalysisResult>({
        success: false,
        error: 'Gemini APIキーが設定されていません'
      }, { status: 400 })
    }

    console.log('[analyze-script] Initializing Gemini API...')
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // 言語を推定
    const detectedLanguage = detectLanguage(text)

    // 脚本が長い場合は先頭部分のみ使用（コンテキスト制限対策）
    const maxLength = 15000
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '\n\n[... 続きは省略 ...]'
      : text

    const prompt = `あなたは映画・ドラマの脚本分析の専門家です。
以下の脚本テキストを分析し、作品情報をJSON形式で抽出してください。

## 分析対象の脚本:
${truncatedText}

## 抽出する情報（必ず以下のJSON形式で回答）:

{
  "title": "推測される作品タイトル（脚本から読み取れない場合は「不明」）",
  "genres": ["該当するジャンルを配列で", "例: action, comedy, drama, horror, romance, sf, fantasy, thriller, documentary, animation, musical, western, crime, mystery, war, history"],
  "eraSetting": "時代設定（modern:現代, period:時代劇, near_future:近未来, far_future:遠未来, historical:歴史もの）",
  "targetAudience": "ターゲット視聴者（general:全年齢, teen:ティーン向け, adult:成人向け, family:ファミリー, senior:シニア向け）",
  "translationStyle": "推奨翻訳スタイル（natural:自然な会話調, literal:直訳寄り, localized:ローカライズ重視, formal:フォーマル, casual:カジュアル）",
  "toneDescription": "作品のトーン・雰囲気を日本語で100文字程度で説明",
  "specialInstructions": "翻訳時の特別な注意点や指示を日本語で記述（例：固有名詞の扱い、専門用語、スラングなど）",
  "characters": [
    {
      "name": "キャラクター名",
      "gender": "male/female/unknown",
      "ageGroup": "child/teen/young_adult/adult/middle_aged/elderly",
      "description": "キャラクターの簡単な説明（20文字程度）",
      "speechStyle": "話し方の特徴（formal/casual/rough/polite/cute/elderly/child）",
      "sampleDialogues": ["脚本からの台詞例を1-2つ抽出"]
    }
  ]
}

## 注意事項:
- 必ず有効なJSONのみを出力してください（マークダウンのコードブロックは不要）
- 不明な場合は空文字や空配列を使用
- キャラクターは主要な5人程度に絞ってください
- 脚本が英語の場合もキャラクター名はそのまま、説明は日本語で
- genres は小文字の英語で`

    console.log('[analyze-script] Sending prompt to Gemini...')
    const result = await model.generateContent(prompt)
    const response = await result.response
    let responseText = response.text()
    
    console.log('[analyze-script] Gemini raw response length:', responseText.length)
    console.log('[analyze-script] Gemini raw response (first 500 chars):', responseText.substring(0, 500))

    // JSONを抽出（マークダウンコードブロックを除去）
    responseText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let analysis
    try {
      analysis = JSON.parse(responseText)
      console.log('[analyze-script] Parsed analysis:', JSON.stringify(analysis, null, 2).substring(0, 1000))
    } catch (parseError) {
      console.error('[analyze-script] Failed to parse Gemini response:', responseText)
      console.error('[analyze-script] Parse error:', parseError)
      return NextResponse.json<ScriptAnalysisResult>({
        success: false,
        error: 'AIの応答をパースできませんでした'
      }, { status: 500 })
    }

    // 結果を整形
    const formattedAnalysis = {
      title: analysis.title || '不明',
      originalLanguage: detectedLanguage,
      genres: Array.isArray(analysis.genres) ? analysis.genres : [],
      eraSetting: analysis.eraSetting || 'modern',
      targetAudience: analysis.targetAudience || 'general',
      translationStyle: analysis.translationStyle || 'natural',
      toneDescription: analysis.toneDescription || '',
      specialInstructions: analysis.specialInstructions || '',
      characters: Array.isArray(analysis.characters) 
        ? analysis.characters.map((c: any) => ({
            name: c.name || '',
            gender: c.gender || 'unknown',
            ageGroup: c.ageGroup || 'adult',
            description: c.description || '',
            speechStyle: c.speechStyle || 'casual',
            sampleDialogues: Array.isArray(c.sampleDialogues) ? c.sampleDialogues : []
          }))
        : []
    }

    console.log('[analyze-script] Returning formatted analysis:', {
      title: formattedAnalysis.title,
      genres: formattedAnalysis.genres,
      charactersCount: formattedAnalysis.characters.length
    })
    
    return NextResponse.json<ScriptAnalysisResult>({
      success: true,
      analysis: formattedAnalysis
    })

  } catch (error: any) {
    console.error('[analyze-script] Script analysis error:', error)
    return NextResponse.json<ScriptAnalysisResult>({
      success: false,
      error: error.message || '脚本分析に失敗しました'
    }, { status: 500 })
  }
}

