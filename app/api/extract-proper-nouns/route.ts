/**
 * 固有名詞抽出API
 * 
 * Gemini APIを使用して、脚本、SRT字幕、音声書き起こし結果から
 * 固有名詞（人名、地名、組織名、作品名、専門用語）を抽出する
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { 
  ExtractedProperNoun, 
  ProperNounExtractionRequest, 
  ProperNounExtractionResult,
  ProperNounCategory 
} from '@/lib/types'
// Dynamic import for uuid to avoid Next.js build issues
const { v4: uuidv4 } = require('uuid')

export const runtime = 'nodejs'
export const maxDuration = 120

// 固有名詞抽出用のプロンプト
function buildExtractionPrompt(text: string, language: 'en' | 'ja', sourceType: string): string {
  const langName = language === 'ja' ? '日本語' : '英語'
  const sourceTypeName = sourceType === 'script' ? '脚本' : 
                         sourceType === 'srt' ? '字幕ファイル' : '音声書き起こし'
  
  return `あなたは映画/動画の固有名詞抽出の専門家です。
以下の${sourceTypeName}テキスト（${langName}）から固有名詞を抽出してください。

【抽出カテゴリ】
1. person: 人名（キャラクター名、俳優名、歴史上の人物）
2. place: 地名（国、都市、場所、建物）
3. organization: 組織名（会社、団体、機関）
4. work: 作品名（映画、本、曲、ゲーム）
5. technical: 専門用語（技術用語、業界用語、特殊な概念）
6. other: その他の固有名詞

【重要な注意事項】
- 脚本と実際のセリフでは表記が異なることがあります。考えられる表記ゆれも variants として含めてください。
- 日本語の場合は、ふりがな（reading）も推測してください。
- 出現コンテキスト（前後の文脈）を含めてください。
- 一般名詞や形容詞は除外してください。
- 信頼度（confidence）は0〜1の数値で、明確な固有名詞は0.9以上、曖昧なものは0.5〜0.7程度としてください。

【出力形式】
以下のJSON配列形式で出力してください。説明や余計なテキストは含めないでください。

[
  {
    "term": "抽出された固有名詞",
    "category": "person|place|organization|work|technical|other",
    "reading": "ふりがな（日本語の場合のみ）",
    "variants": ["表記ゆれ1", "表記ゆれ2"],
    "context": "出現した文脈（前後20文字程度）",
    "confidence": 0.95
  }
]

【入力テキスト】
${text.slice(0, 15000)}${text.length > 15000 ? '\n...(以下省略)' : ''}
`
}

// Gemini APIで固有名詞を抽出
async function extractWithGemini(
  text: string,
  language: 'en' | 'ja',
  sourceType: string,
  apiKey: string,
  modelName?: string
): Promise<ExtractedProperNoun[]> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName || 'gemini-3-flash-preview' })

  const prompt = buildExtractionPrompt(text, language, sourceType)

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,  // 低温度で安定した出力
        maxOutputTokens: 8192,
      },
    })

    const responseText = result.response.text()
    
    // JSONを抽出（マークダウンコードブロックを考慮）
    let jsonStr = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    } else {
      // 配列の開始と終了を探す
      const startIdx = responseText.indexOf('[')
      const endIdx = responseText.lastIndexOf(']')
      if (startIdx !== -1 && endIdx !== -1) {
        jsonStr = responseText.slice(startIdx, endIdx + 1)
      }
    }

    const parsed = JSON.parse(jsonStr)
    
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid response format: expected array')
    }

    // 各エントリにIDと承認フラグを追加
    return parsed.map((item: any) => ({
      id: uuidv4(),
      term: item.term || '',
      category: (item.category || 'other') as ProperNounCategory,
      reading: item.reading || undefined,
      variants: Array.isArray(item.variants) ? item.variants : [],
      context: item.context || '',
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
      approved: false,
    }))
  } catch (error: any) {
    console.error('Gemini extraction error:', error)
    throw new Error(`固有名詞抽出エラー: ${error.message}`)
  }
}

// 重複を排除
function deduplicateNouns(
  newNouns: ExtractedProperNoun[],
  existingNouns: ExtractedProperNoun[]
): { unique: ExtractedProperNoun[]; duplicates: number } {
  const existingTerms = new Set(
    existingNouns.flatMap(n => [n.term.toLowerCase(), ...n.variants.map(v => v.toLowerCase())])
  )

  const unique: ExtractedProperNoun[] = []
  let duplicates = 0

  for (const noun of newNouns) {
    const termLower = noun.term.toLowerCase()
    const isExisting = existingTerms.has(termLower) || 
                       noun.variants.some(v => existingTerms.has(v.toLowerCase()))

    if (isExisting) {
      duplicates++
    } else {
      unique.push(noun)
      existingTerms.add(termLower)
      noun.variants.forEach(v => existingTerms.add(v.toLowerCase()))
    }
  }

  return { unique, duplicates }
}

// SRTテキストからプレーンテキストを抽出
function extractTextFromSRT(srtContent: string): string {
  const lines = srtContent.split('\n')
  const textLines: string[] = []
  let inTextBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    
    // 空行
    if (!trimmed) {
      inTextBlock = false
      continue
    }
    
    // インデックス行（数字のみ）
    if (/^\d+$/.test(trimmed)) {
      continue
    }
    
    // タイムスタンプ行
    if (trimmed.includes('-->')) {
      inTextBlock = true
      continue
    }
    
    // テキスト行
    if (inTextBlock || !trimmed.match(/^\d+$/) && !trimmed.includes('-->')) {
      // 話者タグを除去 [Speaker] や (Speaker)
      const cleanText = trimmed
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/^\([^)]+\)\s*/, '')
        .replace(/<[^>]+>/g, '')  // HTMLタグ除去
      
      if (cleanText) {
        textLines.push(cleanText)
      }
    }
  }

  return textLines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const body: ProperNounExtractionRequest & { apiKey: string; geminiModelLight?: string } = await request.json()
    const { text, sourceType, language, existingNouns = [], apiKey, geminiModelLight } = body

    if (!text || !text.trim()) {
      return NextResponse.json(
        { success: false, error: 'テキストが空です' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Gemini APIキーが必要です' },
        { status: 400 }
      )
    }

    // SRTの場合はプレーンテキストを抽出
    let processedText = text
    if (sourceType === 'srt') {
      processedText = extractTextFromSRT(text)
    }

    console.log(`Extracting proper nouns from ${sourceType} (${language})...`)
    console.log(`Text length: ${processedText.length} characters`)

    // Geminiで抽出（軽量モデルを使用）
    const modelName = geminiModelLight || 'gemini-2.5-flash-lite'
    const extractedNouns = await extractWithGemini(
      processedText,
      language,
      sourceType,
      apiKey,
      modelName
    )

    console.log(`Extracted ${extractedNouns.length} proper nouns`)

    // 重複排除
    const { unique, duplicates } = deduplicateNouns(extractedNouns, existingNouns)

    console.log(`After deduplication: ${unique.length} new, ${duplicates} duplicates`)

    const result: ProperNounExtractionResult = {
      success: true,
      nouns: unique,
      totalFound: extractedNouns.length,
      newCount: unique.length,
      duplicateCount: duplicates,
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Proper noun extraction error:', error)
    return NextResponse.json(
      {
        success: false,
        nouns: [],
        totalFound: 0,
        newCount: 0,
        duplicateCount: 0,
        error: error.message || '固有名詞抽出に失敗しました',
      },
      { status: 500 }
    )
  }
}

