import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: 書き起こし履歴一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const id = searchParams.get('id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 単一の書き起こし取得
    if (id) {
      const transcription = await prisma.transcription.findUnique({
        where: { id },
        include: {
          project: { select: { id: true, name: true } },
          proofreading: true
        }
      })

      if (!transcription) {
        return NextResponse.json(
          { error: 'Transcription not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(transcription)
    }

    // 一覧取得
    const where = projectId ? { projectId } : {}

    const [transcriptions, total] = await Promise.all([
      prisma.transcription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
          proofreading: { select: { id: true, service: true, createdAt: true } }
        }
      }),
      prisma.transcription.count({ where })
    ])

    return NextResponse.json({
      transcriptions,
      total,
      limit,
      offset,
      hasMore: offset + transcriptions.length < total
    })
  } catch (error: any) {
    console.error('GET transcriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transcriptions', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規書き起こし保存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, fileName, service, language, text, segments, words, duration } = body

    if (!projectId || !text) {
      return NextResponse.json(
        { error: 'Project ID and text are required' },
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

    const transcription = await prisma.transcription.create({
      data: {
        projectId,
        fileName,
        service: service || 'unknown',
        language,
        text,
        segments,
        words,
        duration,
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    return NextResponse.json(transcription, { status: 201 })
  } catch (error: any) {
    console.error('POST transcription error:', error)
    return NextResponse.json(
      { error: 'Failed to save transcription', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: 書き起こし更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, text, segments, words } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Transcription ID is required' },
        { status: 400 }
      )
    }

    const transcription = await prisma.transcription.update({
      where: { id },
      data: {
        text,
        segments,
        words,
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    return NextResponse.json(transcription)
  } catch (error: any) {
    console.error('PUT transcription error:', error)
    return NextResponse.json(
      { error: 'Failed to update transcription', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: 書き起こし削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Transcription ID is required' },
        { status: 400 }
      )
    }

    await prisma.transcription.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE transcription error:', error)
    return NextResponse.json(
      { error: 'Failed to delete transcription', details: error.message },
      { status: 500 }
    )
  }
}

