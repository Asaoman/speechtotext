import { NextRequest, NextResponse } from 'next/server'
import { Character } from '@/lib/types'

export const runtime = 'nodejs'

// メモリ内ストレージ（実際のプロダクションではデータベースを使用）
let characters: Character[] = []

// 全キャラクター取得（プロジェクトIDでフィルタ可能）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    let result = characters
    if (projectId) {
      result = characters.filter(c => c.projectId === projectId)
    }

    return NextResponse.json({
      success: true,
      characters: result.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    })
  } catch (error: any) {
    console.error('Error fetching characters:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// 新規キャラクター作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectId,
      name,
      nameReading,
      gender = 'unknown',
      ageGroup = 'adult',
      speechStyle = 'casual',
      firstPerson = '私',
      secondPerson = 'あなた',
      sentenceEndings = [],
      characterTraits = '',
      sampleDialogues = [],
      speakerId,
      color
    } = body

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      )
    }

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Character name is required' },
        { status: 400 }
      )
    }

    // 同じプロジェクト内で同名のキャラクターがいないか確認
    const existingCharacter = characters.find(
      c => c.projectId === projectId && c.name.toLowerCase() === name.toLowerCase()
    )
    if (existingCharacter) {
      return NextResponse.json(
        { success: false, error: 'Character with this name already exists in this project' },
        { status: 400 }
      )
    }

    const newCharacter: Character = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      name: name.trim(),
      nameReading: nameReading?.trim() || undefined,
      gender,
      ageGroup,
      speechStyle,
      firstPerson,
      secondPerson,
      sentenceEndings: Array.isArray(sentenceEndings) ? sentenceEndings : [],
      characterTraits: characterTraits?.trim() || '',
      sampleDialogues: Array.isArray(sampleDialogues) ? sampleDialogues : [],
      speakerId: speakerId || undefined,
      color: color || generateRandomColor(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    characters.push(newCharacter)

    return NextResponse.json({
      success: true,
      character: newCharacter
    })
  } catch (error: any) {
    console.error('Error creating character:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// キャラクター更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Character ID is required' },
        { status: 400 }
      )
    }

    const index = characters.findIndex(c => c.id === id)
    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'Character not found' },
        { status: 404 }
      )
    }

    // 名前変更時の重複チェック
    if (updates.name) {
      const duplicate = characters.find(
        c => c.id !== id && 
             c.projectId === characters[index].projectId && 
             c.name.toLowerCase() === updates.name.toLowerCase()
      )
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: 'Character with this name already exists in this project' },
          { status: 400 }
        )
      }
    }

    characters[index] = {
      ...characters[index],
      ...updates,
      updated_at: new Date().toISOString()
    }

    return NextResponse.json({
      success: true,
      character: characters[index]
    })
  } catch (error: any) {
    console.error('Error updating character:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// キャラクター削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Character ID is required' },
        { status: 400 }
      )
    }

    const index = characters.findIndex(c => c.id === id)
    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'Character not found' },
        { status: 404 }
      )
    }

    characters.splice(index, 1)

    return NextResponse.json({
      success: true,
      message: 'Character deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting character:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ランダムカラー生成
function generateRandomColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF7F50'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

