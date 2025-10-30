import { NextRequest, NextResponse } from 'next/server'

// 簡易的なメモリストレージ（本番環境ではデータベースを使用）
// Vercelの各インスタンスで独立したメモリを持つため、本番ではVercel KVやPostgresを推奨
let properNounsStore: any[] = []

export async function GET(request: NextRequest) {
  try {
    // 本番環境ではデータベースから取得
    // 現在はクライアント側のlocalStorageを使用する前提なので、空配列を返す
    return NextResponse.json(properNounsStore)
  } catch (error: any) {
    console.error('GET proper nouns error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch proper nouns' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { term, reading, category, description } = body

    if (!term) {
      return NextResponse.json(
        { error: 'Term is required' },
        { status: 400 }
      )
    }

    const newNoun = {
      id: Date.now(),
      term,
      reading: reading || '',
      category: category || '',
      description: description || '',
      usage_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    properNounsStore.push(newNoun)

    return NextResponse.json(newNoun, { status: 201 })
  } catch (error: any) {
    console.error('POST proper noun error:', error)
    return NextResponse.json(
      { error: 'Failed to add proper noun' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const term = searchParams.get('term')

    if (!term) {
      return NextResponse.json(
        { error: 'Term is required' },
        { status: 400 }
      )
    }

    const index = properNounsStore.findIndex((noun) => noun.term === term)
    if (index === -1) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      )
    }

    properNounsStore.splice(index, 1)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE proper noun error:', error)
    return NextResponse.json(
      { error: 'Failed to delete proper noun' },
      { status: 500 }
    )
  }
}
