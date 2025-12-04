import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: 字幕セッション一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const id = searchParams.get('id')
    const includeEntries = searchParams.get('includeEntries') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 単一のセッション取得
    if (id) {
      const session = await prisma.subtitleSession.findUnique({
        where: { id },
        include: {
          project: { select: { id: true, name: true } },
          entries: includeEntries ? {
            orderBy: { index: 'asc' }
          } : false
        }
      })

      if (!session) {
        return NextResponse.json(
          { error: 'Subtitle session not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(session)
    }

    // 一覧取得
    const where = projectId ? { projectId } : {}

    const [sessions, total] = await Promise.all([
      prisma.subtitleSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
          _count: { select: { entries: true } }
        }
      }),
      prisma.subtitleSession.count({ where })
    ])

    return NextResponse.json({
      sessions,
      total,
      limit,
      offset,
      hasMore: offset + sessions.length < total
    })
  } catch (error: any) {
    console.error('GET subtitle sessions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subtitle sessions', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規字幕セッション保存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      projectId, 
      name,
      language, 
      sourceText,
      srtContent, 
      vttContent, 
      settings,
      entries 
    } = body

    if (!projectId || !language) {
      return NextResponse.json(
        { error: 'Project ID and language are required' },
        { status: 400 }
      )
    }

    // プロジェクトの存在確認
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // セッションと字幕エントリを一括作成
    const session = await prisma.subtitleSession.create({
      data: {
        projectId,
        name,
        language,
        sourceText,
        srtContent,
        vttContent,
        settings,
        totalEntries: entries?.length || 0,
        entries: entries ? {
          create: entries.map((entry: any) => ({
            index: entry.index,
            startTime: entry.startTime,
            endTime: entry.endTime,
            text: entry.text,
            lines: entry.lines || [entry.text],
          }))
        } : undefined
      },
      include: {
        project: { select: { id: true, name: true } },
        entries: { orderBy: { index: 'asc' } }
      }
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error: any) {
    console.error('POST subtitle session error:', error)
    return NextResponse.json(
      { error: 'Failed to save subtitle session', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: 字幕セッション更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, srtContent, vttContent, settings, entries } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // 既存のエントリを削除して新しいエントリを作成
    if (entries) {
      await prisma.subtitleEntry.deleteMany({
        where: { sessionId: id }
      })
    }

    const session = await prisma.subtitleSession.update({
      where: { id },
      data: {
        name,
        srtContent,
        vttContent,
        settings,
        totalEntries: entries?.length || undefined,
        entries: entries ? {
          create: entries.map((entry: any) => ({
            index: entry.index,
            startTime: entry.startTime,
            endTime: entry.endTime,
            text: entry.text,
            lines: entry.lines || [entry.text],
          }))
        } : undefined
      },
      include: {
        project: { select: { id: true, name: true } },
        entries: { orderBy: { index: 'asc' } }
      }
    })

    return NextResponse.json(session)
  } catch (error: any) {
    console.error('PUT subtitle session error:', error)
    return NextResponse.json(
      { error: 'Failed to update subtitle session', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: 字幕セッション削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    await prisma.subtitleSession.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE subtitle session error:', error)
    return NextResponse.json(
      { error: 'Failed to delete subtitle session', details: error.message },
      { status: 500 }
    )
  }
}

