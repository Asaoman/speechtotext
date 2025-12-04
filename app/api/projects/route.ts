import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: プロジェクト一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeStats = searchParams.get('includeStats') === 'true'

    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: includeStats ? {
        _count: {
          select: {
            transcriptions: true,
            proofreadingResults: true,
            subtitleSessions: true,
            movieProjects: true,
            properNouns: true,
          }
        }
      } : undefined
    })

    return NextResponse.json(projects)
  } catch (error: any) {
    console.error('GET projects error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規プロジェクト作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, customContext } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      )
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        customContext,
      }
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error: any) {
    console.error('POST project error:', error)
    return NextResponse.json(
      { error: 'Failed to create project', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: プロジェクト更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, description, customContext } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        name,
        description,
        customContext,
      }
    })

    return NextResponse.json(project)
  } catch (error: any) {
    console.error('PUT project error:', error)
    return NextResponse.json(
      { error: 'Failed to update project', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: プロジェクト削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    await prisma.project.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE project error:', error)
    return NextResponse.json(
      { error: 'Failed to delete project', details: error.message },
      { status: 500 }
    )
  }
}

