import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

interface FileEntry {
  name: string
  filePath: string
  size: number
  createdAt: string
  subDir: string
}

function walkDir(dir: string, baseDir: string, results: FileEntry[], depth = 0) {
  if (depth > 4) return
  if (!fs.existsSync(dir)) return

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, results, depth + 1)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (['.txt', '.json', '.srt', '.vtt'].includes(ext)) {
        const stat = fs.statSync(fullPath)
        const relDir = path.relative(baseDir, dir)
        results.push({
          name: entry.name,
          filePath: fullPath,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          subDir: relDir || '.',
        })
      }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const outputDir = searchParams.get('outputDir')

    if (!outputDir) {
      return NextResponse.json({ files: [] })
    }

    const resolvedDir = path.resolve(outputDir)
    if (!fs.existsSync(resolvedDir)) {
      return NextResponse.json({ files: [] })
    }

    const results: FileEntry[] = []
    walkDir(resolvedDir, resolvedDir, results)

    // Sort by createdAt descending, limit to 100 most recent
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const limited = results.slice(0, 100)

    return NextResponse.json({ files: limited })
  } catch (error: any) {
    console.error('[list-files] Error:', error)
    return NextResponse.json({ files: [], error: error.message })
  }
}
