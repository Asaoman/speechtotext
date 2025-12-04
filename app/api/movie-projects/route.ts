import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: 映画プロジェクト一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const id = searchParams.get('id')
    const includeAll = searchParams.get('includeAll') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 単一のプロジェクト取得
    if (id) {
      const movieProject = await prisma.movieProject.findUnique({
        where: { id },
        include: {
          project: { select: { id: true, name: true } },
          characters: includeAll ? { orderBy: { name: 'asc' } } : false,
          subtitles: includeAll ? { orderBy: { index: 'asc' } } : false,
          _count: { select: { characters: true, subtitles: true } }
        }
      })

      if (!movieProject) {
        return NextResponse.json(
          { error: 'Movie project not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(movieProject)
    }

    // 一覧取得
    const where = projectId ? { projectId } : {}

    const [movieProjects, total] = await Promise.all([
      prisma.movieProject.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
          _count: { select: { characters: true, subtitles: true } }
        }
      }),
      prisma.movieProject.count({ where })
    ])

    return NextResponse.json({
      movieProjects,
      total,
      limit,
      offset,
      hasMore: offset + movieProjects.length < total
    })
  } catch (error: any) {
    console.error('GET movie projects error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch movie projects', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規映画プロジェクト作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      projectId,
      title,
      originalLanguage,
      targetLanguage,
      genres,
      eraSetting,
      targetAudience,
      translationStyle,
      toneDescription,
      specialInstructions,
      glossary,
      preset,
      settings
    } = body

    if (!projectId || !title) {
      return NextResponse.json(
        { error: 'Project ID and title are required' },
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

    const movieProject = await prisma.movieProject.create({
      data: {
        projectId,
        title,
        originalLanguage: originalLanguage || 'en',
        targetLanguage: targetLanguage || 'ja',
        genres,
        eraSetting,
        targetAudience,
        translationStyle,
        toneDescription,
        specialInstructions,
        glossary,
        preset,
        settings,
      },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { characters: true, subtitles: true } }
      }
    })

    return NextResponse.json(movieProject, { status: 201 })
  } catch (error: any) {
    console.error('POST movie project error:', error)
    return NextResponse.json(
      { error: 'Failed to create movie project', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: 映画プロジェクト更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      id,
      title,
      originalLanguage,
      targetLanguage,
      genres,
      eraSetting,
      targetAudience,
      translationStyle,
      toneDescription,
      specialInstructions,
      glossary,
      preset,
      settings
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Movie project ID is required' },
        { status: 400 }
      )
    }

    const movieProject = await prisma.movieProject.update({
      where: { id },
      data: {
        title,
        originalLanguage,
        targetLanguage,
        genres,
        eraSetting,
        targetAudience,
        translationStyle,
        toneDescription,
        specialInstructions,
        glossary,
        preset,
        settings,
      },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { characters: true, subtitles: true } }
      }
    })

    return NextResponse.json(movieProject)
  } catch (error: any) {
    console.error('PUT movie project error:', error)
    return NextResponse.json(
      { error: 'Failed to update movie project', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: 映画プロジェクト削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Movie project ID is required' },
        { status: 400 }
      )
    }

    await prisma.movieProject.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE movie project error:', error)
    return NextResponse.json(
      { error: 'Failed to delete movie project', details: error.message },
      { status: 500 }
    )
  }
}

