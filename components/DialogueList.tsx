'use client'

import { useState, useRef, useEffect } from 'react'
import { formatTimestampSRT } from '@/lib/utils'

// セリフデータの型
export interface DialogueEntry {
  index: number
  startTime: number
  endTime: number
  originalText: string
  translatedText?: string
  characterId?: string
  characterName?: string
  confidence?: number
  isTranslated: boolean
}

// キャラクター情報
export interface CharacterInfo {
  id: string
  name: string
  dialogueCount: number
  color?: string
}

interface DialogueListProps {
  dialogues: DialogueEntry[]
  characters: CharacterInfo[]
  selectedCharacterId: string | null
  onDialogueSelect: (index: number) => void
  onDialogueEdit: (index: number, field: 'originalText' | 'translatedText' | 'characterId', value: string) => void
  onCharacterFilter: (characterId: string | null) => void
  selectedDialogueIndex: number | null
  isTranslating?: boolean
  translatingIndex?: number | null
}

// キャラクターごとの色を生成
const CHARACTER_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#a855f7',
  '#ef4444', '#22c55e', '#6366f1', '#eab308', '#d946ef'
]

function getCharacterColor(index: number): string {
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length]
}

export default function DialogueList({
  dialogues,
  characters,
  selectedCharacterId,
  onDialogueSelect,
  onDialogueEdit,
  onCharacterFilter,
  selectedDialogueIndex,
  isTranslating,
  translatingIndex
}: DialogueListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<'originalText' | 'translatedText' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showOnlyUntranslated, setShowOnlyUntranslated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // フィルタリング
  const filteredDialogues = dialogues.filter(d => {
    // キャラクターフィルタ
    if (selectedCharacterId && d.characterId !== selectedCharacterId) return false
    // 未翻訳フィルタ
    if (showOnlyUntranslated && d.isTranslated) return false
    // 検索クエリ
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchOriginal = d.originalText.toLowerCase().includes(query)
      const matchTranslated = d.translatedText?.toLowerCase().includes(query)
      const matchCharacter = d.characterName?.toLowerCase().includes(query)
      if (!matchOriginal && !matchTranslated && !matchCharacter) return false
    }
    return true
  })

  // 統計
  const stats = {
    total: dialogues.length,
    translated: dialogues.filter(d => d.isTranslated).length,
    filtered: filteredDialogues.length
  }

  // 編集開始
  const startEdit = (index: number, field: 'originalText' | 'translatedText') => {
    const dialogue = dialogues.find(d => d.index === index)
    if (!dialogue) return
    setEditingIndex(index)
    setEditingField(field)
    setEditValue(field === 'originalText' ? dialogue.originalText : (dialogue.translatedText || ''))
  }

  // 編集確定
  const confirmEdit = () => {
    if (editingIndex !== null && editingField) {
      onDialogueEdit(editingIndex, editingField, editValue)
    }
    setEditingIndex(null)
    setEditingField(null)
    setEditValue('')
  }

  // 編集キャンセル
  const cancelEdit = () => {
    setEditingIndex(null)
    setEditingField(null)
    setEditValue('')
  }

  // キーボードショートカット
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      confirmEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  // 選択されたアイテムにスクロール
  useEffect(() => {
    if (selectedDialogueIndex !== null) {
      const element = itemRefs.current.get(selectedDialogueIndex)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [selectedDialogueIndex])

  // キャラクターの色マップを作成
  const characterColorMap = new Map<string, string>()
  characters.forEach((c, i) => {
    characterColorMap.set(c.id, c.color || getCharacterColor(i))
  })

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      backgroundColor: 'var(--bg-card)',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* ヘッダー */}
      <div style={{ 
        padding: '1rem',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--border)',
        backgroundColor: 'var(--bg-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            💬 セリフ一覧
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {stats.translated}/{stats.total} 翻訳済み
          </span>
        </div>

        {/* 検索 */}
        <input
          type="text"
          placeholder="🔍 セリフ・キャラクター検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            fontSize: '12px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text)',
            marginBottom: '0.5rem'
          }}
        />

        {/* フィルタ */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={selectedCharacterId || ''}
            onChange={(e) => onCharacterFilter(e.target.value || null)}
            style={{
              flex: 1,
              minWidth: '120px',
              padding: '0.4rem 0.5rem',
              fontSize: '11px',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text)'
            }}
          >
            <option value="">全キャラクター ({stats.total})</option>
            {characters.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.dialogueCount})
              </option>
            ))}
          </select>
          
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.25rem',
            fontSize: '11px',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={showOnlyUntranslated}
              onChange={(e) => setShowOnlyUntranslated(e.target.checked)}
            />
            未翻訳のみ
          </label>
        </div>

        {/* フィルタ結果 */}
        {(selectedCharacterId || showOnlyUntranslated || searchQuery) && (
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '10px', 
            color: 'var(--accent)' 
          }}>
            {stats.filtered}件表示中
            <button
              onClick={() => {
                onCharacterFilter(null)
                setShowOnlyUntranslated(false)
                setSearchQuery('')
              }}
              style={{
                marginLeft: '0.5rem',
                padding: '0.125rem 0.375rem',
                fontSize: '10px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              クリア
            </button>
          </div>
        )}
      </div>

      {/* セリフリスト */}
      <div 
        ref={listRef}
        style={{ 
          flex: 1, 
          overflow: 'auto',
          padding: '0.5rem'
        }}
      >
        {filteredDialogues.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            {dialogues.length === 0 
              ? 'セリフデータがありません。SRTファイルまたは音声をインポートしてください。'
              : 'フィルタ条件に一致するセリフがありません。'
            }
          </div>
        ) : (
          filteredDialogues.map((dialogue) => {
            const charColor = characterColorMap.get(dialogue.characterId || '') || '#666'
            const isSelected = selectedDialogueIndex === dialogue.index
            const isCurrentlyTranslating = translatingIndex === dialogue.index

            return (
              <div
                key={dialogue.index}
                ref={(el) => {
                  if (el) itemRefs.current.set(dialogue.index, el)
                }}
                onClick={() => onDialogueSelect(dialogue.index)}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: isSelected 
                    ? 'rgba(245, 158, 11, 0.1)' 
                    : isCurrentlyTranslating
                      ? 'rgba(139, 92, 246, 0.1)'
                      : 'var(--bg)',
                  border: isSelected 
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* ヘッダー行 */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ 
                    fontSize: '10px', 
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace'
                  }}>
                    #{dialogue.index}
                  </span>
                  <span style={{ 
                    fontSize: '10px', 
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace'
                  }}>
                    {formatTimestampSRT(dialogue.startTime)}
                  </span>
                  {dialogue.characterName && (
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      fontSize: '10px',
                      fontWeight: 600,
                      backgroundColor: `${charColor}20`,
                      color: charColor,
                      borderRadius: '10px',
                      border: `1px solid ${charColor}40`
                    }}>
                      {dialogue.characterName}
                    </span>
                  )}
                  {dialogue.confidence !== undefined && dialogue.confidence < 0.8 && (
                    <span style={{ 
                      fontSize: '9px', 
                      color: '#f59e0b',
                      marginLeft: 'auto'
                    }}>
                      ⚠️ {Math.round(dialogue.confidence * 100)}%
                    </span>
                  )}
                  {dialogue.isTranslated && (
                    <span style={{ 
                      fontSize: '9px', 
                      color: '#10b981',
                      marginLeft: dialogue.confidence !== undefined && dialogue.confidence < 0.8 ? '0' : 'auto'
                    }}>
                      ✓
                    </span>
                  )}
                  {isCurrentlyTranslating && (
                    <span style={{ 
                      fontSize: '9px', 
                      color: '#8b5cf6',
                      marginLeft: 'auto'
                    }}>
                      🔄 翻訳中...
                    </span>
                  )}
                </div>

                {/* 原文 */}
                <div style={{ marginBottom: '0.375rem' }}>
                  {editingIndex === dialogue.index && editingField === 'originalText' ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={confirmEdit}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '0.375rem',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--accent)',
                        borderRadius: '4px',
                        color: 'var(--text)',
                        resize: 'vertical',
                        minHeight: '40px'
                      }}
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startEdit(dialogue.index, 'originalText')
                      }}
                      style={{
                        fontSize: '12px',
                        color: 'var(--text)',
                        lineHeight: 1.5,
                        cursor: 'text'
                      }}
                      title="ダブルクリックで編集"
                    >
                      {dialogue.originalText}
                    </div>
                  )}
                </div>

                {/* 翻訳文 */}
                <div style={{
                  paddingTop: '0.375rem',
                  borderTopWidth: '1px',
                  borderTopStyle: 'dashed',
                  borderTopColor: 'var(--border)'
                }}>
                  {editingIndex === dialogue.index && editingField === 'translatedText' ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={confirmEdit}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '0.375rem',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--accent)',
                        borderRadius: '4px',
                        color: 'var(--text)',
                        resize: 'vertical',
                        minHeight: '40px'
                      }}
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startEdit(dialogue.index, 'translatedText')
                      }}
                      style={{
                        fontSize: '12px',
                        color: dialogue.translatedText ? 'var(--accent)' : 'var(--text-muted)',
                        lineHeight: 1.5,
                        fontStyle: dialogue.translatedText ? 'normal' : 'italic',
                        cursor: 'text'
                      }}
                      title="ダブルクリックで編集"
                    >
                      {dialogue.translatedText || '（未翻訳 - ダブルクリックで入力）'}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 進捗バー */}
      <div style={{
        padding: '0.5rem 1rem',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--border)',
        backgroundColor: 'var(--bg-subtle)'
      }}>
        <div style={{
          width: '100%',
          height: '4px',
          backgroundColor: 'var(--border)',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${(stats.translated / stats.total) * 100}%`,
            height: '100%',
            backgroundColor: stats.translated === stats.total ? '#10b981' : 'var(--accent)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
    </div>
  )
}

