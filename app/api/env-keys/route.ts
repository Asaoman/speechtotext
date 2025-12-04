import { NextResponse } from 'next/server'

// 環境変数からAPIキーを取得するエンドポイント
// セキュリティ上、サーバーサイドでのみ環境変数にアクセス可能
export async function GET() {
  return NextResponse.json({
    openai: process.env.OPENAI_API_KEY || '',
    elevenlabs: process.env.ELEVENLABS_API_KEY || '',
    gemini: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
    claude: process.env.ANTHROPIC_API_KEY || '',
  })
}

