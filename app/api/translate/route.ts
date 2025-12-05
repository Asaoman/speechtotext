import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Character, MovieSettings, TranslationRequest, TranslationResult } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120

// キャラクター情報からプロンプトセクションを生成（包括的ペルソナ情報を含む）
function buildCharacterPrompt(character: Character): string {
  const lines: string[] = []
  
  lines.push(`【キャラクター: ${character.name}】`)
  
  // 基本情報
  lines.push(`【基本情報】`)
  lines.push(`- 性別: ${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : 'その他'}`)
  lines.push(`- 年齢層: ${getAgeGroupLabel(character.ageGroup)}`)
  if (character.socialPosition) {
    lines.push(`- 社会的立場: ${character.socialPosition}`)
  }
  
  // 性格・背景（包括的ペルソナ情報）
  if (character.personality || character.background || character.values || character.behavioralTraits) {
    lines.push(`【性格・背景】`)
    if (character.personality) {
      lines.push(`- 性格: ${character.personality}`)
    }
    if (character.background) {
      lines.push(`- 背景・経歴: ${character.background}`)
    }
    if (character.values && character.values.length > 0) {
      lines.push(`- 価値観: ${character.values.join('、')}`)
    }
    if (character.behavioralTraits && character.behavioralTraits.length > 0) {
      lines.push(`- 行動パターン: ${character.behavioralTraits.join('、')}`)
    }
  }
  
  // 話し方の特徴
  lines.push(`【話し方の特徴】`)
  // speechPatternsがある場合は優先、なければ既存フィールドを使用
  if (character.speechPatterns) {
    if (character.speechPatterns.firstPerson) {
      lines.push(`- 一人称: ${character.speechPatterns.firstPerson}`)
    }
    if (character.speechPatterns.secondPerson) {
      lines.push(`- 二人称: ${character.speechPatterns.secondPerson}`)
    }
    if (character.speechPatterns.sentenceEndings && character.speechPatterns.sentenceEndings.length > 0) {
      lines.push(`- 語尾: ${character.speechPatterns.sentenceEndings.join('、')}`)
    }
    if (character.speechPatterns.catchphrases && character.speechPatterns.catchphrases.length > 0) {
      lines.push(`- 口癖・決め台詞: ${character.speechPatterns.catchphrases.join('、')}`)
    }
    if (character.speechPatterns.emotionalExpressions && character.speechPatterns.emotionalExpressions.length > 0) {
      lines.push(`- 感情表現: ${character.speechPatterns.emotionalExpressions.join('、')}`)
    }
  } else {
    // 既存フィールドを使用（後方互換性）
    lines.push(`- 一人称: ${character.firstPerson}`)
    lines.push(`- 二人称: ${character.secondPerson}`)
    if (character.sentenceEndings && character.sentenceEndings.length > 0) {
      lines.push(`- 語尾: ${character.sentenceEndings.join('、')}`)
    }
  }
  
  // 口調
  lines.push(`- 口調スタイル: ${getSpeechStyleLabel(character.speechStyle)}`)
  
  // コメディ要素（コメディ作品の場合）
  if (character.comedyLevel && character.comedyLevel !== 'none') {
    lines.push(`【コメディ要素】`)
    lines.push(`- ギャグレベル: ${character.comedyLevel}`)
    if (character.localGags && character.localGags.length > 0) {
      lines.push(`- ローカルなギャグ: ${character.localGags.join('、')}`)
    }
    if (character.humorStyle) {
      lines.push(`- ユーモアスタイル: ${character.humorStyle}`)
    }
  }
  
  // 文脈依存性
  if (character.contextDependentSpeech) {
    lines.push(`【文脈依存性】`)
    lines.push(character.contextDependentSpeech)
  }
  
  // 関係性
  if (character.relationships) {
    lines.push(`【関係性】`)
    lines.push(character.relationships)
  }
  
  // 既存のキャラクター特徴（後方互換性）
  if (character.characterTraits) {
    lines.push(`【キャラクターの特徴】`)
    lines.push(character.characterTraits)
  }
  
  // サンプルセリフ
  if (character.sampleDialogues && character.sampleDialogues.length > 0) {
    lines.push(`【サンプルセリフ】`)
    character.sampleDialogues.forEach(dialogue => {
      lines.push(`  「${dialogue}」`)
    })
  }
  
  // 重要ポイントの強調
  const importantPoints: string[] = []
  if (character.speechPatterns?.catchphrases && character.speechPatterns.catchphrases.length > 0) {
    importantPoints.push(`口癖「${character.speechPatterns.catchphrases[0]}」を必ず使用`)
  }
  if (character.speechPatterns?.sentenceEndings && character.speechPatterns.sentenceEndings.length > 0) {
    importantPoints.push(`語尾「${character.speechPatterns.sentenceEndings[0]}」を徹底的に反映`)
  }
  if (character.comedyLevel && character.comedyLevel !== 'none') {
    importantPoints.push(`コメディ要素を${character.comedyLevel}レベルで表現`)
  }
  
  if (importantPoints.length > 0) {
    lines.push(`【重要】`)
    lines.push(`このキャラクターの全ての特徴を反映した翻訳を行ってください。`)
    lines.push(`特に${importantPoints.join('、')}を必ず表現に含めてください。`)
  }
  
  return lines.join('\n')
}

// 作品設定からプロンプトセクションを生成
function buildMovieSettingsPrompt(settings: MovieSettings): string {
  const lines: string[] = []
  
  lines.push(`【作品設定】`)
  if (settings.title) {
    lines.push(`- タイトル: ${settings.title}`)
  }
  if (settings.genres && settings.genres.length > 0) {
    lines.push(`- ジャンル: ${settings.genres.map(g => getGenreLabel(g)).join('、')}`)
  }
  lines.push(`- 時代設定: ${getEraLabel(settings.eraSetting)}`)
  lines.push(`- ターゲット視聴者: ${getAudienceLabel(settings.targetAudience)}`)
  lines.push(`- 翻訳スタイル: ${getTranslationStyleLabel(settings.translationStyle)}`)
  
  if (settings.toneDescription) {
    lines.push(`- トーン・雰囲気: ${settings.toneDescription}`)
  }
  
  if (settings.specialInstructions) {
    lines.push(`- 特別指示: ${settings.specialInstructions}`)
  }
  
  if (settings.glossary && Object.keys(settings.glossary).length > 0) {
    lines.push(`- 用語集:`)
    Object.entries(settings.glossary).forEach(([term, translation]) => {
      lines.push(`  ${term} → ${translation}`)
    })
  }
  
  return lines.join('\n')
}

// ラベル取得ヘルパー関数
function getAgeGroupLabel(ageGroup: string): string {
  const labels: Record<string, string> = {
    child: '子供', teen: '10代', young_adult: '若者',
    adult: '大人', middle_aged: '中年', elderly: '高齢'
  }
  return labels[ageGroup] || ageGroup
}

function getSpeechStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    polite: '敬語', casual: 'タメ口', rough: '粗野', formal: 'フォーマル',
    childish: '幼児言葉', elderly: '老人風', archaic: '古風・時代劇',
    dialect: '方言', robot: 'ロボット・AI', noble: '貴族風', military: '軍人風'
  }
  return labels[style] || style
}

function getGenreLabel(genre: string): string {
  const labels: Record<string, string> = {
    action: 'アクション', comedy: 'コメディ', drama: 'ドラマ', horror: 'ホラー',
    romance: 'ロマンス', 'sci-fi': 'SF', fantasy: 'ファンタジー', thriller: 'スリラー',
    documentary: 'ドキュメンタリー', animation: 'アニメーション', musical: 'ミュージカル',
    western: '西部劇', crime: '犯罪', mystery: 'ミステリー', war: '戦争', historical: '歴史'
  }
  return labels[genre] || genre
}

function getEraLabel(era: string): string {
  const labels: Record<string, string> = {
    ancient: '古代', medieval: '中世', edo: '江戸時代', meiji: '明治〜大正',
    showa_early: '昭和初期', showa_late: '昭和後期', modern: '現代',
    near_future: '近未来', far_future: '遠未来', fantasy: 'ファンタジー世界'
  }
  return labels[era] || era
}

function getAudienceLabel(audience: string): string {
  const labels: Record<string, string> = {
    all_ages: '全年齢', children: '子供向け', teens: '青少年向け',
    young_adult: 'ヤングアダルト', adult: '成人向け', mature: 'R指定'
  }
  return labels[audience] || audience
}

function getTranslationStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    subtitle: '字幕翻訳調（簡潔）', natural: '自然な会話調',
    literary: '文学的', localized: 'ローカライズ重視', faithful: '原文忠実'
  }
  return labels[style] || style
}

// メインの翻訳プロンプトを構築
function buildTranslationPrompt(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  character?: Character,
  movieSettings?: MovieSettings,
  context?: string
): string {
  const sourceLang = sourceLanguage === 'en' ? '英語' : '日本語'
  const targetLang = targetLanguage === 'ja' ? '日本語' : '英語'
  
  let prompt = `あなたはプロの映画字幕翻訳者です。以下の${sourceLang}のセリフを${targetLang}に翻訳してください。

【翻訳の基本方針】
- 字幕翻訳として自然で読みやすい表現を使用
- 原文のニュアンスと感情を保持
- 文字数は原文と同程度か短めに凝縮
- 句読点は最小限に（字幕では読点「、」や句点「。」をスペースや改行で代替することが多い）
`

  if (movieSettings) {
    prompt += `\n${buildMovieSettingsPrompt(movieSettings)}\n`
  }

  if (character) {
    prompt += `\n${buildCharacterPrompt(character)}\n`
    prompt += `\n【重要】このキャラクターの口調・一人称・語尾を必ず反映してください。\n`
  }

  if (context) {
    prompt += `\n【前後の文脈】\n${context}\n`
  }

  prompt += `
【翻訳対象テキスト】
${text}

【出力形式】
翻訳結果のみを出力してください。説明や注釈は不要です。`

  return prompt
}

// OpenAI で翻訳
async function translateWithOpenAI(
  text: string,
  apiKey: string,
  model: string,
  sourceLanguage: string,
  targetLanguage: string,
  character?: Character,
  movieSettings?: MovieSettings,
  context?: string
): Promise<string> {
  const openai = new OpenAI({ apiKey })
  
  const systemPrompt = buildTranslationPrompt(
    text, sourceLanguage, targetLanguage, character, movieSettings, context
  )

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `翻訳してください: ${text}` }
    ],
    temperature: 0.3,
    max_tokens: 2048
  })

  return response.choices[0].message.content?.trim() || text
}

// Claude で翻訳
async function translateWithClaude(
  text: string,
  apiKey: string,
  model: string,
  sourceLanguage: string,
  targetLanguage: string,
  character?: Character,
  movieSettings?: MovieSettings,
  context?: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey })
  
  const prompt = buildTranslationPrompt(
    text, sourceLanguage, targetLanguage, character, movieSettings, context
  )

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    temperature: 0.3,
    system: prompt,
    messages: [
      { role: 'user', content: `翻訳してください: ${text}` }
    ]
  })

  const content = response.content[0]
  return content.type === 'text' ? content.text.trim() : text
}

// Gemini で翻訳
async function translateWithGemini(
  text: string,
  apiKey: string,
  model: string,
  sourceLanguage: string,
  targetLanguage: string,
  character?: Character,
  movieSettings?: MovieSettings,
  context?: string
): Promise<string> {
  console.log(`[translateWithGemini] Using model: ${model}`)
  
  const genAI = new GoogleGenerativeAI(apiKey)
  
  // モデル名のマッピング（念のため）
  const modelMapping: Record<string, string> = {
    'gemini-1.5-flash': 'gemini-2.5-flash-lite',
    'gemini-1.5-flash-latest': 'gemini-2.5-flash-lite',
    'gemini-2.0-flash-exp': 'gemini-2.5-flash-lite',
    'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash-lite'
  }
  
  const actualModel = modelMapping[model] || model
  if (actualModel !== model) {
    console.log(`[translateWithGemini] モデル名を変換: ${model} → ${actualModel}`)
  }
  
  const geminiModel = genAI.getGenerativeModel({ model: actualModel })
  
  const prompt = buildTranslationPrompt(
    text, sourceLanguage, targetLanguage, character, movieSettings, context
  )

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt + `\n\n翻訳対象: ${text}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    })

    return result.response.text().trim() || text
  } catch (error: any) {
    console.error(`[translateWithGemini] Error with model ${actualModel}:`, error.message)
    throw new Error(`Gemini API error (model: ${actualModel}): ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: TranslationRequest & { geminiModelTranslate?: string } = await request.json()
    const {
      text,
      sourceLanguage,
      targetLanguage,
      character,
      movieSettings,
      context,
      service,
      model,
      apiKey,
      geminiModelTranslate
    } = body

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required' },
        { status: 400 }
      )
    }

    if (!service || !['openai', 'claude', 'gemini'].includes(service)) {
      return NextResponse.json(
        { success: false, error: 'Invalid service specified' },
        { status: 400 }
      )
    }

    // デフォルトモデルとモデル名のマッピング（古いモデル名を新しいモデル名に変換）
    const modelMapping: Record<string, string> = {
      'gemini-1.5-flash': 'gemini-2.5-flash-lite',
      'gemini-1.5-flash-latest': 'gemini-2.5-flash-lite',
      'gemini-2.0-flash-exp': 'gemini-2.5-flash-lite',
      'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash-lite'
    }
    
    const defaultModel = (
      service === 'openai' ? 'gpt-4o' :
      service === 'claude' ? 'claude-sonnet-4-20250514' :
      (geminiModelTranslate || 'gemini-2.5-flash-lite')
    )
    
    const rawModel = model || defaultModel
    const actualModel = modelMapping[rawModel] || rawModel
    
    if (rawModel !== actualModel) {
      console.log(`[translate] モデル名を変換: ${rawModel} → ${actualModel}`)
    }

    console.log(`[translate] Translating with ${service} (${actualModel}): "${text.substring(0, 50)}..."`)

    let translatedText: string

    try {
      if (service === 'openai') {
        translatedText = await translateWithOpenAI(
          text, apiKey, actualModel, sourceLanguage, targetLanguage,
          character, movieSettings, context
        )
      } else if (service === 'claude') {
        translatedText = await translateWithClaude(
          text, apiKey, actualModel, sourceLanguage, targetLanguage,
          character, movieSettings, context
        )
      } else {
        translatedText = await translateWithGemini(
          text, apiKey, actualModel, sourceLanguage, targetLanguage,
          character, movieSettings, context
        )
      }
    } catch (apiError: any) {
      console.error('Translation API error:', apiError)
      return NextResponse.json(
        { 
          success: false, 
          error: `Translation failed: ${apiError.message}`,
          originalText: text
        },
        { status: 500 }
      )
    }

    const result: TranslationResult = {
      success: true,
      originalText: text,
      translatedText,
      service,
      model: actualModel
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Translation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Translation failed',
        originalText: ''
      },
      { status: 500 }
    )
  }
}

// バッチ翻訳エンドポイント
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      subtitles,
      sourceLanguage,
      targetLanguage,
      characters,
      movieSettings,
      service,
      model,
      apiKey
    } = body

    if (!subtitles || subtitles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Subtitles array is required' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required' },
        { status: 400 }
      )
    }

    // モデル名のマッピング（古いモデル名を新しいモデル名に変換）
    const modelMapping: Record<string, string> = {
      'gemini-1.5-flash': 'gemini-2.5-flash-lite',
      'gemini-1.5-flash-latest': 'gemini-2.5-flash-lite',
      'gemini-2.0-flash-exp': 'gemini-2.5-flash-lite',
      'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash-lite'
    }
    
    const defaultModel = (
      service === 'openai' ? 'gpt-4o' :
      service === 'claude' ? 'claude-sonnet-4-20250514' :
      'gemini-2.5-flash-lite'
    )
    
    const rawModel = model || defaultModel
    const actualModel = modelMapping[rawModel] || rawModel
    
    if (rawModel !== actualModel) {
      console.log(`[translate-batch] モデル名を変換: ${rawModel} → ${actualModel}`)
    }

    console.log(`[translate-batch] Batch translating ${subtitles.length} subtitles with ${service} (${actualModel})`)

    const translatedSubtitles = []
    let translatedCount = 0
    let failedCount = 0
    const errors: string[] = []

    // キャラクターをIDでインデックス化
    const characterMap = new Map<string, Character>()
    if (characters) {
      characters.forEach((c: Character) => characterMap.set(c.id, c))
    }

    for (let i = 0; i < subtitles.length; i++) {
      const subtitle = subtitles[i]
      const character = subtitle.characterId ? characterMap.get(subtitle.characterId) : undefined
      
      // 前後の文脈を構築（前後2件）
      const contextLines: string[] = []
      if (i > 0) contextLines.push(`前: ${subtitles[i - 1].text}`)
      if (i < subtitles.length - 1) contextLines.push(`後: ${subtitles[i + 1].text}`)
      const context = contextLines.length > 0 ? contextLines.join('\n') : undefined

      try {
        let translatedText: string

        if (service === 'openai') {
          translatedText = await translateWithOpenAI(
            subtitle.text, apiKey, actualModel, sourceLanguage, targetLanguage,
            character, movieSettings, context
          )
        } else if (service === 'claude') {
          translatedText = await translateWithClaude(
            subtitle.text, apiKey, actualModel, sourceLanguage, targetLanguage,
            character, movieSettings, context
          )
        } else {
          translatedText = await translateWithGemini(
            subtitle.text, apiKey, actualModel, sourceLanguage, targetLanguage,
            character, movieSettings, context
          )
        }

        translatedSubtitles.push({
          ...subtitle,
          originalText: subtitle.text,
          translatedText,
          text: translatedText, // 翻訳後のテキストをメインテキストに
          isTranslated: true
        })
        translatedCount++
      } catch (err: any) {
        console.error(`Failed to translate subtitle ${i}:`, err.message)
        translatedSubtitles.push({
          ...subtitle,
          originalText: subtitle.text,
          translatedText: subtitle.text, // 失敗時は元のテキストを保持
          isTranslated: false,
          needsReview: true
        })
        failedCount++
        errors.push(`#${subtitle.index}: ${err.message}`)
      }

      // レート制限対策：少し待機
      if (i < subtitles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    return NextResponse.json({
      success: failedCount === 0,
      subtitles: translatedSubtitles,
      totalCount: subtitles.length,
      translatedCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('Batch translation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Batch translation failed',
        subtitles: [],
        totalCount: 0,
        translatedCount: 0,
        failedCount: 0
      },
      { status: 500 }
    )
  }
}

