import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { outputDir, subDir, filename, content } = await request.json()

    if (!outputDir || typeof outputDir !== 'string') {
      return NextResponse.json({ success: false, error: 'outputDir is required' }, { status: 400 })
    }
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ success: false, error: 'filename is required' }, { status: 400 })
    }

    // Security: ensure the resolved path stays within outputDir
    const resolvedOutput = path.resolve(outputDir)
    const targetDir = subDir
      ? path.resolve(resolvedOutput, subDir)
      : resolvedOutput

    if (!targetDir.startsWith(resolvedOutput)) {
      return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 })
    }

    // Sanitize filename (no path separators)
    const safeFilename = path.basename(filename)

    fs.mkdirSync(targetDir, { recursive: true })
    const filePath = path.join(targetDir, safeFilename)
    fs.writeFileSync(filePath, content ?? '', 'utf-8')

    return NextResponse.json({ success: true, filePath })
  } catch (error: any) {
    console.error('[save-to-disk] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
