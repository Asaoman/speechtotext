import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: 校正結果一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const id = searchParams.get('id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 単一の校正結果取得
    if (id) {
      const result = await prisma.proofreadingResult.findUnique({
        where: { id },
        include: {
          project: { select: { id: true, name: true } },
          transcription: { select: { id: true, fileName: true, service: true, createdAt: true } }
        }
      })

      if (!result) {
        return NextResponse.json(
          { error: 'Proofreading result not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(result)
    }

    // 一覧取得
    const where = projectId ? { projectId } : {}

    const [results, total] = await Promise.all([
      prisma.proofreadingResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
          transcription: { select: { id: true, fileName: true, service: true } }
        }
      }),
      prisma.proofreadingResult.count({ where })
    ])

    return NextResponse.json({
      results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total
    })
  } catch (error: any) {
    console.error('GET proofreading results error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch proofreading results', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規校正結果保存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      projectId, 
      transcriptionId,
      service, 
      model,
      language,
      originalText, 
      correctedText, 
      changes, 
      suggestions 
    } = body

    if (!projectId || !originalText || !correctedText) {
      return NextResponse.json(
        { error: 'Project ID, original text, and corrected text are required' },
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

    const result = await prisma.proofreadingResult.create({
      data: {
        projectId,
        transcriptionId,
        service: service || 'unknown',
        model,
        language,
        originalText,
        correctedText,
        changes,
        suggestions,
      },
      include: {
        project: { select: { id: true, name: true } },
        transcription: { select: { id: true, fileName: true, service: true } }
      }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('POST proofreading result error:', error)
    return NextResponse.json(
      { error: 'Failed to save proofreading result', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: 校正結果更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, correctedText, changes, suggestions } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Proofreading result ID is required' },
        { status: 400 }
      )
    }

    const result = await prisma.proofreadingResult.update({
      where: { id },
      data: {
        correctedText,
        changes,
        suggestions,
      },
      include: {
        project: { select: { id: true, name: true } },
        transcription: { select: { id: true, fileName: true, service: true } }
      }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('PUT proofreading result error:', error)
    return NextResponse.json(
      { error: 'Failed to update proofreading result', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: 校正結果削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Proofreading result ID is required' },
        { status: 400 }
      )
    }

    await prisma.proofreadingResult.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE proofreading result error:', error)
    return NextResponse.json(
      { error: 'Failed to delete proofreading result', details: error.message },
      { status: 500 }
    )
  }
}

