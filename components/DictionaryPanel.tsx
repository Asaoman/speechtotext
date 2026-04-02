'use client'

import { useRef, useState } from 'react'
import { DetectedNoun } from '@/lib/types'

const CATEGORY_COLORS: Record<string, string> = {
  person: '#3b82f6',
  place: '#22c55e',
  organization: '#f59e0b',
  work: '#8b5cf6',
  technical: '#ec4899',
  other: '#6b7280',
}

const CATEGORY_LABELS: Record<string, string> = {
  person: '人名',
  place: '地名',
  organization: '組織',
  work: '作品',
  technical: '専門',
  other: 'その他',
}

const SIDEBAR_RIGHT_WIDTH_KEY = 'speech_sidebar_right_width'
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 520

interface DictionaryPanelProps {
  globalNouns: DetectedNoun[]
  onRemoveGlobalNoun: (term: string) => void
  pendingNouns?: DetectedNoun[]
  onApprovePendingNoun?: (noun: DetectedNoun) => void
  onRejectPendingNoun?: (term: string) => void
  onUpdateGlobalNoun?: (oldTerm: string, newTerm: string, reading?: string) => void
  activeProjectName?: string | null
}

export default function DictionaryPanel({
  globalNouns,
  onRemoveGlobalNoun,
  pendingNouns = [],
  onApprovePendingNoun,
  onRejectPendingNoun,
  onUpdateGlobalNoun,
  activeProjectName,
}: DictionaryPanelProps) {
  const approvedNouns = globalNouns.filter((n: any) => n.approved !== false)

  // Inline edit state
  const [editingTerm, setEditingTerm] = useState<string | null>(null)
  const [editTerm, setEditTerm] = useState('')
  const [editReading, setEditReading] = useState('')
  const startEdit = (noun: DetectedNoun) => {
    setEditingTerm(noun.term)
    setEditTerm(noun.term)
    setEditReading(noun.reading || '')
  }
  const commitEdit = () => {
    if (editingTerm && editTerm.trim()) {
      onUpdateGlobalNoun?.(editingTerm, editTerm.trim(), editReading.trim() || undefined)
    }
    setEditingTerm(null)
  }
  const cancelEdit = () => setEditingTerm(null)

  // Resize state
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 280
    return parseInt(localStorage.getItem(SIDEBAR_RIGHT_WIDTH_KEY) || '280', 10)
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
      // Right panel: dragging left increases width
      const delta = dragStartXRef.current - ev.clientX
      const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, dragStartWidthRef.current + delta))
      currentWidthRef.current = newWidth
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsDragging(false)
      localStorage.setItem(SIDEBAR_RIGHT_WIDTH_KEY, String(currentWidthRef.current))
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div style={{
      width: `${width}px`,
      flexShrink: 0,
      height: '100vh',
      position: 'sticky',
      top: 0,
      background: 'var(--bg-elevated)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      overflowY: 'auto',
    }}>
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          left: -3,
          bottom: 0,
          width: '6px',
          cursor: 'col-resize',
          zIndex: 20,
          background: isDragging ? 'var(--accent)' : 'transparent',
          transition: 'background 0.1s',
        }}
        title="ドラッグしてサイドバーの幅を変更"
      />

      {/* Header */}
      <div style={{
        padding: '0.75rem 1.125rem',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em', flex: 1 }}>📚 辞書</h2>
        {activeProjectName ? (
          <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, padding: '2px 0.5rem', borderRadius: '4px', background: 'rgba(var(--accent-rgb,250,204,21),0.12)', flexShrink: 0 }}>
            📁 {activeProjectName}
          </span>
        ) : (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>💬 セッション</span>
        )}
      </div>

      {/* Pending nouns (要確認) */}
      {pendingNouns.length > 0 && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚠ 要確認 ({pendingNouns.length}件)
            </span>
            <button
              onClick={() => pendingNouns.forEach((n) => onApprovePendingNoun?.(n))}
              style={{ fontSize: '9px', padding: '0.15rem 0.4rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
            >
              全て追加
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {pendingNouns.map((noun, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.5rem',
                  background: 'var(--bg)',
                  borderRadius: '5px',
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: noun.confidence < 0.6 ? '#ef4444' : '#f59e0b',
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {noun.term}
                  {noun.reading && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({noun.reading})</span>
                  )}
                </span>
                <span style={{
                  fontSize: '9px',
                  padding: '0.1rem 0.3rem',
                  background: `${CATEGORY_COLORS[noun.category] ?? '#6b7280'}20`,
                  color: CATEGORY_COLORS[noun.category] ?? '#6b7280',
                  borderRadius: '3px',
                  flexShrink: 0,
                  fontWeight: 600,
                }}>
                  {CATEGORY_LABELS[noun.category] ?? noun.category}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {Math.round(noun.confidence * 100)}%
                </span>
                <button
                  onClick={() => onApprovePendingNoun?.(noun)}
                  style={{ fontSize: '10px', padding: '0.15rem 0.35rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }}
                  title="ライブラリに追加"
                >
                  ＋
                </button>
                <button
                  onClick={() => onRejectPendingNoun?.(noun.term)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: 0, lineHeight: 1, flexShrink: 0 }}
                  title="スキップ"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Library */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            📖 ライブラリ
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{approvedNouns.length}件</span>
        </div>
        {approvedNouns.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            固有名詞を追加するとここに表示されます
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {approvedNouns.map((noun, i) => (
              editingTerm === noun.term ? (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    background: 'var(--bg)',
                    border: '1px solid var(--accent)',
                    gap: '0.35rem',
                  }}
                >
                  <input
                    autoFocus
                    value={editTerm}
                    onChange={(e) => setEditTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                    style={{ flex: 2, padding: '0.2rem 0.35rem', fontSize: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text)', outline: 'none', minWidth: 0 }}
                  />
                  <input
                    value={editReading}
                    placeholder="よみ"
                    onChange={(e) => setEditReading(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                    style={{ flex: 2, padding: '0.2rem 0.35rem', fontSize: '11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text)', outline: 'none', minWidth: 0 }}
                  />
                  <button onClick={commitEdit} style={{ fontSize: '10px', padding: '0.15rem 0.35rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }}>✓</button>
                  <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              ) : (
                <div
                  key={i}
                  onClick={() => startEdit(noun)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.3rem 0.5rem',
                    borderRadius: '4px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    gap: '0.4rem',
                    cursor: 'text',
                  }}
                  title="クリックして編集"
                >
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                    background: CATEGORY_COLORS[noun.category] ?? '#6b7280',
                  }} />
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                    {noun.term}
                  </span>
                  {noun.reading && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {noun.reading}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveGlobalNoun(noun.term) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: '12px', padding: 0,
                      lineHeight: 1, flexShrink: 0, opacity: 0.5,
                    }}
                    title="削除"
                  >×</button>
                </div>
              )
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
