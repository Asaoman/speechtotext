import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET: キャラクター一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const movieProjectId = searchParams.get('movieProjectId')
    const id = searchParams.get('id')

    // 単一のキャラクター取得
    if (id) {
      const character = await prisma.movieCharacter.findUnique({
        where: { id },
        include: {
          movieProject: { select: { id: true, title: true } }
        }
      })

      if (!character) {
        return NextResponse.json(
          { error: 'Character not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(character)
    }

    // 一覧取得
    if (!movieProjectId) {
      return NextResponse.json(
        { error: 'Movie project ID is required' },
        { status: 400 }
      )
    }

    const characters = await prisma.movieCharacter.findMany({
      where: { movieProjectId },
      orderBy: { name: 'asc' },
      include: {
        movieProject: { select: { id: true, title: true } }
      }
    })

    return NextResponse.json(characters)
  } catch (error: any) {
    console.error('GET characters error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch characters', details: error.message },
      { status: 500 }
    )
  }
}

// POST: 新規キャラクター作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      movieProjectId,
      name,
      nameReading,
      gender,
      ageGroup,
      speechStyle,
      firstPerson,
      secondPerson,
      sentenceEndings,
      characterTraits,
      sampleDialogues,
      speakerId,
      color
    } = body

    if (!movieProjectId || !name) {
      return NextResponse.json(
        { error: 'Movie project ID and name are required' },
        { status: 400 }
      )
    }

    const character = await prisma.movieCharacter.create({
      data: {
        movieProjectId,
        name,
        nameReading,
        gender: gender || 'unknown',
        ageGroup: ageGroup || 'adult',
        speechStyle: speechStyle || 'casual',
        firstPerson: firstPerson || '私',
        secondPerson: secondPerson || 'あなた',
        sentenceEndings,
        characterTraits,
        sampleDialogues,
        speakerId,
        color,
      },
      include: {
        movieProject: { select: { id: true, title: true } }
      }
    })

    return NextResponse.json(character, { status: 201 })
  } catch (error: any) {
    console.error('POST character error:', error)
    return NextResponse.json(
      { error: 'Failed to create character', details: error.message },
      { status: 500 }
    )
  }
}

// PUT: キャラクター更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      id,
      name,
      nameReading,
      gender,
      ageGroup,
      speechStyle,
      firstPerson,
      secondPerson,
      sentenceEndings,
      characterTraits,
      sampleDialogues,
      speakerId,
      color
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Character ID is required' },
        { status: 400 }
      )
    }

    const character = await prisma.movieCharacter.update({
      where: { id },
      data: {
        name,
        nameReading,
        gender,
        ageGroup,
        speechStyle,
        firstPerson,
        secondPerson,
        sentenceEndings,
        characterTraits,
        sampleDialogues,
        speakerId,
        color,
      },
      include: {
        movieProject: { select: { id: true, title: true } }
      }
    })

    return NextResponse.json(character)
  } catch (error: any) {
    console.error('PUT character error:', error)
    return NextResponse.json(
      { error: 'Failed to update character', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE: キャラクター削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Character ID is required' },
        { status: 400 }
      )
    }

    await prisma.movieCharacter.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE character error:', error)
    return NextResponse.json(
      { error: 'Failed to delete character', details: error.message },
      { status: 500 }
    )
  }
}

