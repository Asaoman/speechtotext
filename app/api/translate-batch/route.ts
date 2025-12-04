import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5分まで

// キャラクター情報
interface CharacterInfo {
  id: string
  name: string
  gender: 'male' | 'female' | 'unknown'
  ageGroup: string
  speechStyle: string
  firstPerson?: string
  sentenceEndings?: string[]
}

// 固有名詞
interface ProperNoun {
  name: string
  reading?: string
  translation?: string
  type: string
}

// 翻訳対象セリフ
interface DialogueToTranslate {
  index: number
  text: string
  characterId?: string
}

// 翻訳結果
interface TranslatedDialogue {
  index: number
  originalText: string
  translatedText: string
  characterId?: string
}

// リクエストボディ
interface BatchTranslateRequest {
  dialogues: DialogueToTranslate[]
  characters: CharacterInfo[]
  properNouns: ProperNoun[]
  sourceLanguage: 'en' | 'ja'
  targetLanguage: 'ja' | 'en'
  movieTitle?: string
  genre?: string
  toneDescription?: string
  specialInstructions?: string
  apiKey?: string
}

// レスポンス
interface BatchTranslateResponse {
  success: boolean
  translations?: TranslatedDialogue[]
  error?: string
  processedCount?: number
  failedCount?: number
}

// 口調のラベル
const SPEECH_STYLE_LABELS: Record<string, string> = {
  polite: '敬語（です・ます調）',
  casual: 'カジュアル（タメ口）',
  rough: '粗野・乱暴',
  formal: 'フォーマル・堅い',
  childish: '幼児言葉',
  elderly: '老人風（〜じゃ、〜のう）',
  archaic: '古風・時代劇風',
  dialect: '方言',
  robot: 'ロボット・AI風',
  noble: '貴族風・お嬢様言葉',
  military: '軍人風・命令口調'
}

// 性別のラベル
const GENDER_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  unknown: '不明'
}

// 年齢層のラベル
const AGE_LABELS: Record<string, string> = {
  child: '子供',
  teen: 'ティーン',
  young_adult: '若者',
  adult: '成人',
  middle_aged: '中年',
  elderly: '高齢者'
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchTranslateRequest = await request.json()
    const {
      dialogues,
      characters,
      properNouns,
      sourceLanguage,
      targetLanguage,
      movieTitle,
      genre,
      toneDescription,
      specialInstructions,
      apiKey
    } = body

    if (!dialogues || dialogues.length === 0) {
      return NextResponse.json<BatchTranslateResponse>({
        success: false,
        error: '翻訳するセリフがありません'
      }, { status: 400 })
    }

    // API キー取得
    const geminiApiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY

    if (!geminiApiKey) {
      return NextResponse.json<BatchTranslateResponse>({
        success: false,
        error: 'Gemini APIキーが設定されていません'
      }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // キャラクターマップを作成
    const characterMap = new Map(characters.map(c => [c.id, c]))

    // 固有名詞辞書を構築
    const glossary = properNouns
      .filter(n => n.translation)
      .map(n => `${n.name} → ${n.translation}`)
      .join('\n')

    // キャラクター情報をテキストに変換
    const characterProfiles = characters.map(c => {
      const lines = [`【${c.name}】`]
      lines.push(`- 性別: ${GENDER_LABELS[c.gender] || c.gender}`)
      lines.push(`- 年齢: ${AGE_LABELS[c.ageGroup] || c.ageGroup}`)
      lines.push(`- 口調: ${SPEECH_STYLE_LABELS[c.speechStyle] || c.speechStyle}`)
      if (c.firstPerson) lines.push(`- 一人称: ${c.firstPerson}`)
      if (c.sentenceEndings?.length) lines.push(`- 特徴的な語尾: ${c.sentenceEndings.join('、')}`)
      return lines.join('\n')
    }).join('\n\n')

    // 翻訳方向
    const sourceLang = sourceLanguage === 'en' ? '英語' : '日本語'
    const targetLang = targetLanguage === 'ja' ? '日本語' : '英語'

    // セリフをJSON形式で整形
    const dialoguesJson = dialogues.map(d => {
      const char = d.characterId ? characterMap.get(d.characterId) : undefined
      return {
        index: d.index,
        character: char?.name || '不明',
        text: d.text
      }
    })

    // プロンプト構築
    const prompt = `あなたはプロの映画字幕翻訳者です。以下のセリフを${sourceLang}から${targetLang}に翻訳してください。

## 翻訳の基本方針
- 字幕翻訳として自然で読みやすい表現を使用
- 各キャラクターの口調・一人称を厳密に反映
- 原文のニュアンスと感情を保持
- 文字数は原文と同程度か短めに（字幕用に凝縮）
- 固有名詞は用語集に従う

${movieTitle ? `## 作品情報\nタイトル: ${movieTitle}` : ''}
${genre ? `ジャンル: ${genre}` : ''}
${toneDescription ? `トーン: ${toneDescription}` : ''}
${specialInstructions ? `\n## 特別指示\n${specialInstructions}` : ''}

## キャラクタープロフィール
${characterProfiles || '（キャラクター情報なし）'}

${glossary ? `## 用語集（必ず従ってください）\n${glossary}` : ''}

## 翻訳対象セリフ（${dialogues.length}件）
${JSON.stringify(dialoguesJson, null, 2)}

## 出力形式
以下のJSON配列形式で翻訳結果を出力してください（マークダウンのコードブロック不要）:
[
  { "index": 1, "text": "翻訳後のテキスト" },
  { "index": 2, "text": "翻訳後のテキスト" },
  ...
]

重要: 
- 必ず全てのセリフを翻訳し、indexを維持してください
- キャラクターの口調を厳密に反映してください
- 有効なJSONのみを出力してください`

    console.log(`Batch translating ${dialogues.length} dialogues with Gemini`)

    const result = await model.generateContent(prompt)
    const response = await result.response
    let responseText = response.text()

    // JSONを抽出
    responseText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let parsedTranslations: { index: number; text: string }[]
    try {
      parsedTranslations = JSON.parse(responseText)
    } catch {
      console.error('Failed to parse Gemini response:', responseText.substring(0, 500))
      return NextResponse.json<BatchTranslateResponse>({
        success: false,
        error: 'AIの応答をパースできませんでした'
      }, { status: 500 })
    }

    // 結果をマッピング
    const translationMap = new Map(parsedTranslations.map(t => [t.index, t.text]))
    
    const translations: TranslatedDialogue[] = dialogues.map(d => ({
      index: d.index,
      originalText: d.text,
      translatedText: translationMap.get(d.index) || d.text,
      characterId: d.characterId
    }))

    const processedCount = translations.filter(t => t.translatedText !== t.originalText).length
    const failedCount = dialogues.length - processedCount

    console.log(`Batch translation complete: ${processedCount} succeeded, ${failedCount} failed`)

    return NextResponse.json<BatchTranslateResponse>({
      success: true,
      translations,
      processedCount,
      failedCount
    })

  } catch (error: any) {
    console.error('Batch translation error:', error)
    return NextResponse.json<BatchTranslateResponse>({
      success: false,
      error: error.message || 'バッチ翻訳に失敗しました'
    }, { status: 500 })
  }
}

