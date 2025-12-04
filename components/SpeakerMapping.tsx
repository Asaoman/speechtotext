'use client'

import { useState, useEffect } from 'react'
import { MovieSubtitleEntry, Character } from '@/lib/types'

interface SpeakerMappingProps {
  subtitles: MovieSubtitleEntry[]
  characters: Character[]
  onMappingComplete: (subtitles: MovieSubtitleEntry[]) => void
}

interface SpeakerInfo {
  speakerId: string
  count: number
  sampleTexts: string[]
  characterId?: string
}

export default function SpeakerMapping({
  subtitles,
  characters,
  onMappingComplete
}: SpeakerMappingProps) {
  const [speakerMap, setSpeakerMap] = useState<Map<string, string>>(new Map())
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([])

  // 話者情報を抽出（自動マッピング情報も含む）
  useEffect(() => {
    const speakerCounts = new Map<string, { count: number; samples: string[] }>()
    
    subtitles.forEach(subtitle => {
      // speakerIdまたはcharacterNameから話者を識別
      const speakerId = subtitle.speakerId || subtitle.characterName || 'UNKNOWN'
      
      if (speakerId && speakerId !== 'UNKNOWN') {
        const existing = speakerCounts.get(speakerId) || { count: 0, samples: [] }
        existing.count++
        if (existing.samples.length < 3) {
          existing.samples.push(subtitle.text.substring(0, 50))
        }
        speakerCounts.set(speakerId, existing)
      }
    })

    const speakerList: SpeakerInfo[] = []
    speakerCounts.forEach((info, speakerId) => {
      // 自動マッピングされたキャラクターを検索
      const autoMappedChar = characters.find(c => c.mappedSpeakerId === speakerId)
      const characterId = speakerMap.get(speakerId) || autoMappedChar?.id
      
      speakerList.push({
        speakerId,
        count: info.count,
        sampleTexts: info.samples,
        characterId
      })
    })

    // 出現回数でソート
    speakerList.sort((a, b) => b.count - a.count)
    setSpeakers(speakerList)
    
    // 自動マッピングが存在する場合は自動的にマップに追加
    if (speakerMap.size === 0) {
      const autoMap = new Map<string, string>()
      characters.forEach(char => {
        if (char.mappedSpeakerId && char.mappingConfidence && char.mappingConfidence >= 0.5) {
          autoMap.set(char.mappedSpeakerId, char.id)
        }
      })
      if (autoMap.size > 0) {
        setSpeakerMap(autoMap)
      }
    }
  }, [subtitles, characters])

  // キャラクターをマッピング
  const handleMapping = (speakerId: string, characterId: string | null) => {
    const newMap = new Map(speakerMap)
    if (characterId) {
      newMap.set(speakerId, characterId)
    } else {
      newMap.delete(speakerId)
    }
    setSpeakerMap(newMap)
  }

  // マッピングを適用
  const applyMapping = () => {
    const updated = subtitles.map(subtitle => {
      const speakerId = subtitle.speakerId || subtitle.characterName
      if (speakerId && speakerMap.has(speakerId)) {
        const characterId = speakerMap.get(speakerId)!
        const character = characters.find(c => c.id === characterId)
        return {
          ...subtitle,
          characterId,
          characterName: character?.name
        }
      }
      return subtitle
    })
    onMappingComplete(updated)
  }

  // 自動マッピング（名前が一致する場合）
  const autoMap = () => {
    const newMap = new Map<string, string>()
    
    speakers.forEach(speaker => {
      // 話者名とキャラクター名を比較
      const matchedChar = characters.find(c => 
        c.name.toLowerCase() === speaker.speakerId.toLowerCase() ||
        c.nameReading?.toLowerCase() === speaker.speakerId.toLowerCase()
      )
      if (matchedChar) {
        newMap.set(speaker.speakerId, matchedChar.id)
      }
    })
    
    setSpeakerMap(newMap)
  }

  if (speakers.length === 0) {
    return (
      <div className="card" style={{ padding: '1rem' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
          👥 話者マッピング
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
          話者情報が検出されませんでした。
          <br />
          WhisperXの話者分離機能を使用するか、SRTに話者タグを追加してください。
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          👥 話者マッピング
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={autoMap}
            className="btn"
            style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
            title="名前が一致するキャラクターを自動でマッピング"
          >
            🔮 自動マッピング
          </button>
          <button
            onClick={applyMapping}
            className="btn-primary"
            style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
          >
            ✓ 適用
          </button>
        </div>
      </div>

      <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        検出された話者をキャラクターに紐付けてください。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {speakers.map(speaker => {
          const mappedCharacter = speakerMap.has(speaker.speakerId)
            ? characters.find(c => c.id === speakerMap.get(speaker.speakerId))
            : null
          
          // 自動マッピング情報を取得
          const autoMappedChar = characters.find(c => c.mappedSpeakerId === speaker.speakerId)
          const confidence = autoMappedChar?.mappingConfidence || 0
          
          // 確信度に応じた色分け
          const getConfidenceColor = (conf: number) => {
            if (conf >= 0.8) return '#10b981' // 緑（高確信度）
            if (conf >= 0.5) return '#f59e0b' // オレンジ（中確信度）
            return '#ef4444' // 赤（低確信度）
          }
          
          const isAutoMapped = autoMappedChar && autoMappedChar.mappingConfidence && autoMappedChar.mappingConfidence >= 0.5
          const borderColor = mappedCharacter 
            ? (isAutoMapped ? getConfidenceColor(confidence) : 'var(--accent)')
            : 'var(--border)'

          return (
            <div
              key={speaker.speakerId}
              className="card"
              style={{
                padding: '0.75rem',
                borderColor,
                borderWidth: '2px',
                backgroundColor: mappedCharacter ? 'rgba(250, 204, 21, 0.05)' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* 話者情報 */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      color: 'var(--text)',
                      backgroundColor: 'var(--bg-subtle)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px'
                    }}>
                      {speaker.speakerId}
                    </span>
                    <span className="badge" style={{ fontSize: '9px' }}>
                      {speaker.count}件
                    </span>
                    {isAutoMapped && (
                      <span 
                        style={{ 
                          fontSize: '9px',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '4px',
                          backgroundColor: getConfidenceColor(confidence),
                          color: '#fff',
                          fontWeight: 600
                        }}
                        title={`自動マッピング確信度: ${Math.round(confidence * 100)}%`}
                      >
                        AI {Math.round(confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {speaker.sampleTexts.map((text, idx) => (
                      <div key={idx}>
                        「{text}{text.length >= 50 ? '...' : ''}」
                      </div>
                    ))}
                  </div>
                  {isAutoMapped && autoMappedChar.mappingConfidence && autoMappedChar.mappingConfidence < 0.8 && (
                    <div style={{ 
                      fontSize: '9px', 
                      color: '#f59e0b', 
                      marginTop: '0.25rem',
                      padding: '0.25rem',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      borderRadius: '4px'
                    }}>
                      ⚠️ 確信度が中程度です。手動で確認してください。
                    </div>
                  )}
                </div>

                {/* 矢印 */}
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>→</span>

                {/* キャラクター選択 */}
                <div style={{ minWidth: '150px' }}>
                  <select
                    value={speakerMap.get(speaker.speakerId) || autoMappedChar?.id || ''}
                    onChange={(e) => handleMapping(speaker.speakerId, e.target.value || null)}
                    className="input"
                    style={{ 
                      fontSize: '11px', 
                      width: '100%',
                      borderColor: isAutoMapped && !speakerMap.has(speaker.speakerId) 
                        ? getConfidenceColor(confidence) 
                        : undefined
                    }}
                  >
                    <option value="">キャラクターを選択</option>
                    {characters.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.mappedSpeakerId === speaker.speakerId && c.mappingConfidence 
                          ? ` (自動: ${Math.round(c.mappingConfidence * 100)}%)` 
                          : ''}
                      </option>
                    ))}
                  </select>
                  {isAutoMapped && speakerMap.get(speaker.speakerId) !== autoMappedChar?.id && (
                    <button
                      onClick={() => handleMapping(speaker.speakerId, autoMappedChar.id)}
                      style={{
                        fontSize: '9px',
                        padding: '0.25rem 0.5rem',
                        marginTop: '0.25rem',
                        backgroundColor: 'transparent',
                        border: `1px solid ${getConfidenceColor(confidence)}`,
                        color: getConfidenceColor(confidence),
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      自動マッピングを復元
                    </button>
                  )}
                </div>

                {/* マッピング済みインジケーター */}
                {mappedCharacter && (
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: mappedCharacter.color || 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#000',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                    title={mappedCharacter.name}
                  >
                    ✓
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* マッピング状況サマリー */}
      <div style={{ 
        marginTop: '1rem', 
        padding: '0.75rem', 
        backgroundColor: 'var(--bg-subtle)', 
        borderRadius: '4px',
        fontSize: '11px',
        color: 'var(--text-muted)'
      }}>
        <strong>マッピング状況:</strong> {speakerMap.size}/{speakers.length} 話者がキャラクターに紐付け済み
        {speakerMap.size < speakers.length && (
          <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
            ⚠️ 未割当の話者があります
          </span>
        )}
      </div>
    </div>
  )
}

