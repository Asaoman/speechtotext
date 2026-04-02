'use client'

import { useState, useEffect, useRef } from 'react'
import { TranscriptionResult, ProofreadingResult, SpeechProject } from '@/lib/types'

const SIDEBAR_LEFT_WIDTH_KEY = 'speech_sidebar_left_width'
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 520

const RECENT_TRANSCRIPTIONS_KEY = 'speech_recent_transcriptions'
const OUTPUT_DIR_KEY = 'outputDir'
const PROOFREAD_CACHE_KEY = 'speech_proofread_cache_v2'

type ItemType = 'transcription' | 'subtitle' | 'movie'

interface UnifiedItem {
  id: string
  type: ItemType
  label: string
  service?: string
  language?: string | null
  preview?: string
  createdAt: string
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
  projectId?: string | null
  autoContext?: string
}

// ── SRT generation helpers ──────────────────────────────────────────────────
function srtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function segmentsToSRT(segments: any[]): string {
  if (!segments || segments.length === 0) return ''
  return segments
    .map((seg, i) => `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${(seg.text || '').trim()}\n`)
    .join('\n')
}

function downloadBlob(content: string, filename: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
// ────────────────────────────────────────────────────────────────────────────

function loadLocalHistory(): LocalTranscriptionItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(RECENT_TRANSCRIPTIONS_KEY) || '[]')
  } catch { return [] }
}

function deleteLocalItem(id: string) {
  const items = loadLocalHistory()
  try { localStorage.setItem(RECENT_TRANSCRIPTIONS_KEY, JSON.stringify(items.filter((i) => i.id !== id))) } catch {}
}

function moveSessionToProject(sessionId: string, projectId: string | null) {
  try {
    const items = loadLocalHistory()
    localStorage.setItem(
      RECENT_TRANSCRIPTIONS_KEY,
      JSON.stringify(items.map((i) => i.id === sessionId ? { ...i, projectId } : i))
    )
  } catch {}
}

function getOutputDir(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(OUTPUT_DIR_KEY) || ''
}

function hashText(text: string): string {
  let h = 5381
  const t = text.trim()
  for (let i = 0; i < t.length; i++) h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function loadCachedHashes(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(PROOFREAD_CACHE_KEY)
    if (!raw) return new Set()
    return new Set(Object.keys(JSON.parse(raw)))
  } catch { return new Set() }
}

function truncate(text: string, max = 50) {
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

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`
}

const SERVICE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  elevenlabs: { bg: '#7c3aed22', color: '#a78bfa', label: 'EL' },
  openai:     { bg: '#16a34a22', color: '#4ade80', label: 'OAI' },
  whisper:    { bg: '#0369a122', color: '#38bdf8', label: 'WH' },
  default:    { bg: 'var(--bg)', color: 'var(--text-muted)', label: '?' },
}

interface HistorySidebarProps {
  onLoadTranscription?: (data: TranscriptionResult, meta?: any) => void
  onLoadProofreading?: (data: ProofreadingResult, meta?: any) => void
  onLoadSubtitles?: (data: any) => void
  onLoadMovieProject?: (projectId: string) => void
  speechProjects: SpeechProject[]
  onSpeechProjectsChange: (projects: SpeechProject[]) => void
  activeProjectId: string | null
  onProjectSelect: (id: string | null) => void
  onBulkSubtitleGenerate?: (sessions: LocalTranscriptionItem[]) => Promise<void>
  onExtractNounsFromFiles?: (project: SpeechProject) => Promise<void>
  currentProjectId?: string | null
  refreshKey?: number
}

export default function HistorySidebar({
  onLoadTranscription,
  onLoadSubtitles,
  onLoadMovieProject,
  speechProjects,
  onSpeechProjectsChange,
  activeProjectId,
  onProjectSelect,
  onBulkSubtitleGenerate,
  onExtractNounsFromFiles,
  currentProjectId,
  refreshKey,
}: HistorySidebarProps) {
  const [items, setItems] = useState<UnifiedItem[]>([])
  const [diskFiles, setDiskFiles] = useState<{ name: string; filePath: string; size: number; createdAt: string; subDir: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [cachedHashes, setCachedHashes] = useState<Set<string>>(new Set())

  // UI state
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProjectInput, setShowNewProjectInput] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'name' | 'context' | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null)
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [isBulkGenerating, setIsBulkGenerating] = useState(false)
  const anchorItemIdRef = useRef<string | null>(null)
  // Context files UI state
  const [addingFileProjectId, setAddingFileProjectId] = useState<string | null>(null)
  const [addFilePathDraft, setAddFilePathDraft] = useState('')
  const [extractingNounsProjectId, setExtractingNounsProjectId] = useState<string | null>(null)

  // Resize
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

  useEffect(() => { loadAll() }, [currentProjectId, refreshKey])

  const loadAll = async () => {
    setLoading(true)
    const unified: UnifiedItem[] = []

    // localStorage
    for (const item of loadLocalHistory()) {
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

    // DB (best-effort)
    const pq = currentProjectId ? `?projectId=${currentProjectId}` : ''
    try {
      const [trRes, subRes, movRes] = await Promise.allSettled([
        fetch(`/api/transcriptions${pq}`),
        fetch(`/api/subtitle-sessions${pq}`),
        fetch(`/api/movie-projects${pq}`),
      ])
      if (trRes.status === 'fulfilled' && trRes.value.ok) {
        const data = await trRes.value.json()
        for (const item of (data.transcriptions || [])) {
          const dup = unified.some(
            (u) => u.type === 'transcription' && u.label === item.fileName &&
              Math.abs(new Date(u.createdAt).getTime() - new Date(item.createdAt).getTime()) < 5000
          )
          if (!dup) unified.push({ id: `db_tr_${item.id}`, type: 'transcription', label: item.fileName || '無題', service: item.service, language: item.language, preview: item.text, createdAt: item.createdAt, raw: { _dbId: item.id, ...item } })
        }
      }
      if (subRes.status === 'fulfilled' && subRes.value.ok) {
        const data = await subRes.value.json()
        for (const item of (data.sessions || [])) {
          unified.push({ id: `db_sub_${item.id}`, type: 'subtitle', label: item.name || '無題の字幕', preview: `${item.totalEntries}件`, createdAt: item.createdAt, raw: { _dbId: item.id, ...item } })
        }
      }
      if (movRes.status === 'fulfilled' && movRes.value.ok) {
        const data = await movRes.value.json()
        for (const item of (data.movieProjects || [])) {
          unified.push({ id: `db_mov_${item.id}`, type: 'movie', label: item.title, preview: `${item._count?.subtitles || 0}字幕`, createdAt: item.updatedAt, raw: { _dbId: item.id, ...item } })
        }
      }
    } catch {}

    const outputDir = getOutputDir()
    if (outputDir) {
      try {
        const res = await fetch(`/api/list-files?outputDir=${encodeURIComponent(outputDir)}`)
        if (res.ok) setDiskFiles((await res.json()).files || [])
      } catch {}
    } else {
      setDiskFiles([])
    }

    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setItems(unified)
    setCachedHashes(loadCachedHashes())
    setLoading(false)
  }

  const handleClickItem = async (item: UnifiedItem, projectId: string | null) => {
    setActiveItemId(item.id)
    onProjectSelect(projectId)
    if (item.type === 'transcription') {
      if (!onLoadTranscription) return
      if (item.id.startsWith('db_tr_')) {
        try {
          const res = await fetch(`/api/transcriptions?id=${item.raw._dbId}`)
          if (res.ok) {
            const data = await res.json()
            onLoadTranscription(
              { text: data.text, language: data.language, segments: data.segments, words: data.words },
              { id: data.id, fileName: data.fileName, service: data.service, createdAt: data.createdAt, projectId }
            )
          }
        } catch {}
      } else {
        const r = item.raw as LocalTranscriptionItem
        onLoadTranscription(
          { text: r.text, language: r.language ?? undefined, segments: r.segments, words: r.words },
          { fileName: r.fileName, service: r.service, createdAt: r.createdAt, sessionId: r.id, projectId: r.projectId ?? null, autoContext: r.autoContext }
        )
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
      deleteLocalItem(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      return
    }
    let ep = ''
    if (item.type === 'transcription') ep = `/api/transcriptions?id=${item.raw._dbId}`
    else if (item.type === 'subtitle') ep = `/api/subtitle-sessions?id=${item.raw._dbId}`
    else if (item.type === 'movie') ep = `/api/movie-projects?id=${item.raw._dbId}`
    if (!ep) return
    fetch(ep, { method: 'DELETE' }).then(() => setItems((prev) => prev.filter((i) => i.id !== item.id))).catch(() => {})
  }

  const handleRevealFile = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await fetch('/api/open-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath }) }) } catch {}
  }

  // Project CRUD
  const createProject = () => {
    const name = newProjectName.trim()
    if (!name) return
    const p: SpeechProject = { id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, context: '', nouns: [], createdAt: new Date().toISOString() }
    const updated = [p, ...speechProjects]
    onSpeechProjectsChange(updated)
    setNewProjectName('')
    setShowNewProjectInput(false)
    setExpandedProjects((prev) => new Set([...prev, p.id]))
  }

  const deleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('このプロジェクトを削除しますか？（セッションは残ります）')) return
    onSpeechProjectsChange(speechProjects.filter((p) => p.id !== projectId))
    if (activeProjectId === projectId) onProjectSelect(null)
  }

  const saveProjectEdit = (projectId: string) => {
    if (editingField === 'name' && !editDraft.trim()) return
    onSpeechProjectsChange(
      speechProjects.map((p) => p.id === projectId ? { ...p, [editingField === 'name' ? 'name' : 'context']: editDraft } : p)
    )
    setEditingProjectId(null)
    setEditingField(null)
  }

  const addContextFile = (projectId: string, filePath: string) => {
    const trimmed = filePath.trim()
    if (!trimmed) return
    const name = trimmed.split(/[\\/]/).pop() || trimmed
    onSpeechProjectsChange(speechProjects.map((p) => {
      if (p.id !== projectId) return p
      const existing = p.contextFiles ?? []
      if (existing.some((f) => f.path === trimmed)) return p
      return { ...p, contextFiles: [...existing, { path: trimmed, name }] }
    }))
    setAddFilePathDraft('')
    setAddingFileProjectId(null)
  }

  const removeContextFile = (projectId: string, filePath: string) => {
    onSpeechProjectsChange(speechProjects.map((p) =>
      p.id !== projectId ? p : { ...p, contextFiles: (p.contextFiles ?? []).filter((f) => f.path !== filePath) }
    ))
  }

  const triggerExtractNouns = async (project: SpeechProject) => {
    if (!onExtractNounsFromFiles || extractingNounsProjectId) return
    setExtractingNounsProjectId(project.id)
    try { await onExtractNounsFromFiles(project) }
    finally { setExtractingNounsProjectId(null) }
  }

  const handleMoveSession = (sessionId: string, projectId: string | null) => {
    moveSessionToProject(sessionId, projectId)
    setAssigningItemId(null)
    loadAll()
  }

  const getSessionProjectId = (item: UnifiedItem): string | null => item.raw?.projectId ?? null
  const standaloneItems = items.filter((item) => !getSessionProjectId(item))

  // ── Flat ordered item IDs for range selection (reflects render order) ──────
  const flatVisibleItemIds: string[] = (() => {
    const ids: string[] = []
    for (const project of speechProjects) {
      if (expandedProjects.has(project.id)) {
        items.filter((i) => getSessionProjectId(i) === project.id).forEach((i) => ids.push(i.id))
      }
    }
    standaloneItems.forEach((i) => ids.push(i.id))
    return ids
  })()

  const handleRangeSelect = (targetId: string) => {
    const anchor = anchorItemIdRef.current
    if (!anchor || anchor === targetId) {
      setSelectedItemIds((prev) => {
        const n = new Set(prev)
        n.has(targetId) ? n.delete(targetId) : n.add(targetId)
        return n
      })
      anchorItemIdRef.current = targetId
      return
    }
    const ai = flatVisibleItemIds.indexOf(anchor)
    const ti = flatVisibleItemIds.indexOf(targetId)
    if (ai === -1 || ti === -1) {
      setSelectedItemIds((prev) => { const n = new Set(prev); n.add(targetId); return n })
      anchorItemIdRef.current = targetId
      return
    }
    const [from, to] = ai <= ti ? [ai, ti] : [ti, ai]
    setSelectedItemIds(new Set(flatVisibleItemIds.slice(from, to + 1)))
    // Keep anchor as-is so chained Shift+clicks extend from same anchor
  }

  // ── Bulk download ──────────────────────────────────────────────────────────
  const selectedItems = items.filter((i) => selectedItemIds.has(i.id))

  const handleBulkTxtDownload = () => {
    if (selectedItems.length === 0) return
    const ts = new Date().toISOString().slice(0, 10)
    if (selectedItems.length === 1) {
      const item = selectedItems[0]
      const text = item.raw?.text || item.preview || ''
      const base = item.label.replace(/\.[^.]+$/, '')
      downloadBlob(text, `${base}.txt`)
      return
    }
    // Merge into one file
    const merged = selectedItems
      .map((item) => `# ${item.label}  (${formatDate(item.createdAt)})\n\n${item.raw?.text || item.preview || ''}`)
      .join('\n\n---\n\n')
    downloadBlob(merged, `transcriptions_${ts}.txt`)
  }

  const handleBulkSrtDownload = () => {
    if (selectedItems.length === 0) return
    const ts = new Date().toISOString().slice(0, 10)
    const withSegments = selectedItems.filter((i) => i.raw?.segments?.length > 0)
    if (withSegments.length === 0) {
      alert('選択されたセッションにはタイムスタンプ付きセグメントデータがありません。')
      return
    }
    if (withSegments.length === 1) {
      const item = withSegments[0]
      const base = item.label.replace(/\.[^.]+$/, '')
      downloadBlob(segmentsToSRT(item.raw.segments), `${base}.srt`)
      return
    }
    withSegments.forEach((item, idx) => {
      const base = item.label.replace(/\.[^.]+$/, '')
      setTimeout(() => downloadBlob(segmentsToSRT(item.raw.segments), `${base}.srt`), idx * 250)
    })
  }
  const handleBulkJsonDownload = () => {
    if (selectedItems.length === 0) return
    const ts = new Date().toISOString().slice(0, 10)
    if (selectedItems.length === 1) {
      const item = selectedItems[0]
      const base = item.label.replace(/\.[^.]+$/, '')
      const payload = {
        id: item.id,
        fileName: item.label,
        createdAt: item.createdAt,
        text: item.raw?.text || item.preview || '',
        segments: item.raw?.segments || [],
        words: item.raw?.words || [],
        language: item.raw?.language || 'ja',
        projectId: item.raw?.projectId || null,
      }
      downloadBlob(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json')
      return
    }
    // 複数選択: 個別ファイルを順次ダウンロード
    selectedItems.forEach((item, idx) => {
      const base = item.label.replace(/\.[^.]+$/, '')
      const payload = {
        id: item.id,
        fileName: item.label,
        createdAt: item.createdAt,
        text: item.raw?.text || item.preview || '',
        segments: item.raw?.segments || [],
        words: item.raw?.words || [],
        language: item.raw?.language || 'ja',
        projectId: item.raw?.projectId || null,
      }
      setTimeout(() => downloadBlob(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json'), idx * 250)
    })
  }

  const handleBulkSubtitleGenerateClick = async () => {
    if (!onBulkSubtitleGenerate || selectedItems.length === 0 || isBulkGenerating) return
    const sessions = selectedItems
      .filter((i) => i.type === 'transcription' && (i.raw?.segments?.length > 0 || i.raw?.words?.length > 0))
      .map((i) => i.raw as LocalTranscriptionItem)
    if (sessions.length === 0) { alert('選択されたセッションにタイムスタンプデータがありません。'); return }
    setIsBulkGenerating(true)
    try { await onBulkSubtitleGenerate(sessions) }
    finally { setIsBulkGenerating(false) }
  }
  // ───────────────────────────────────────────────────────────────────────────

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.has(projectId) ? next.delete(projectId) : next.add(projectId)
      return next
    })
  }

  // ——— Session row (shared between project sessions and standalone) ———
  const renderSessionRow = (item: UnifiedItem, projectId: string | null, isLast: boolean) => {
    const autoCtx = item.raw?.autoContext
    const svc = item.service?.toLowerCase() ?? ''
    const badge = SERVICE_BADGE[svc] ?? SERVICE_BADGE.default
    const isAI = item.type === 'transcription' && cachedHashes.has(hashText(item.raw?.text || item.preview || ''))
    const isActive = activeItemId === item.id
    const isSelected = selectedItemIds.has(item.id)
    const selectionMode = selectedItemIds.size > 0

    return (
      <div key={item.id} style={{ position: 'relative', display: 'flex' }}>
        {/* Tree connector */}
        {projectId && (
          <div style={{ width: '16px', flexShrink: 0, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '7px', top: 0, bottom: isLast ? '50%' : 0, width: '1px', background: 'var(--border)' }} />
            <div style={{ position: 'absolute', left: '7px', top: '50%', width: '9px', height: '1px', background: 'var(--border)' }} />
          </div>
        )}

        {/* Checkbox (visible in selection mode or on hover) */}
        {selectionMode && (
          <div
            onClick={(e) => { e.stopPropagation(); setSelectedItemIds((prev) => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n }) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', flexShrink: 0, cursor: 'pointer', paddingTop: '0.45rem' }}
          >
            <div style={{
              width: '12px', height: '12px', borderRadius: '3px',
              border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
              background: isSelected ? 'var(--accent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {isSelected && <span style={{ fontSize: '8px', color: '#000', fontWeight: 900, lineHeight: 1 }}>✓</span>}
            </div>
          </div>
        )}

        <div
          onClick={(e) => {
            if (e.shiftKey) {
              handleRangeSelect(item.id)
              return
            }
            anchorItemIdRef.current = item.id
            handleClickItem(item, projectId)
          }}
          style={{
            flex: 1, display: 'flex', gap: '0.4rem', padding: '0.45rem 0.4rem', borderRadius: '5px', cursor: 'pointer',
            transition: 'background 0.12s', alignItems: 'flex-start', minWidth: 0,
            background: isSelected
              ? 'rgba(var(--accent-rgb,250,204,21),0.12)'
              : isActive ? 'rgba(var(--accent-rgb,250,204,21),0.08)' : 'transparent',
            borderLeft: isSelected
              ? '2px solid var(--accent)'
              : isActive ? '2px solid var(--accent)' : '2px solid transparent',
          }}
          onMouseEnter={(e) => { if (!isActive && !isSelected) e.currentTarget.style.background = 'var(--bg)' }}
          onMouseLeave={(e) => { if (!isActive && !isSelected) e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Filename + date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.25rem' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {item.label}
              </span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {formatDate(item.createdAt)}
              </span>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '2px' }}>
              {item.service && (
                <span style={{ fontSize: '9px', padding: '1px 0.3rem', borderRadius: '3px', background: badge.bg, color: badge.color, fontWeight: 700, flexShrink: 0 }}>
                  {badge.label}
                </span>
              )}
              {isAI && (
                <span style={{ fontSize: '9px', padding: '1px 0.3rem', borderRadius: '3px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700, flexShrink: 0 }}>✦AI</span>
              )}
              {item.preview && item.type === 'transcription' && !autoCtx && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {truncate(item.preview, 28)}
                </span>
              )}
            </div>

            {/* Auto-context for standalone sessions */}
            {autoCtx && !projectId && (
              <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                {autoCtx}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setAssigningItemId(assigningItemId === item.id ? null : item.id) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: '0.1rem', lineHeight: 1, opacity: 0.5 }}
                title="プロジェクトに移動"
              >⇄</button>
              {assigningItemId === item.id && (
                <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', minWidth: '160px', overflow: 'hidden' }}>
                  <div style={{ padding: '0.3rem 0.6rem', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--border)' }}>移動先</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveSession(item.id, null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', padding: '0.45rem 0.7rem', fontSize: '11px', textAlign: 'left', background: !projectId ? 'var(--bg-subtle)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: !projectId ? 700 : 400 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = !projectId ? 'var(--bg-subtle)' : 'none')}
                  >
                    <span>💬</span> セッション
                  </button>
                  {speechProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={(e) => { e.stopPropagation(); handleMoveSession(item.id, p.id) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', padding: '0.45rem 0.7rem', fontSize: '11px', textAlign: 'left', background: projectId === p.id ? 'var(--bg-subtle)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: projectId === p.id ? 700 : 400 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = projectId === p.id ? 'var(--bg-subtle)' : 'none')}
                    >
                      <span>📁</span> {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={(e) => handleDelete(item, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: '0.1rem', flexShrink: 0, opacity: 0.4, lineHeight: 1 }}
              title="削除"
            >×</button>
          </div>
        </div>
      </div>
    )
  }

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
      fontSize: '12px',
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{ position: 'absolute', top: 0, right: -3, bottom: 0, width: '6px', cursor: 'col-resize', zIndex: 20, background: isDragging ? 'var(--accent)' : 'transparent', transition: 'background 0.1s' }}
      />

      {/* Header */}
      <div style={{ padding: '0.75rem 0.875rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>処理履歴</span>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowNewProjectInput((v) => !v)}
            style={{ background: showNewProjectInput ? 'var(--accent)' : 'none', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '10px', color: showNewProjectInput ? '#000' : 'var(--text-muted)', padding: '0.2rem 0.5rem', borderRadius: '4px', lineHeight: 1.4, fontWeight: 600 }}
          >
            + プロジェクト
          </button>
          {selectedItemIds.size > 0 ? (
            <button
              onClick={() => setSelectedItemIds(new Set())}
              style={{ background: 'rgba(var(--accent-rgb,250,204,21),0.15)', border: '1px solid var(--accent)', cursor: 'pointer', fontSize: '9px', color: 'var(--accent)', padding: '0.15rem 0.45rem', borderRadius: '4px', lineHeight: 1.4, fontWeight: 700 }}
            >
              {selectedItemIds.size}件 ✕
            </button>
          ) : (
            <button
              onClick={() => setSelectedItemIds(new Set(items.map((i) => i.id)))}
              style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '9px', color: 'var(--text-muted)', padding: '0.15rem 0.45rem', borderRadius: '4px', lineHeight: 1.4 }}
              title="全て選択"
            >
              全選択
            </button>
          )}
          <button onClick={loadAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)', padding: '0.1rem', lineHeight: 1 }} title="更新">↻</button>
        </div>
      </div>

      {/* New project input */}
      {showNewProjectInput && (
        <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.4rem', flexShrink: 0, background: 'var(--bg-subtle)' }}>
          <input
            autoFocus
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') { setShowNewProjectInput(false); setNewProjectName('') } }}
            placeholder="プロジェクト名を入力..."
            style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', outline: 'none' }}
          />
          <button onClick={createProject} disabled={!newProjectName.trim()} style={{ padding: '0.3rem 0.65rem', fontSize: '11px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>作成</button>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '11px' }}>読み込み中...</div>
        )}

        {!loading && items.length === 0 && diskFiles.length === 0 && speechProjects.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.9 }}>
            まだ履歴がありません<br />
            <span style={{ fontSize: '10px', opacity: 0.7 }}>書き起こしを実行すると<br />ここに表示されます</span>
          </div>
        )}

        {/* ========== PROJECTS ========== */}
        {speechProjects.length > 0 && (
          <div style={{ padding: '0.5rem 0.5rem 0' }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '0.3rem 0.25rem 0.4rem', opacity: 0.7 }}>
              プロジェクト
            </div>

            {speechProjects.map((project) => {
              const projectSessions = items.filter((i) => getSessionProjectId(i) === project.id)
              const isExpanded = expandedProjects.has(project.id)
              const isActive = activeProjectId === project.id

              return (
                <div
                  key={project.id}
                  style={{
                    marginBottom: '0.5rem',
                    borderRadius: '8px',
                    border: isActive ? '1px solid rgba(250,204,21,0.35)' : '1px solid var(--border)',
                    overflow: 'hidden',
                    background: isActive ? 'rgba(250,204,21,0.04)' : 'var(--bg-subtle)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {/* ─ Project header ─ */}
                  <div
                    onClick={() => { onProjectSelect(project.id); toggleProject(project.id) }}
                    style={{ padding: '0.55rem 0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <span style={{ fontSize: '13px', flexShrink: 0 }}>📁</span>

                    {/* Project name (double-click to edit) */}
                    {editingProjectId === project.id && editingField === 'name' ? (
                      <input
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveProjectEdit(project.id); if (e.key === 'Escape') { setEditingProjectId(null); setEditingField(null) } }}
                        onBlur={() => saveProjectEdit(project.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, padding: '0.15rem 0.35rem', fontSize: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: '3px', color: 'var(--text)', outline: 'none', minWidth: 0 }}
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingProjectId(project.id); setEditingField('name'); setEditDraft(project.name) }}
                        style={{ flex: 1, fontWeight: 700, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title="ダブルクリックで名前を変更"
                      >
                        {project.name}
                      </span>
                    )}

                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, opacity: 0.7 }}>{projectSessions.length}</span>
                    <button
                      onClick={(e) => deleteProject(project.id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: '0 0.1rem', lineHeight: 1, flexShrink: 0, opacity: 0.4 }}
                      title="プロジェクトを削除"
                    >×</button>
                  </div>

                  {/* ─ Context (always visible) ─ */}
                  <div
                    style={{ borderTop: '1px solid var(--border)', padding: '0.4rem 0.65rem', background: 'var(--bg)', cursor: 'text' }}
                    onClick={(e) => { e.stopPropagation(); setEditingProjectId(project.id); setEditingField('context'); setEditDraft(project.context) }}
                  >
                    {editingProjectId === project.id && editingField === 'context' ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <textarea
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') { setEditingProjectId(null); setEditingField(null) } }}
                          placeholder="分析コンテキスト（自動生成・手動編集可）"
                          rows={3}
                          style={{ width: '100%', padding: '0.3rem', fontSize: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: '4px', color: 'var(--text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
                        />
                        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.25rem' }}>
                          <button onClick={() => saveProjectEdit(project.id)} style={{ padding: '0.2rem 0.6rem', fontSize: '10px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 700 }}>保存</button>
                          <button onClick={() => { setEditingProjectId(null); setEditingField(null) }} style={{ padding: '0.2rem 0.5rem', fontSize: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
                        </div>
                      </div>
                    ) : project.context ? (
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                        {project.context}
                      </p>
                    ) : (
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0, opacity: 0.5, fontStyle: 'italic' }}>
                        コンテキスト（セッション追加後に自動生成）
                      </p>
                    )}
                  </div>

                  {/* ─ Reference files ─ */}
                  <div style={{ borderTop: '1px solid var(--border)', padding: '0.35rem 0.65rem', background: 'var(--bg)' }} onClick={(e) => e.stopPropagation()}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: project.contextFiles?.length ? '0.3rem' : 0 }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.8 }}>
                        📎 参照ファイル
                      </span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {(project.contextFiles?.length ?? 0) > 0 && (
                          <button
                            onClick={() => triggerExtractNouns(project)}
                            disabled={extractingNounsProjectId === project.id}
                            style={{ fontSize: '8px', padding: '0.1rem 0.4rem', background: extractingNounsProjectId === project.id ? 'var(--bg)' : 'rgba(var(--accent-rgb,250,204,21),0.15)', border: '1px solid var(--accent)', borderRadius: '3px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, lineHeight: 1.4 }}
                            title="ファイルから固有名詞を抽出して辞書に追加"
                          >
                            {extractingNounsProjectId === project.id ? '⏳ 抽出中' : '✦ 辞書に取込'}
                          </button>
                        )}
                        <button
                          onClick={() => { setAddingFileProjectId(addingFileProjectId === project.id ? null : project.id); setAddFilePathDraft('') }}
                          style={{ fontSize: '9px', padding: '0.1rem 0.35rem', background: 'none', border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1.4 }}
                          title="参照ファイルを追加"
                        >＋</button>
                      </div>
                    </div>

                    {/* File list */}
                    {(project.contextFiles ?? []).map((f) => (
                      <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '2px' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>
                          📄 {f.name}
                        </span>
                        <button
                          onClick={() => removeContextFile(project.id, f.path)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: 0, lineHeight: 1, opacity: 0.5, flexShrink: 0 }}
                          title="削除"
                        >×</button>
                      </div>
                    ))}

                    {/* Add file path input */}
                    {addingFileProjectId === project.id && (
                      <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.3rem' }}>
                        <input
                          autoFocus
                          value={addFilePathDraft}
                          onChange={(e) => setAddFilePathDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addContextFile(project.id, addFilePathDraft); if (e.key === 'Escape') { setAddingFileProjectId(null); setAddFilePathDraft('') } }}
                          placeholder="ファイルパスを貼り付け..."
                          style={{ flex: 1, padding: '0.2rem 0.35rem', fontSize: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text)', outline: 'none', minWidth: 0 }}
                        />
                        <button onClick={() => addContextFile(project.id, addFilePathDraft)} style={{ padding: '0.2rem 0.45rem', fontSize: '9px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 700 }}>追加</button>
                      </div>
                    )}
                    {addingFileProjectId !== project.id && (project.contextFiles?.length ?? 0) === 0 && (
                      <p style={{ fontSize: '9px', color: 'var(--text-muted)', margin: 0, opacity: 0.5, fontStyle: 'italic' }}>
                        ＋ からMDファイルを追加
                      </p>
                    )}
                  </div>

                  {/* ─ Session list (expanded) ─ */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '0.3rem 0.4rem 0.35rem' }}>
                      {projectSessions.length === 0 ? (
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '0.3rem 0.5rem', margin: 0, opacity: 0.6 }}>
                          セッションなし — アップロード時に選択
                        </p>
                      ) : (
                        projectSessions.map((item, idx) =>
                          renderSessionRow(item, project.id, idx === projectSessions.length - 1)
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ========== STANDALONE SESSIONS ========== */}
        {standaloneItems.length > 0 && (
          <div style={{ padding: '0 0.5rem 0.75rem' }}>
            <div style={{
              fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px',
              padding: '0.5rem 0.25rem 0.4rem',
              borderTop: speechProjects.length > 0 ? '1px solid var(--border)' : 'none',
              marginTop: speechProjects.length > 0 ? '0.25rem' : 0,
              opacity: 0.7,
            }}>
              セッション
            </div>
            {!loading && standaloneItems.map((item, idx) =>
              renderSessionRow(item, null, idx === standaloneItems.length - 1)
            )}
          </div>
        )}

        {/* ========== DISK FILES ========== */}
        {!loading && diskFiles.length > 0 && (
          <div style={{ padding: '0 0.5rem 0.75rem' }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '0.5rem 0.25rem 0.4rem', borderTop: '1px solid var(--border)', marginTop: '0.25rem', opacity: 0.7 }}>
              保存済みファイル
            </div>
            {diskFiles.map((file, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: '0.5rem', padding: '0.45rem 0.4rem', marginBottom: '1px', borderRadius: '5px', alignItems: 'center', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: '11px', flexShrink: 0 }}>{file.name.endsWith('.srt') || file.name.endsWith('.vtt') ? '🎬' : '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{file.subDir} · {formatSize(file.size)}</div>
                </div>
                <button onClick={(e) => handleRevealFile(file.filePath, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: '0.1rem', flexShrink: 0 }} title="Explorerで表示">📂</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk action toolbar — shown when items are selected */}
      {selectedItemIds.size > 0 && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'rgba(var(--accent-rgb,250,204,21),0.06)',
          padding: '0.5rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)' }}>
              {selectedItemIds.size}件選択中
            </span>
            <button
              onClick={() => setSelectedItemIds(new Set())}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}
              title="選択解除"
            >
              ✕ 解除
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={handleBulkTxtDownload}
              style={{
                flex: 1, padding: '0.3rem 0.4rem', fontSize: '10px', fontWeight: 700,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '5px', cursor: 'pointer', color: 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
              }}
              title="書き起こしテキストを一括ダウンロード"
            >
              📄 TXT
            </button>
            <button
              onClick={handleBulkJsonDownload}
              style={{
                flex: 1, padding: '0.3rem 0.4rem', fontSize: '10px', fontWeight: 700,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '5px', cursor: 'pointer', color: 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
              }}
              title="セグメント・ワードタイムスタンプ付きJSONを一括ダウンロード（Claude Code用）"
            >
              {'{ }'} JSON
            </button>
            <button
              onClick={handleBulkSrtDownload}
              style={{
                flex: 1, padding: '0.3rem 0.4rem', fontSize: '10px', fontWeight: 700,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '5px', cursor: 'pointer', color: 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
              }}
              title="セグメントからSRTを生成してダウンロード"
            >
              🎬 SRT
            </button>
            <button
              onClick={handleBulkSubtitleGenerateClick}
              disabled={isBulkGenerating}
              style={{
                flex: 1, padding: '0.3rem 0.4rem', fontSize: '10px', fontWeight: 700,
                background: isBulkGenerating ? 'var(--bg)' : 'rgba(var(--accent-rgb,250,204,21),0.15)',
                border: '1px solid var(--accent)',
                borderRadius: '5px', cursor: isBulkGenerating ? 'not-allowed' : 'pointer',
                color: isBulkGenerating ? 'var(--text-muted)' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                opacity: isBulkGenerating ? 0.6 : 1,
              }}
              title="AI字幕生成（word timingが必要）"
            >
              {isBulkGenerating ? '⏳ 生成中' : '✦ 字幕生成'}
            </button>
          </div>
          <p style={{ fontSize: '9px', color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>
            Shift+クリックで範囲選択 / 1クリックで起点設定
          </p>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '0.4rem 0.875rem', borderTop: '1px solid var(--border)', fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexShrink: 0, opacity: 0.7 }}>
        <span>セッション {standaloneItems.length + speechProjects.reduce((a, p) => a + items.filter(i => getSessionProjectId(i) === p.id).length, 0)}件</span>
        <span>プロジェクト {speechProjects.length}件</span>
      </div>
    </div>
  )
}
