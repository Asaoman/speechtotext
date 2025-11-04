import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const runtime = 'nodejs'
export const maxDuration = 60

// ペイロードサイズの制限を増やす（Vercelでは最大4.5MB、それ以上は別の方法が必要）
export const dynamic = 'force-dynamic'

interface TranscriptionSegment {
  start: number
  end: number
  text: string
  speaker?: string
}

interface TranscriptionWord {
  word: string
  start: number
  end: number
}

// 固有名詞を取得する関数
async function getProperNouns() {
  try {
    // APIから固有名詞を取得
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/proper-nouns`, {
      method: 'GET',
      cache: 'no-store'
    })

    if (!response.ok) {
      console.error('Failed to fetch proper nouns:', response.statusText)
      return []
    }

    const data = await response.json()
    return data.properNouns || []
  } catch (error) {
    console.error('Error fetching proper nouns:', error)
    return []
  }
}

// OpenAI で単一テキストを校正
async function proofreadTextWithOpenAI(
  text: string,
  apiKey: string,
  model: string,
  language: string,
  properNounsContext: string,
  customContext: string = ''
): Promise<string> {
  const openai = new OpenAI({ apiKey })

  const customInstructions = customContext ? `\n\n追加の指示:\n${customContext}` : ''

  const systemPrompt = `あなたは優秀な校正者です。与えられたテキストを校正し、誤字脱字、文法エラー、不自然な表現を修正してください。
言語: ${language === 'ja' ? '日本語' : '英語'}${properNounsContext}${customInstructions}

修正後のテキストのみを返してください。説明は不要です。`

  // AI校正用コンテキスト反映確認ログ
  if (customContext) {
    console.log('✓ AI Proofreading Context Applied (OpenAI segment):', customContext)
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    })

    return response.choices[0].message.content?.trim() || text
  } catch (error: any) {
    console.error('OpenAI segment correction error:', error)
    return text  // エラー時は元のテキストを返す
  }
}

// OpenAI で校正
async function proofreadWithOpenAI(
  text: string,
  apiKey: string,
  model: string,
  language: string,
  includeProperNouns: boolean,
  customContext: string = '',
  segments?: TranscriptionSegment[],
  words?: TranscriptionWord[]
) {
  const openai = new OpenAI({ apiKey })

  const properNouns = includeProperNouns ? await getProperNouns() : []
  const properNounsContext = properNouns.length > 0
    ? `\n\n参考: 以下の固有名詞に注意してください:\n${properNouns.map((n: any) => `- ${n.term}${n.reading ? ` (${n.reading})` : ''}`).join('\n')}`
    : ''

  // セグメントがある場合は、各セグメントを個別に校正
  if (segments && segments.length > 0) {
    const correctedSegments: TranscriptionSegment[] = []

    for (const segment of segments) {
      const correctedText = await proofreadTextWithOpenAI(
        segment.text,
        apiKey,
        model,
        language,
        properNounsContext,
        customContext
      )

      correctedSegments.push({
        ...segment,
        text: correctedText,
      })
    }

    // 校正済みセグメントから全文を再構成
    const correctedFullText = correctedSegments.map(s => s.text).join('')

    return {
      success: true,
      corrected_text: correctedFullText,
      changes: [],  // セグメント単位校正では個別の変更は追跡しない
      suggestions: [],
      segments: correctedSegments,  // タイムスタンプ付き校正済みセグメント
      words,  // 元のワードデータを保持
      service: 'openai',
      model,
    }
  }

  // セグメントがない場合は従来の全文校正
  const customInstructions = customContext ? `\n\n追加の指示:\n${customContext}` : ''

  // AI校正用コンテキスト反映確認ログ
  if (customContext) {
    console.log('✓ AI Proofreading Context Applied (OpenAI full text):', customContext)
  }

  const systemPrompt = `あなたは優秀な校正者です。テキストを校正し、誤字脱字、文法エラー、不自然な表現を修正してください。
言語: ${language === 'ja' ? '日本語' : '英語'}${properNounsContext}${customInstructions}

以下のJSON形式で結果を返してください:
{
  "corrected_text": "校正後の全文",
  "changes": [
    {
      "type": "修正の種類（誤字、脱字、文法、表現など）",
      "original": "修正前のテキスト",
      "corrected": "修正後のテキスト",
      "reason": "修正理由"
    }
  ],
  "suggestions": ["追加の提案1", "追加の提案2"]
}`

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')

    return {
      success: true,
      corrected_text: result.corrected_text || text,
      changes: result.changes || [],
      suggestions: result.suggestions || [],
      service: 'openai',
      model,
    }
  } catch (error: any) {
    throw new Error(`OpenAI API error: ${error.message}`)
  }
}

// Claude で単一テキストを校正
async function proofreadTextWithClaude(
  text: string,
  apiKey: string,
  model: string,
  language: string,
  properNounsContext: string,
  customContext: string = ''
): Promise<string> {
  const anthropic = new Anthropic({ apiKey })

  const customInstructions = customContext ? `\n\n追加の指示:\n${customContext}` : ''

  const systemPrompt = `あなたは優秀な校正者です。与えられたテキストを校正し、誤字脱字、文法エラー、不自然な表現を修正してください。
言語: ${language === 'ja' ? '日本語' : '英語'}${properNounsContext}${customInstructions}

修正後のテキストのみを返してください。説明は不要です。`

  // AI校正用コンテキスト反映確認ログ
  if (customContext) {
    console.log('✓ AI Proofreading Context Applied (Claude segment):', customContext)
  }

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        { role: 'user', content: text },
      ],
    })

    const content = response.content[0]
    return content.type === 'text' ? content.text.trim() : text
  } catch (error: any) {
    console.error('Claude segment correction error:', error)
    return text
  }
}

// Claude で校正
async function proofreadWithClaude(
  text: string,
  apiKey: string,
  model: string,
  language: string,
  includeProperNouns: boolean,
  customContext: string = '',
  segments?: TranscriptionSegment[],
  words?: TranscriptionWord[]
) {
  const anthropic = new Anthropic({ apiKey })

  const properNouns = includeProperNouns ? await getProperNouns() : []
  const properNounsContext = properNouns.length > 0
    ? `\n\n参考: 以下の固有名詞に注意してください:\n${properNouns.map((n: any) => `- ${n.term}${n.reading ? ` (${n.reading})` : ''}`).join('\n')}`
    : ''

  // セグメントがある場合は、各セグメントを個別に校正
  if (segments && segments.length > 0) {
    const correctedSegments: TranscriptionSegment[] = []

    for (const segment of segments) {
      const correctedText = await proofreadTextWithClaude(
        segment.text,
        apiKey,
        model,
        language,
        properNounsContext,
        customContext
      )

      correctedSegments.push({
        ...segment,
        text: correctedText,
      })
    }

    const correctedFullText = correctedSegments.map(s => s.text).join('')

    return {
      success: true,
      corrected_text: correctedFullText,
      changes: [],
      suggestions: [],
      segments: correctedSegments,
      words,
      service: 'claude',
      model,
    }
  }

  // セグメントがない場合は従来の全文校正
  const customInstructions = customContext ? `\n\n追加の指示:\n${customContext}` : ''

  // AI校正用コンテキスト反映確認ログ
  if (customContext) {
    console.log('✓ AI Proofreading Context Applied (Claude full text):', customContext)
  }

  const systemPrompt = `あなたは優秀な校正者です。テキストを校正し、誤字脱字、文法エラー、不自然な表現を修正してください。
言語: ${language === 'ja' ? '日本語' : '英語'}${properNounsContext}${customInstructions}

以下のJSON形式で結果を返してください:
{
  "corrected_text": "校正後の全文",
  "changes": [
    {
      "type": "修正の種類（誤字、脱字、文法、表現など）",
      "original": "修正前のテキスト",
      "corrected": "修正後のテキスト",
      "reason": "修正理由"
    }
  ],
  "suggestions": ["追加の提案1", "追加の提案2"]
}`

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // JSONを抽出（```json ... ``` で囲まれている場合に対応）
    let jsonText = content.text
    const jsonMatch = jsonText.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const result = JSON.parse(jsonText)

    return {
      success: true,
      corrected_text: result.corrected_text || text,
      changes: result.changes || [],
      suggestions: result.suggestions || [],
      service: 'claude',
      model,
    }
  } catch (error: any) {
    throw new Error(`Claude API error: ${error.message}`)
  }
}

// Gemini で単一テキストを校正
async function proofreadTextWithGemini(
  text: string,
  apiKey: string,
  model: string,
  language: string,
  properNounsContext: string,
  customContext: string = ''
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model })

  const customInstructions = customContext ? `\n\n追加の指示:\n${customContext}` : ''

  const prompt = `あなたは優秀な校正者です。与えられたテキストを校正し、誤字脱字、文法エラー、不自然な表現を修正してください。
言語: ${language === 'ja' ? '日本語' : '英語'}${properNounsContext}${customInstructions}

修正後のテキストのみを返してください。説明は不要です。

校正するテキスト:
${text}`

  // AI校正用コンテキスト反映確認ログ
  if (customContext) {
    console.log('✓ AI Proofreading Context Applied (Gemini segment):', customContext)
  }

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
      },
    })

    return result.response.text().trim() || text
  } catch (error: any) {
    console.error('Gemini segment correction error:', error)
    return text
  }
}

// Gemini で校正
async function proofreadWithGemini(
  text: string,
  apiKey: string,
  model: string,
  language: string,
  includeProperNouns: boolean,
  customContext: string = '',
  segments?: TranscriptionSegment[],
  words?: TranscriptionWord[]
) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model })

  const properNouns = includeProperNouns ? await getProperNouns() : []
  const properNounsContext = properNouns.length > 0
    ? `\n\n参考: 以下の固有名詞に注意してください:\n${properNouns.map((n: any) => `- ${n.term}${n.reading ? ` (${n.reading})` : ''}`).join('\n')}`
    : ''

  // セグメントがある場合は、各セグメントを個別に校正
  if (segments && segments.length > 0) {
    const correctedSegments: TranscriptionSegment[] = []

    for (const segment of segments) {
      const correctedText = await proofreadTextWithGemini(
        segment.text,
        apiKey,
        model,
        language,
        properNounsContext,
        customContext
      )

      correctedSegments.push({
        ...segment,
        text: correctedText,
      })
    }

    const correctedFullText = correctedSegments.map(s => s.text).join('')

    return {
      success: true,
      corrected_text: correctedFullText,
      changes: [],
      suggestions: [],
      segments: correctedSegments,
      words,
      service: 'gemini',
      model,
    }
  }

  // セグメントがない場合は従来の全文校正
  const customInstructions = customContext ? `\n\n追加の指示:\n${customContext}` : ''

  // AI校正用コンテキスト反映確認ログ
  if (customContext) {
    console.log('✓ AI Proofreading Context Applied (Gemini full text):', customContext)
  }

  const prompt = `あなたは優秀な校正者です。テキストを校正し、誤字脱字、文法エラー、不自然な表現を修正してください。
言語: ${language === 'ja' ? '日本語' : '英語'}${properNounsContext}${customInstructions}

以下のJSON形式で結果を返してください:
{
  "corrected_text": "校正後の全文",
  "changes": [
    {
      "type": "修正の種類（誤字、脱字、文法、表現など）",
      "original": "修正前のテキスト",
      "corrected": "修正後のテキスト",
      "reason": "修正理由"
    }
  ],
  "suggestions": ["追加の提案1", "追加の提案2"]
}

校正するテキスト:
${text}`

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    })

    const response = result.response
    const responseText = response.text()

    // JSONを抽出（```json ... ``` で囲まれている場合に対応）
    let jsonText = responseText
    const jsonMatch = jsonText.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const parsedResult = JSON.parse(jsonText)

    return {
      success: true,
      corrected_text: parsedResult.corrected_text || text,
      changes: parsedResult.changes || [],
      suggestions: parsedResult.suggestions || [],
      service: 'gemini',
      model,
    }
  } catch (error: any) {
    throw new Error(`Gemini API error: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      text,
      segments,
      words,
      service,
      model,
      language = 'ja',
      includeProperNouns = false,
      customContext = '',
      apiKey
    } = body

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    if (!service || !['openai', 'claude', 'gemini'].includes(service)) {
      return NextResponse.json(
        { error: 'Invalid service specified' },
        { status: 400 }
      )
    }

    if (!model) {
      return NextResponse.json(
        { error: 'Model is required' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      )
    }

    // 古いGeminiモデル名を新しいものに変換（後方互換性）
    let actualModel = model
    if (service === 'gemini') {
      const modelMigrations: { [key: string]: string } = {
        'gemini-1.5-flash-latest': 'gemini-1.5-flash',
        'gemini-1.5-pro-latest': 'gemini-1.5-pro',
        'gemini-2.5-flash-preview-05-20': 'gemini-2.0-flash-exp',
      }
      if (modelMigrations[model]) {
        actualModel = modelMigrations[model]
        console.log(`Migrating Gemini model: ${model} -> ${actualModel}`)
      }
    }

    let result

    if (service === 'openai') {
      result = await proofreadWithOpenAI(text, apiKey, actualModel, language, includeProperNouns, customContext, segments, words)
    } else if (service === 'claude') {
      result = await proofreadWithClaude(text, apiKey, actualModel, language, includeProperNouns, customContext, segments, words)
    } else if (service === 'gemini') {
      result = await proofreadWithGemini(text, apiKey, actualModel, language, includeProperNouns, customContext, segments, words)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Proofreading error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Proofreading failed',
      },
      { status: 500 }
    )
  }
}
