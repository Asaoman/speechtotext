import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: 映画字幕エントリ一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const movieProjectId = searchParams.get('movieProjectId')
    const id = searchParams.get('id')
    const limit = parseInt(searchParams.get('limit') || '500')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 単一の字幕エントリ取得
    if (id) {
      const subtitle = await prisma.movieSubtitleEntry.findUnique({
        where: { id },
        include: {
          character: { select: { id: true, name: true, color: true } }
        }
      })

      if (!subtitle) {
        return NextResponse.json(
          { error: 'Subtitle entry not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(subtitle)
    }

    // 一覧取得
    if (!movieProjectId) {
      return NextResponse.json(
        { error: 'Movie project ID is required' },
        { status: 400 }
      )
    }

    const [subtitles, total] = await Promise.all([
      prisma.movieSubtitleEntry.findMany({
        where: { movieProjectId },
        orderBy: { index: 'asc' },
        skip: offset,
        take: limit,
        include: {
          character: { select: { id: true, name: true, color: true } }
        }
      }),
      prisma.movieSubtitleEntry.count({ where: { movieProjectId } })
    ])

    return NextResponse.json({
      subtitles,
      total,
      limit,
      offset,
      hasMore: offset + subtitles.length < total
    })
  } catch (error: any) {
    console.error('GET movie subtitles error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch movie subtitles', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規字幕エントリ作成（バッチ対応）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { movieProjectId, subtitles } = body

    if (!movieProjectId) {
      return NextResponse.json(
        { error: 'Movie project ID is required' },
        { status: 400 }
      )
    }

    // 配列の場合はバッチ作成
    if (Array.isArray(subtitles)) {
      const created = await prisma.movieSubtitleEntry.createMany({
        data: subtitles.map((sub: any) => ({
          movieProjectId,
          characterId: sub.characterId || null,
          index: sub.index,
          startTime: sub.startTime,
          endTime: sub.endTime,
          originalText: sub.originalText || sub.text,
          translatedText: sub.translatedText,
          speakerId: sub.speakerId,
          isTranslated: sub.isTranslated || false,
          needsReview: sub.needsReview || false,
          notes: sub.notes,
        }))
      })

      return NextResponse.json({ 
        success: true, 
        count: created.count 
      }, { status: 201 })
    }

    // 単一作成
    const { 
      characterId,
      index,
      startTime,
      endTime,
      originalText,
      translatedText,
      speakerId,
      isTranslated,
      needsReview,
      notes
    } = body

    const subtitle = await prisma.movieSubtitleEntry.create({
      data: {
        movieProjectId,
        characterId,
        index,
        startTime,
        endTime,
        originalText,
        translatedText,
        speakerId,
        isTranslated: isTranslated || false,
        needsReview: needsReview || false,
        notes,
      },
      include: {
        character: { select: { id: true, name: true, color: true } }
      }
    })

    return NextResponse.json(subtitle, { status: 201 })
  } catch (error: any) {
    console.error('POST movie subtitle error:', error)
    return NextResponse.json(
      { error: 'Failed to create movie subtitle', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: 字幕エントリ更新（バッチ対応）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    // バッチ更新（replaceAll: 既存を削除して新規作成）
    if (body.replaceAll && body.movieProjectId && Array.isArray(body.subtitles)) {
      // 既存の字幕を全削除
      await prisma.movieSubtitleEntry.deleteMany({
        where: { movieProjectId: body.movieProjectId }
      })

      // 新規作成
      const created = await prisma.movieSubtitleEntry.createMany({
        data: body.subtitles.map((sub: any) => ({
          movieProjectId: body.movieProjectId,
          characterId: sub.characterId || null,
          index: sub.index,
          startTime: sub.startTime,
          endTime: sub.endTime,
          originalText: sub.originalText || sub.text,
          translatedText: sub.translatedText,
          speakerId: sub.speakerId,
          isTranslated: sub.isTranslated || false,
          needsReview: sub.needsReview || false,
          notes: sub.notes,
        }))
      })

      return NextResponse.json({ 
        success: true, 
        count: created.count 
      })
    }

    // 単一更新
    const { 
      id,
      characterId,
      originalText,
      translatedText,
      speakerId,
      isTranslated,
      needsReview,
      notes
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Subtitle ID is required' },
        { status: 400 }
      )
    }

    const subtitle = await prisma.movieSubtitleEntry.update({
      where: { id },
      data: {
        characterId,
        originalText,
        translatedText,
        speakerId,
        isTranslated,
        needsReview,
        notes,
      },
      include: {
        character: { select: { id: true, name: true, color: true } }
      }
    })

    return NextResponse.json(subtitle)
  } catch (error: any) {
    console.error('PUT movie subtitle error:', error)
    return NextResponse.json(
      { error: 'Failed to update movie subtitle', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: 字幕エントリ削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const movieProjectId = searchParams.get('movieProjectId')

    // プロジェクトの全字幕削除
    if (movieProjectId && !id) {
      const deleted = await prisma.movieSubtitleEntry.deleteMany({
        where: { movieProjectId }
      })
      return NextResponse.json({ success: true, count: deleted.count })
    }

    // 単一削除
    if (!id) {
      return NextResponse.json(
        { error: 'Subtitle ID is required' },
        { status: 400 }
      )
    }

    await prisma.movieSubtitleEntry.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE movie subtitle error:', error)
    return NextResponse.json(
      { error: 'Failed to delete movie subtitle', details: error.message },
      { status: 500 }
    )
  }
}

