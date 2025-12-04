import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST: localStorageからDBへのマイグレーション
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projects, dictionaries, dictionaryEntries } = body

    const results = {
      projectsCreated: 0,
      projectsSkipped: 0,
      properNounsCreated: 0,
      errors: [] as string[]
    }

    // プロジェクトのマイグレーション
    if (projects && Array.isArray(projects)) {
      for (const project of projects) {
        try {
          // 既存のプロジェクトをチェック（名前で重複確認）
          const existing = await prisma.project.findFirst({
            where: { name: project.name }
          })

          if (existing) {
            results.projectsSkipped++
            continue
          }

          // 新規プロジェクト作成
          const newProject = await prisma.project.create({
            data: {
              id: project.id || undefined, // IDが指定されていれば使用
              name: project.name,
              description: project.description,
              customContext: project.customContext,
              createdAt: project.created_at ? new Date(project.created_at) : undefined,
              updatedAt: project.updated_at ? new Date(project.updated_at) : undefined,
            }
          })

          results.projectsCreated++

          // 固有名詞（辞書エントリ）のマイグレーション
          if (dictionaryEntries && dictionaryEntries[project.id]) {
            const entries = dictionaryEntries[project.id]
            for (const entry of entries) {
              try {
                await prisma.properNoun.create({
                  data: {
                    projectId: newProject.id,
                    term: entry.term,
                    reading: entry.reading,
                    category: 'other',
                    approved: true,
                  }
                })
                results.properNounsCreated++
              } catch (entryError: any) {
                // 重複エラーなどはスキップ
                if (!entryError.message?.includes('Unique constraint')) {
                  results.errors.push(`Entry error: ${entry.term} - ${entryError.message}`)
                }
              }
            }
          }
        } catch (projectError: any) {
          results.errors.push(`Project error: ${project.name} - ${projectError.message}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: error.message },
      { status: 500 }
    )
  }
}

// GET: マイグレーション状態確認
export async function GET() {
  try {
    const [projectCount, properNounCount, transcriptionCount] = await Promise.all([
      prisma.project.count(),
      prisma.properNoun.count(),
      prisma.transcription.count(),
    ])

    return NextResponse.json({
      dbStatus: {
        projects: projectCount,
        properNouns: properNounCount,
        transcriptions: transcriptionCount,
      },
      ready: true
    })
  } catch (error: any) {
    // DBに接続できない場合
    return NextResponse.json({
      dbStatus: null,
      ready: false,
      error: error.message
    })
  }
}

