import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - pdf-parse has no type definitions
import pdf from 'pdf-parse'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'PDFファイルが必要です'
      }, { status: 400 })
    }

    // ファイルをバッファに変換
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // PDFをパース
    const data = await pdf(buffer)

    return NextResponse.json({
      success: true,
      text: data.text,
      numPages: data.numpages,
      info: data.info
    })

  } catch (error: any) {
    console.error('PDF parse error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'PDFの解析に失敗しました'
    }, { status: 500 })
  }
}

