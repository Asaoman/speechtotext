'use client'

import { useState, useEffect } from 'react'
import { TranscriptionResult, ProofreadingResult } from '@/lib/types'

type HistoryTab = 'transcriptions' | 'proofreading' | 'subtitles' | 'movieProjects'

interface TranscriptionHistoryItem {
  id: string
  fileName: string | null
  service: string
  language: string | null
  text: string
  createdAt: string
  project: { id: string; name: string } | null
  proofreading?: { id: string } | null
}

interface ProofreadingHistoryItem {
  id: string
  service: string
  originalText: string
  correctedText: string
  createdAt: string
  project: { id: string; name: string } | null
}

interface SubtitleHistoryItem {
  id: string
  name: string | null
  language: string
  totalEntries: number
  createdAt: string
  project: { id: string; name: string } | null
}

interface MovieProjectHistoryItem {
  id: string
  title: string
  originalLanguage: string
  targetLanguage: string
  translationStyle: string | null
  createdAt: string
  updatedAt: string
  _count?: {
    characters: number
    subtitles: number
  }
}

interface HistorySidebarProps {
  isOpen: boolean
  onToggle: () => void
  onLoadTranscription?: (data: TranscriptionResult, meta?: any) => void
  onLoadProofreading?: (data: ProofreadingResult, meta?: any) => void
  onLoadSubtitles?: (data: any) => void
  onLoadMovieProject?: (projectId: string) => void
  currentProjectId?: string | null
}

export default function HistorySidebar({
  isOpen,
  onToggle,
  onLoadTranscription,
  onLoadProofreading,
  onLoadSubtitles,
  onLoadMovieProject,
  currentProjectId
}: HistorySidebarProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>('transcriptions')
  const [transcriptions, setTranscriptions] = useState<TranscriptionHistoryItem[]>([])
  const [proofreadingResults, setProofreadingResults] = useState<ProofreadingHistoryItem[]>([])
  const [subtitleSessions, setSubtitleSessions] = useState<SubtitleHistoryItem[]>([])
  const [movieProjects, setMovieProjects] = useState<MovieProjectHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // データ取得
  useEffect(() => {
    if (isOpen) {
      loadHistory()
    }
  }, [isOpen, activeTab, currentProjectId])

  const loadHistory = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const projectQuery = currentProjectId ? `?projectId=${currentProjectId}` : ''
      
      if (activeTab === 'transcriptions') {
        const res = await fetch(`/api/transcriptions${projectQuery}`)
        if (res.ok) {
          const data = await res.json()
          setTranscriptions(data.transcriptions || [])
        }
      } else if (activeTab === 'proofreading') {
        const res = await fetch(`/api/proofreading-results${projectQuery}`)
        if (res.ok) {
          const data = await res.json()
          setProofreadingResults(data.results || [])
        }
      } else if (activeTab === 'subtitles') {
        const res = await fetch(`/api/subtitle-sessions${projectQuery}`)
        if (res.ok) {
          const data = await res.json()
          setSubtitleSessions(data.sessions || [])
        }
      } else if (activeTab === 'movieProjects') {
        const res = await fetch(`/api/movie-projects${projectQuery}`)
        if (res.ok) {
          const data = await res.json()
          setMovieProjects(data.movieProjects || [])
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 書き起こし読み込み
  const handleLoadTranscription = async (item: TranscriptionHistoryItem) => {
    if (!onLoadTranscription) return
    
    try {
      const res = await fetch(`/api/transcriptions?id=${item.id}`)
      if (res.ok) {
        const data = await res.json()
        const transcriptionResult: TranscriptionResult = {
          text: data.text,
          language: data.language,
          segments: data.segments,
          words: data.words,
        }
        onLoadTranscription(transcriptionResult, {
          id: data.id,
          fileName: data.fileName,
          service: data.service,
          createdAt: data.createdAt,
        })
      }
    } catch (err) {
      console.error('Failed to load transcription:', err)
    }
  }

  // 校正結果読み込み
  const handleLoadProofreading = async (item: ProofreadingHistoryItem) => {
    if (!onLoadProofreading) return
    
    try {
      const res = await fetch(`/api/proofreading-results?id=${item.id}`)
      if (res.ok) {
        const data = await res.json()
        const proofreadingResult: ProofreadingResult = {
          success: true,
          corrected_text: data.correctedText,
          changes: data.changes || [],
          suggestions: data.suggestions || [],
          service: data.service,
          model: data.model,
        }
        onLoadProofreading(proofreadingResult, {
          id: data.id,
          originalText: data.originalText,
          createdAt: data.createdAt,
        })
      }
    } catch (err) {
      console.error('Failed to load proofreading:', err)
    }
  }

  // 字幕読み込み
  const handleLoadSubtitles = async (item: SubtitleHistoryItem) => {
    if (!onLoadSubtitles) return
    
    try {
      const res = await fetch(`/api/subtitle-sessions?id=${item.id}&includeEntries=true`)
      if (res.ok) {
        const data = await res.json()
        onLoadSubtitles(data)
      }
    } catch (err) {
      console.error('Failed to load subtitles:', err)
    }
  }

  // 削除
  const handleDelete = async (type: HistoryTab, id: string) => {
    if (!confirm('この履歴を削除しますか？')) return
    
    try {
      let endpoint = ''
      if (type === 'transcriptions') endpoint = `/api/transcriptions?id=${id}`
      else if (type === 'proofreading') endpoint = `/api/proofreading-results?id=${id}`
      else if (type === 'subtitles') endpoint = `/api/subtitle-sessions?id=${id}`
      else if (type === 'movieProjects') endpoint = `/api/movie-projects?id=${id}`
      
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (res.ok) {
        loadHistory()
      }
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // テキストを短縮
  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'fixed',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '0.75rem 0.5rem',
          background: 'var(--card-bg)',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          borderLeft: 'none',
          cursor: 'pointer',
          zIndex: 100,
          fontSize: '12px',
          writingMode: 'vertical-rl',
          color: 'var(--text-muted)'
        }}
      >
        📂 履歴
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      width: '320px',
      background: 'var(--card-bg)',
      borderRight: '1px solid var(--border)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '4px 0 12px rgba(0,0,0,0.1)'
    }}>
      {/* ヘッダー */}
      <div style={{
        padding: '1rem',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
          📂 処理履歴
        </h2>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'var(--text-muted)'
          }}
        >
          ✕
        </button>
      </div>

      {/* タブ */}
      <div style={{
        display: 'flex',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--border)'
      }}>
        {[
          { id: 'transcriptions' as const, label: '書き起こし', icon: '📝' },
          { id: 'proofreading' as const, label: '校正', icon: '✏️' },
          { id: 'subtitles' as const, label: '字幕', icon: '🎬' },
          { id: 'movieProjects' as const, label: '映画字幕', icon: '🎭' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '0.75rem 0.5rem',
              fontSize: '11px',
              fontWeight: 600,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              cursor: 'pointer'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>
            読み込み中...
          </div>
        )}

        {error && (
          <div style={{ 
            padding: '1rem', 
            margin: '0.5rem',
            background: 'rgba(239, 68, 68, 0.1)', 
            borderRadius: '6px',
            fontSize: '11px',
            color: 'rgb(239, 68, 68)'
          }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* 書き起こし履歴 */}
            {activeTab === 'transcriptions' && (
              transcriptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>
                  履歴がありません
                </div>
              ) : (
                transcriptions.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: 'var(--bg)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => handleLoadTranscription(item)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: '12px', 
                          fontWeight: 600, 
                          color: 'var(--text)',
                          marginBottom: '0.25rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.fileName || '無題'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          {item.service} • {item.language || 'auto'} • {formatDate(item.createdAt)}
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {truncateText(item.text)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete('transcriptions', item.id)
                        }}
                        style={{
                          background: 'none',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderBottom: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          padding: '0.25rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )
            )}

            {/* 校正履歴 */}
            {activeTab === 'proofreading' && (
              proofreadingResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>
                  履歴がありません
                </div>
              ) : (
                proofreadingResults.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: 'var(--bg)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => handleLoadProofreading(item)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          {item.service} • {formatDate(item.createdAt)}
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {truncateText(item.correctedText)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete('proofreading', item.id)
                        }}
                        style={{
                          background: 'none',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderBottom: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          padding: '0.25rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )
            )}

            {/* 字幕履歴 */}
            {activeTab === 'subtitles' && (
              subtitleSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>
                  履歴がありません
                </div>
              ) : (
                subtitleSessions.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: 'var(--bg)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => handleLoadSubtitles(item)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: '12px', 
                          fontWeight: 600, 
                          color: 'var(--text)',
                          marginBottom: '0.25rem'
                        }}>
                          {item.name || '無題のセッション'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {item.language === 'ja' ? '日本語' : '英語'} • {item.totalEntries}件 • {formatDate(item.createdAt)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete('subtitles', item.id)
                        }}
                        style={{
                          background: 'none',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderBottom: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          padding: '0.25rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )
            )}

            {/* 映画字幕プロジェクト履歴 */}
            {activeTab === 'movieProjects' && (
              movieProjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>
                  映画字幕プロジェクトがありません
                </div>
              ) : (
                movieProjects.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: 'var(--bg)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => onLoadMovieProject?.(item.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: '12px', 
                          fontWeight: 600, 
                          color: 'var(--text)',
                          marginBottom: '0.25rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          🎬 {item.title}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          {item.originalLanguage === 'en' ? '英語' : item.originalLanguage === 'ja' ? '日本語' : item.originalLanguage} → {item.targetLanguage === 'ja' ? '日本語' : item.targetLanguage === 'en' ? '英語' : item.targetLanguage}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {item._count?.characters || 0}キャラ • {item._count?.subtitles || 0}字幕 • {formatDate(item.updatedAt)}
                        </div>
                        {item.translationStyle && (
                          <div style={{ 
                            fontSize: '9px', 
                            color: 'var(--accent)',
                            marginTop: '0.25rem'
                          }}>
                            {item.translationStyle}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete('movieProjects', item.id)
                        }}
                        style={{
                          background: 'none',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderBottom: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          padding: '0.25rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )
            )}
          </>
        )}
      </div>

      {/* フッター */}
      <div style={{
        padding: '0.75rem 1rem',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--border)',
        fontSize: '10px',
        color: 'var(--text-muted)',
        textAlign: 'center'
      }}>
        {currentProjectId ? 'プロジェクトの履歴を表示中' : '全履歴を表示中'}
      </div>
    </div>
  )
}

