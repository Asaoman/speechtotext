import { NextRequest, NextResponse } from 'next/server'

// 簡易的なメモリストレージ（本番環境ではデータベースを使用）
// 注: この実装はデモ用です。本番環境ではVercel KVやPostgresを使用してください
let properNounsStore: any[] = []

export async function GET(request: NextRequest) {
  try {
    // カテゴリの一覧を取得
    const categories = Array.from(
      new Set(
        properNounsStore
          .map((noun) => noun.category)
          .filter((cat) => cat && cat.trim() !== '')
      )
    )

    return NextResponse.json(categories)
  } catch (error: any) {
    console.error('GET categories error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}
