import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('path')

  if (!filePath) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  try {
    const resolved = path.resolve(filePath)
    const content = fs.readFileSync(resolved, 'utf-8')
    const name = path.basename(resolved)
    return NextResponse.json({ content, name, path: resolved })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/** List all .md files in a directory */
export async function POST(request: NextRequest) {
  try {
    const { dir } = await request.json()
    if (!dir) return NextResponse.json({ error: 'dir required' }, { status: 400 })
    const resolved = path.resolve(dir)
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map((e) => ({ name: e.name, path: path.join(resolved, e.name) }))
    return NextResponse.json({ files })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
