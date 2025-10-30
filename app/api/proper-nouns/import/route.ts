import { NextRequest, NextResponse } from 'next/server'

// 簡易的なメモリストレージ（本番環境ではデータベースを使用）
let properNounsStore: any[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text } = body

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    const lines = text.split('\n').filter((line: string) => line.trim())
    let count = 0

    for (const line of lines) {
      const parts = line.split(',').map((p: string) => p.trim())
      if (parts.length > 0 && parts[0]) {
        const newNoun = {
          id: Date.now() + count,
          term: parts[0],
          reading: parts[1] || '',
          category: parts[2] || '',
          description: parts[3] || '',
          usage_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        // 重複チェック
        const exists = properNounsStore.some((noun) => noun.term === newNoun.term)
        if (!exists) {
          properNounsStore.push(newNoun)
          count++
        }
      }
    }

    return NextResponse.json({ count })
  } catch (error: any) {
    console.error('Import proper nouns error:', error)
    return NextResponse.json(
      { error: 'Failed to import proper nouns' },
      { status: 500 }
    )
  }
}
