import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json()

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ success: false, error: 'filePath is required' }, { status: 400 })
    }

    const resolved = path.resolve(filePath)

    // Open the containing folder and select the file (Windows)
    // On other platforms, open the folder
    const platform = process.platform
    let cmd: string

    if (platform === 'win32') {
      if (fs.existsSync(resolved)) {
        cmd = `explorer /select,"${resolved}"`
      } else {
        const dir = path.dirname(resolved)
        cmd = `explorer "${dir}"`
      }
    } else if (platform === 'darwin') {
      cmd = `open -R "${resolved}"`
    } else {
      const dir = fs.existsSync(resolved) ? path.dirname(resolved) : resolved
      cmd = `xdg-open "${dir}"`
    }

    exec(cmd, (err) => {
      if (err) console.error('[open-file] exec error:', err)
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[open-file] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
