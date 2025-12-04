'use client'

import { useState } from 'react'

// キャラクター情報の型
export interface CharacterData {
  id: string
  name: string
  nameReading?: string
  gender: 'male' | 'female' | 'unknown'
  ageGroup: string
  speechStyle: string
  description: string
  dialogueCount: number
  firstPerson?: string
  secondPerson?: string
  sentenceEndings?: string[]
  color?: string
}

// 固有名詞の型
export interface ProperNoun {
  id: string
  name: string
  type: 'person' | 'place' | 'work' | 'term' | 'other'
  reading?: string
  translation?: string
  isConfirmed: boolean
}

interface CharacterPanelProps {
  characters: CharacterData[]
  properNouns: ProperNoun[]
  selectedCharacterId: string | null
  onCharacterSelect: (id: string | null) => void
  onCharacterUpdate: (character: CharacterData) => void
  onProperNounUpdate: (noun: ProperNoun) => void
  onProperNounConfirm: (id: string) => void
  onProperNounDelete: (id: string) => void
}

// 口調の選択肢
const SPEECH_STYLES = [
  { value: 'polite', label: '敬語' },
  { value: 'casual', label: 'タメ口' },
  { value: 'rough', label: '粗野' },
  { value: 'formal', label: 'フォーマル' },
  { value: 'childish', label: '幼児言葉' },
  { value: 'elderly', label: '老人風' },
  { value: 'archaic', label: '古風・時代劇' },
  { value: 'dialect', label: '方言' },
  { value: 'robot', label: 'ロボット・AI' },
  { value: 'noble', label: '貴族風' },
  { value: 'military', label: '軍人風' }
]

// 年齢層の選択肢
const AGE_GROUPS = [
  { value: 'child', label: '子供' },
  { value: 'teen', label: 'ティーン' },
  { value: 'young_adult', label: '若者' },
  { value: 'adult', label: '成人' },
  { value: 'middle_aged', label: '中年' },
  { value: 'elderly', label: '高齢者' }
]

// 一人称の選択肢
const FIRST_PERSONS = [
  '私', 'わたし', 'あたし', 'わたくし', '僕', 'ぼく', '俺', 'おれ', 'オレ',
  '自分', 'わし', '拙者', '余', '我', 'あたい', 'うち', 'おいら'
]

// キャラクターの色
const CHARACTER_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#a855f7'
]

// 固有名詞タイプの表示名
const NOUN_TYPE_LABELS: Record<string, string> = {
  person: '👤 人名',
  place: '📍 地名',
  work: '📚 作品名',
  term: '📝 専門用語',
  other: '📋 その他'
}

export default function CharacterPanel({
  characters,
  properNouns,
  selectedCharacterId,
  onCharacterSelect,
  onCharacterUpdate,
  onProperNounUpdate,
  onProperNounConfirm,
  onProperNounDelete
}: CharacterPanelProps) {
  const [activeTab, setActiveTab] = useState<'characters' | 'nouns'>('characters')
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
  const [editingNounId, setEditingNounId] = useState<string | null>(null)
  const [nounFilter, setNounFilter] = useState<string>('all')
  const [showUnconfirmedOnly, setShowUnconfirmedOnly] = useState(false)

  // フィルタリングされた固有名詞
  const filteredNouns = properNouns.filter(n => {
    if (nounFilter !== 'all' && n.type !== nounFilter) return false
    if (showUnconfirmedOnly && n.isConfirmed) return false
    return true
  })

  // 統計
  const stats = {
    characters: characters.length,
    nouns: properNouns.length,
    confirmedNouns: properNouns.filter(n => n.isConfirmed).length
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-card)',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* タブヘッダー */}
      <div style={{
        display: 'flex',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--border)',
        backgroundColor: 'var(--bg-subtle)'
      }}>
        <button
          onClick={() => setActiveTab('characters')}
          style={{
            flex: 1,
            padding: '0.75rem',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: activeTab === 'characters' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottomWidth: activeTab === 'characters' ? '2px' : '0',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--accent)',
            color: activeTab === 'characters' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          🎭 キャラクター ({stats.characters})
        </button>
        <button
          onClick={() => setActiveTab('nouns')}
          style={{
            flex: 1,
            padding: '0.75rem',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: activeTab === 'nouns' ? 'var(--bg-card)' : 'transparent',
            border: 'none',
            borderBottomWidth: activeTab === 'nouns' ? '2px' : '0',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--accent)',
            color: activeTab === 'nouns' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          📚 固有名詞 ({stats.confirmedNouns}/{stats.nouns})
        </button>
      </div>

      {/* キャラクタータブ */}
      {activeTab === 'characters' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem' }}>
          {characters.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px'
            }}>
              キャラクターがまだ識別されていません。<br />
              セリフをインポートすると自動識別されます。
            </div>
          ) : (
            characters.map((char, index) => {
              const isSelected = selectedCharacterId === char.id
              const isEditing = editingCharacterId === char.id
              const charColor = char.color || CHARACTER_COLORS[index % CHARACTER_COLORS.length]

              return (
                <div
                  key={char.id}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    backgroundColor: isSelected ? `${charColor}10` : 'var(--bg)',
                    border: isSelected ? `2px solid ${charColor}` : '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => onCharacterSelect(isSelected ? null : char.id)}
                >
                  {/* キャラクターヘッダー */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: charColor
                    }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {char.name}
                    </span>
                    {char.nameReading && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        ({char.nameReading})
                      </span>
                    )}
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '10px',
                      color: 'var(--text-muted)'
                    }}>
                      {char.dialogueCount} セリフ
                    </span>
                  </div>

                  {/* キャラクター情報 */}
                  {!isEditing ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      <div style={{ marginBottom: '0.25rem' }}>
                        {char.gender === 'male' ? '👨' : char.gender === 'female' ? '👩' : '🧑'}{' '}
                        {AGE_GROUPS.find(a => a.value === char.ageGroup)?.label || char.ageGroup}{' '}
                        / {SPEECH_STYLES.find(s => s.value === char.speechStyle)?.label || char.speechStyle}
                      </div>
                      {char.description && (
                        <div style={{ fontStyle: 'italic' }}>{char.description}</div>
                      )}
                      {char.firstPerson && (
                        <div style={{ marginTop: '0.25rem' }}>
                          一人称: <span style={{ color: 'var(--accent)' }}>{char.firstPerson}</span>
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingCharacterId(char.id)
                        }}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          fontSize: '10px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          color: 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        ✏️ 編集
                      </button>
                    </div>
                  ) : (
                    /* 編集フォーム */
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: '11px' }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>性別</label>
                          <select
                            value={char.gender}
                            onChange={(e) => onCharacterUpdate({ ...char, gender: e.target.value as any })}
                            style={{
                              width: '100%',
                              padding: '0.25rem',
                              fontSize: '11px',
                              backgroundColor: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              color: 'var(--text)'
                            }}
                          >
                            <option value="male">男性</option>
                            <option value="female">女性</option>
                            <option value="unknown">不明</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>年齢層</label>
                          <select
                            value={char.ageGroup}
                            onChange={(e) => onCharacterUpdate({ ...char, ageGroup: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '0.25rem',
                              fontSize: '11px',
                              backgroundColor: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              color: 'var(--text)'
                            }}
                          >
                            {AGE_GROUPS.map(ag => (
                              <option key={ag.value} value={ag.value}>{ag.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>口調</label>
                        <select
                          value={char.speechStyle}
                          onChange={(e) => onCharacterUpdate({ ...char, speechStyle: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.25rem',
                            fontSize: '11px',
                            backgroundColor: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          {SPEECH_STYLES.map(ss => (
                            <option key={ss.value} value={ss.value}>{ss.label}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>一人称</label>
                        <select
                          value={char.firstPerson || '私'}
                          onChange={(e) => onCharacterUpdate({ ...char, firstPerson: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.25rem',
                            fontSize: '11px',
                            backgroundColor: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          {FIRST_PERSONS.map(fp => (
                            <option key={fp} value={fp}>{fp}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => setEditingCharacterId(null)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          fontSize: '10px',
                          backgroundColor: 'var(--accent)',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        完了
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 固有名詞タブ */}
      {activeTab === 'nouns' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* フィルタ */}
          <div style={{
            padding: '0.75rem',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--border)'
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                value={nounFilter}
                onChange={(e) => setNounFilter(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '100px',
                  padding: '0.375rem',
                  fontSize: '11px',
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text)'
                }}
              >
                <option value="all">すべて</option>
                <option value="person">👤 人名</option>
                <option value="place">📍 地名</option>
                <option value="work">📚 作品名</option>
                <option value="term">📝 専門用語</option>
                <option value="other">📋 その他</option>
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
                  checked={showUnconfirmedOnly}
                  onChange={(e) => setShowUnconfirmedOnly(e.target.checked)}
                />
                未確認のみ
              </label>
            </div>
          </div>

          {/* 固有名詞リスト */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem' }}>
            {filteredNouns.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px'
              }}>
                {properNouns.length === 0
                  ? '固有名詞がまだ抽出されていません。'
                  : 'フィルタ条件に一致する固有名詞がありません。'
                }
              </div>
            ) : (
              filteredNouns.map((noun) => {
                const isEditing = editingNounId === noun.id

                return (
                  <div
                    key={noun.id}
                    style={{
                      padding: '0.5rem 0.75rem',
                      marginBottom: '0.375rem',
                      backgroundColor: noun.isConfirmed ? 'var(--bg)' : 'rgba(245, 158, 11, 0.05)',
                      border: noun.isConfirmed ? '1px solid var(--border)' : '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '6px'
                    }}
                  >
                    {!isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '12px' }}>
                          {NOUN_TYPE_LABELS[noun.type]?.split(' ')[0] || '📋'}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          {noun.name}
                        </span>
                        {noun.reading && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            ({noun.reading})
                          </span>
                        )}
                        {noun.translation && (
                          <span style={{ fontSize: '10px', color: 'var(--accent)' }}>
                            → {noun.translation}
                          </span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
                          {!noun.isConfirmed && (
                            <button
                              onClick={() => onProperNounConfirm(noun.id)}
                              style={{
                                padding: '0.125rem 0.375rem',
                                fontSize: '9px',
                                backgroundColor: '#10b981',
                                border: 'none',
                                borderRadius: '3px',
                                color: 'white',
                                cursor: 'pointer'
                              }}
                            >
                              ✓ 確定
                            </button>
                          )}
                          <button
                            onClick={() => setEditingNounId(noun.id)}
                            style={{
                              padding: '0.125rem 0.375rem',
                              fontSize: '9px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: '3px',
                              color: 'var(--text-muted)',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => onProperNounDelete(noun.id)}
                            style={{
                              padding: '0.125rem 0.375rem',
                              fontSize: '9px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: '3px',
                              color: '#ef4444',
                              cursor: 'pointer'
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 編集フォーム */
                      <div style={{ fontSize: '11px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>名称</label>
                            <input
                              type="text"
                              value={noun.name}
                              onChange={(e) => onProperNounUpdate({ ...noun, name: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '0.25rem',
                                fontSize: '11px',
                                backgroundColor: 'var(--bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>種類</label>
                            <select
                              value={noun.type}
                              onChange={(e) => onProperNounUpdate({ ...noun, type: e.target.value as any })}
                              style={{
                                width: '100%',
                                padding: '0.25rem',
                                fontSize: '11px',
                                backgroundColor: 'var(--bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            >
                              <option value="person">人名</option>
                              <option value="place">地名</option>
                              <option value="work">作品名</option>
                              <option value="term">専門用語</option>
                              <option value="other">その他</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>読み</label>
                            <input
                              type="text"
                              value={noun.reading || ''}
                              onChange={(e) => onProperNounUpdate({ ...noun, reading: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '0.25rem',
                                fontSize: '11px',
                                backgroundColor: 'var(--bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.125rem', color: 'var(--text-muted)' }}>翻訳</label>
                            <input
                              type="text"
                              value={noun.translation || ''}
                              onChange={(e) => onProperNounUpdate({ ...noun, translation: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '0.25rem',
                                fontSize: '11px',
                                backgroundColor: 'var(--bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingNounId(null)}
                          style={{
                            padding: '0.25rem 0.75rem',
                            fontSize: '10px',
                            backgroundColor: 'var(--accent)',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                          }}
                        >
                          完了
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

