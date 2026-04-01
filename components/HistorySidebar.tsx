'use client'

import { useState, useEffect, useRef } from 'react'
import { TranscriptionResult, ProofreadingResult } from '@/lib/types'

const SIDEBAR_LEFT_WIDTH_KEY = 'speech_sidebar_left_width'
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 480

const RECENT_TRANSCRIPTIONS_KEY = 'speech_recent_transcriptions'
const OUTPUT_DIR_KEY = 'outputDir'

type ItemType = 'transcription' | 'subtitle' | 'movie'

interface UnifiedItem {
  id: string
  type: ItemType
  label: string        // filename or project title
  service?: string
  language?: string | null
  preview?: string     // text snippet or subtitle count
  createdAt: string
  // raw payloads for loading
  raw?: any
}

interface LocalTranscriptionItem {
  id: string
  fileName: string
  service: string
  language: string | null
  text: string
  segments?: any[]
  words?: any[]
  createdAt: string
}

function loadLocalHistory(): LocalTranscriptionItem[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_TRANSCRIPTIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function deleteLocalItem(id: string) {
  const items = loadLocalHistory()
  const updated = items.filter((item) => item.id !== id)
  try {
    localStorage.setItem(RECENT_TRANSCRIPTIONS_KEY, JSON.stringify(updated))
  } catch {}
}

function getOutputDir(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(OUTPUT_DIR_KEY) || ''
}

const PROOFREAD_CACHE_KEY = 'speech_proofread_cache_v2'

function hashText(text: string): string {
  let h = 5381
  const t = text.trim()
  for (let i = 0; i < t.length; i++) {
    h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

function loadCachedHashes(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(PROOFREAD_CACHE_KEY)
    if (!raw) return new Set()
    return new Set(Object.keys(JSON.parse(raw)))
  } catch {
    return new Set()
  }
}

function truncate(text: string, max = 45) {
  return text.length <= max ? text : text.slice(0, max) + '…'
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const time = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `今日 ${time}`
  if (isYesterday) return `昨日 ${time}`
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ' ' + time
}

const TYPE_CONFIG: Record<ItemType, { icon: string; label: string; color: string }> = {
  transcription: { icon: '📝', label: '書き起こし', color: '#f59e0b' },
  subtitle:      { icon: '🎬', label: '字幕',       color: '#3b82f6' },
  movie:         { icon: '🎭', label: '映画字幕',   color: '#8b5cf6' },
}

interface HistorySidebarProps {
  onLoadTranscription?: (data: TranscriptionResult, meta?: any) => void
  onLoadProofreading?: (data: ProofreadingResult, meta?: any) => void
  onLoadSubtitles?: (data: any) => void
  onLoadMovieProject?: (projectId: string) => void
  currentProjectId?: string | null
  refreshKey?: number
}

export default function HistorySidebar({
  onLoadTranscription,
  onLoadSubtitles,
  onLoadMovieProject,
  currentProjectId,
  refreshKey,
}: HistorySidebarProps) {
  const [items, setItems] = useState<UnifiedItem[]>([])
  const [diskFiles, setDiskFiles] = useState<{ name: string; filePath: string; size: number; createdAt: string; subDir: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [cachedHashes, setCachedHashes] = useState<Set<string>>(new Set())

  // Resize state
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 280
    return parseInt(localStorage.getItem(SIDEBAR_LEFT_WIDTH_KEY) || '280', 10)
  })
  const [isDragging, setIsDragging] = useState(false)
  const currentWidthRef = useRef(width)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(0)

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = currentWidthRef.current
    setIsDragging(true)

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - dragStartXRef.current
      const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, dragStartWidthRef.current + delta))
      currentWidthRef.current = newWidth
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsDragging(false)
      localStorage.setItem(SIDEBAR_LEFT_WIDTH_KEY, String(currentWidthRef.current))
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  useEffect(() => {
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, refreshKey])

  const loadAll = async () => {
    setLoading(true)
    const unified: UnifiedItem[] = []

    // 1. localStorage transcriptions
    const local = loadLocalHistory()
    for (const item of local) {
      unified.push({
        id: item.id,
        type: 'transcription',
        label: item.fileName,
        service: item.service,
        language: item.language,
        preview: item.text,
        createdAt: item.createdAt,
        raw: item,
      })
    }

    // 2. DB items (best-effort, silently skip on error)
    const projectQuery = currentProjectId ? `?projectId=${currentProjectId}` : ''
    try {
      const [trRes, subRes, movRes] = await Promise.allSettled([
        fetch(`/api/transcriptions${projectQuery}`),
        fetch(`/api/subtitle-sessions${projectQuery}`),
        fetch(`/api/movie-projects${projectQuery}`),
      ])

      if (trRes.status === 'fulfilled' && trRes.value.ok) {
        const data = await trRes.value.json()
        for (const item of (data.transcriptions || [])) {
          // Deduplicate against localStorage (same text+service within 5s)
          const alreadyIn = unified.some(
            (u) => u.type === 'transcription' && u.label === item.fileName &&
              Math.abs(new Date(u.createdAt).getTime() - new Date(item.createdAt).getTime()) < 5000
          )
          if (!alreadyIn) {
            unified.push({
              id: `db_tr_${item.id}`,
              type: 'transcription',
              label: item.fileName || '無題',
              service: item.service,
              language: item.language,
              preview: item.text,
              createdAt: item.createdAt,
              raw: { _dbId: item.id, ...item },
            })
          }
        }
      }

      if (subRes.status === 'fulfilled' && subRes.value.ok) {
        const data = await subRes.value.json()
        for (const item of (data.sessions || [])) {
          unified.push({
            id: `db_sub_${item.id}`,
            type: 'subtitle',
            label: item.name || '無題の字幕',
            preview: `${item.totalEntries}件`,
            createdAt: item.createdAt,
            raw: { _dbId: item.id, ...item },
          })
        }
      }

      if (movRes.status === 'fulfilled' && movRes.value.ok) {
        const data = await movRes.value.json()
        for (const item of (data.movieProjects || [])) {
          unified.push({
            id: `db_mov_${item.id}`,
            type: 'movie',
            label: item.title,
            preview: `${item._count?.subtitles || 0}字幕`,
            createdAt: item.updatedAt,
            raw: { _dbId: item.id, ...item },
          })
        }
      }
    } catch {
      // DB unavailable – show only local
    }

    // 3. Disk files
    const outputDir = getOutputDir()
    if (outputDir) {
      try {
        const res = await fetch(`/api/list-files?outputDir=${encodeURIComponent(outputDir)}`)
        if (res.ok) {
          const data = await res.json()
          setDiskFiles(data.files || [])
        }
      } catch {}
    } else {
      setDiskFiles([])
    }

    // Sort by date descending
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setItems(unified)
    setCachedHashes(loadCachedHashes())
    setLoading(false)
  }

  const handleClickItem = async (item: UnifiedItem) => {
    if (item.type === 'transcription') {
      if (!onLoadTranscription) return

      if (item.id.startsWith('db_tr_')) {
        // Load from DB
        try {
          const res = await fetch(`/api/transcriptions?id=${item.raw._dbId}`)
          if (res.ok) {
            const data = await res.json()
            onLoadTranscription({ text: data.text, language: data.language, segments: data.segments, words: data.words }, {
              id: data.id, fileName: data.fileName, service: data.service, createdAt: data.createdAt,
            })
          }
        } catch {}
      } else {
        // From localStorage raw
        const r = item.raw as LocalTranscriptionItem
        onLoadTranscription({ text: r.text, language: r.language ?? undefined, segments: r.segments, words: r.words }, {
          fileName: r.fileName, service: r.service, createdAt: r.createdAt,
        })
      }
    } else if (item.type === 'subtitle' && onLoadSubtitles) {
      try {
        const res = await fetch(`/api/subtitle-sessions?id=${item.raw._dbId}&includeEntries=true`)
        if (res.ok) onLoadSubtitles(await res.json())
      } catch {}
    } else if (item.type === 'movie' && onLoadMovieProject) {
      onLoadMovieProject(item.raw._dbId)
    }
  }

  const handleDelete = (item: UnifiedItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('この履歴を削除しますか？')) return

    if (!item.id.startsWith('db_')) {
      // localStorage item
      deleteLocalItem(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      return
    }

    // DB item — fire delete then reload
    let endpoint = ''
    if (item.type === 'transcription') endpoint = `/api/transcriptions?id=${item.raw._dbId}`
    else if (item.type === 'subtitle') endpoint = `/api/subtitle-sessions?id=${item.raw._dbId}`
    else if (item.type === 'movie') endpoint = `/api/movie-projects?id=${item.raw._dbId}`
    if (!endpoint) return

    fetch(endpoint, { method: 'DELETE' }).then(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    }).catch(() => {})
  }

  const handleRevealFile = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      })
    } catch {}
  }

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`

  return (
    <div style={{
      width: `${width}px`,
      flexShrink: 0,
      height: '100vh',
      position: 'sticky',
      top: 0,
      background: 'var(--card-bg)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          right: -3,
          bottom: 0,
          width: '6px',
          cursor: 'col-resize',
          zIndex: 20,
          background: isDragging ? 'var(--accent)' : 'transparent',
          transition: 'background 0.1s',
        }}
        title="ドラッグしてサイドバーの幅を変更"
      />
      {/* ヘッダー */}
      <div style={{
        padding: '1rem 1.125rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>📂 処理履歴</h2>
        <button
          onClick={loadAll}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)', padding: '0.2rem', lineHeight: 1 }}
          title="更新"
        >
          ↻
        </button>
      </div>

      {/* タイムライン */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '12px' }}>読み込み中...</div>
        )}

        {!loading && items.length === 0 && diskFiles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.8 }}>
            まだ履歴がありません<br />
            <span style={{ fontSize: '11px' }}>書き起こしを実行すると<br />ここに表示されます</span>
          </div>
        )}

        {/* 処理履歴アイテム */}
        {!loading && items.map((item) => {
          const cfg = TYPE_CONFIG[item.type]
          return (
            <div
              key={item.id}
              onClick={() => handleClickItem(item)}
              style={{
                display: 'flex',
                gap: '0.6rem',
                padding: '0.6rem 0.5rem',
                marginBottom: '2px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background 0.15s',
                alignItems: 'flex-start',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Type icon */}
              <span style={{
                fontSize: '14px',
                lineHeight: 1,
                marginTop: '1px',
                flexShrink: 0,
              }}>
                {cfg.icon}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.25rem', marginBottom: '3px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 0.4rem',
                    borderRadius: '4px',
                    background: `${cfg.color}22`,
                    color: cfg.color,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {cfg.label}
                  </span>
                  {item.service && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.service}</span>
                  )}
                  {item.type === 'transcription' && cachedHashes.has(hashText(item.raw?.text || item.preview || '')) && (
                    <span style={{
                      fontSize: '9px',
                      padding: '1px 0.35rem',
                      borderRadius: '3px',
                      background: 'rgba(99,102,241,0.15)',
                      color: '#818cf8',
                      fontWeight: 700,
                      flexShrink: 0,
                      letterSpacing: '0.02em',
                    }}>
                      ✦AI
                    </span>
                  )}
                  {item.preview && (
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.type === 'transcription' ? truncate(item.preview, 30) : item.preview}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(item, e)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '11px', padding: '0.1rem',
                  flexShrink: 0, opacity: 0.5, lineHeight: 1,
                }}
                title="削除"
              >
                ×
              </button>
            </div>
          )
        })}

        {/* ローカルファイル（ディスク保存済み）*/}
        {!loading && diskFiles.length > 0 && (
          <>
            <div style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              padding: '0.875rem 0.5rem 0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderTop: items.length > 0 ? '1px solid var(--border)' : 'none',
              marginTop: items.length > 0 ? '0.25rem' : 0,
            }}>
              💾 保存済みファイル
            </div>
            {diskFiles.map((file, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  marginBottom: '2px',
                  borderRadius: '6px',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: '12px', flexShrink: 0 }}>
                  {file.name.endsWith('.srt') || file.name.endsWith('.vtt') ? '🎬' : '📄'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {file.subDir} • {formatSize(file.size)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleRevealFile(file.filePath, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '0.1rem', flexShrink: 0 }}
                  title="Explorerで表示"
                >
                  📁
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* フッター */}
      <div style={{
        padding: '0.625rem 1rem',
        borderTop: '1px solid var(--border)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        {items.length}件 / ファイル: {diskFiles.length}件
      </div>
    </div>
  )
}
