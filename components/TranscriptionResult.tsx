'use client'

import { useState, useEffect, useCallback } from 'react'
import { TranscriptionResult, TranscriptionProofreadResult, DetectedNoun } from '@/lib/types'
import { generateSRT, generateVTT, downloadFile, generateTimestamp, storage } from '@/lib/utils'
import HighlightedTranscriptionText from './HighlightedTranscriptionText'

interface Project {
  id: string
  name: string
}

interface TranscriptionResultProps {
  result: TranscriptionResult
  meta?: {
    id?: string
    fileName?: string
    service?: string
    isNew?: boolean
  }
  onStartSubtitleGeneration?: () => void
  onSaved?: (id: string) => void
  onRequestProofread?: () => void
  proofreadResult?: TranscriptionProofreadResult | null
  isProofreading?: boolean
  proofreadError?: string | null
  globalNouns?: DetectedNoun[]
  onNounApproved?: (noun: DetectedNoun) => void
  onNounRejected?: (term: string) => void
  onNounsMerged?: (canonical: string, aliases: string[]) => void
  highlightTerms?: DetectedNoun[]
  onNounClickedInText?: (noun: DetectedNoun) => void
  screeningModel?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  person: '人名',
  place: '地名',
  organization: '組織',
  work: '作品',
  technical: '専門用語',
  other: 'その他',
}

export default function TranscriptionResultComponent({
  result,
  meta,
  onStartSubtitleGeneration,
  onSaved,
  onRequestProofread,
  proofreadResult,
  isProofreading,
  proofreadError,
  globalNouns = [],
  onNounApproved,
  onNounRejected,
  onNounsMerged,
  highlightTerms = [],
  onNounClickedInText,
  screeningModel,
}: TranscriptionResultProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [newProjectName, setNewProjectName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [showProjectSelect, setShowProjectSelect] = useState(false)
  const [activeSearchNoun, setActiveSearchNoun] = useState<DetectedNoun | null>(null)
  const [activeOccurrenceIndex, setActiveOccurrenceIndex] = useState(0)
  const [activeOccurrenceCount, setActiveOccurrenceCount] = useState(0)

  useEffect(() => {
    fetchProjects()
    const currentProjectId = storage.getCurrentProjectId()
    if (currentProjectId) {
      setSelectedProjectId(currentProjectId)
    }
  }, [])

  // Reset noun search when screening changes
  useEffect(() => {
    setActiveSearchNoun(null)
    setActiveOccurrenceIndex(0)
    setActiveOccurrenceCount(0)
  }, [proofreadResult])

  const handleOccurrenceCountChange = useCallback((count: number) => {
    setActiveOccurrenceCount(count)
  }, [])

  // Compute occurrence count directly from text (for immediate display on pill click,
  // before the child component reports back via onOccurrenceCountChange)
  const computeOccurrenceCount = useCallback((noun: DetectedNoun): number => {
    const lower = result.text.toLowerCase()
    const term = noun.term.toLowerCase()
    if (!term) return 0
    let count = 0, pos = 0
    while ((pos = lower.indexOf(term, pos)) !== -1) { count++; pos += term.length }
    return count
  }, [result.text])

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() })
      })
      if (res.ok) {
        const project = await res.json()
        setProjects([...projects, project])
        setSelectedProjectId(project.id)
        setNewProjectName('')
        storage.setCurrentProjectId(project.id)
      }
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const handleSave = async () => {
    if (!selectedProjectId) {
      setShowProjectSelect(true)
      return
    }
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/api/transcriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          fileName: meta?.fileName || 'untitled',
          service: meta?.service || 'unknown',
          language: result.language,
          text: result.text,
          segments: result.segments,
          words: result.words,
        })
      })
      if (res.ok) {
        const data = await res.json()
        setSaveStatus('saved')
        onSaved?.(data.id)
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('Failed to save transcription:', err)
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownload = (format: 'txt' | 'json' | 'srt' | 'vtt') => {
    const timestamp = generateTimestamp()
    const baseName = meta?.fileName?.replace(/\.[^.]+$/, '') || 'transcription'
    switch (format) {
      case 'txt':
        downloadFile(result.text, `${baseName}_書き起こし_${timestamp}.txt`, 'text/plain')
        break
      case 'json':
        downloadFile(JSON.stringify(result, null, 2), `${baseName}_書き起こし_${timestamp}.json`, 'application/json')
        break
      case 'srt': {
        const srtContent = generateSRT(result)
        if (srtContent) downloadFile(srtContent, `${baseName}_sub_${timestamp}.srt`, 'text/plain')
        break
      }
      case 'vtt': {
        const vttContent = generateVTT(result)
        if (vttContent) downloadFile(vttContent, `${baseName}_sub_${timestamp}.vtt`, 'text/vtt')
        break
      }
    }
  }

  // All detected nouns (new ones only)
  const newNouns = proofreadResult?.detectedNouns.filter((n) => n.isNew) ?? []

  return (
    <div className="card" style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600 }}>変換結果</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {saveStatus === 'saved' && (
            <span style={{ fontSize: '11px', color: 'rgb(34, 197, 94)' }}>✓ 保存しました</span>
          )}
          {saveStatus === 'error' && (
            <span style={{ fontSize: '11px', color: 'rgb(239, 68, 68)' }}>保存に失敗</span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || meta?.id !== undefined}
            style={{
              padding: '0.4rem 0.75rem',
              fontSize: '11px',
              fontWeight: 600,
              background: meta?.id ? 'var(--border)' : 'var(--accent)',
              color: meta?.id ? 'var(--text-muted)' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: meta?.id ? 'default' : 'pointer',
              opacity: isSaving ? 0.7 : 1
            }}
          >
            {isSaving ? '保存中...' : meta?.id ? '保存済み' : '💾 保存'}
          </button>
        </div>
      </div>

      {/* Project select */}
      {showProjectSelect && (
        <div style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.75rem' }}>保存先プロジェクトを選択</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <select
              value={selectedProjectId}
              onChange={(e) => { setSelectedProjectId(e.target.value); storage.setCurrentProjectId(e.target.value) }}
              style={{ flex: 1, padding: '0.5rem', fontSize: '12px', background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
            >
              <option value="">プロジェクトを選択...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="新規プロジェクト名"
              style={{ flex: 1, padding: '0.5rem', fontSize: '12px', background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
            />
            <button onClick={handleCreateProject} disabled={!newProjectName.trim()} style={{ padding: '0.5rem 1rem', fontSize: '11px', fontWeight: 600, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: !newProjectName.trim() ? 0.5 : 1 }}>作成</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button onClick={() => setShowProjectSelect(false)} style={{ flex: 1, padding: '0.5rem', fontSize: '11px', background: 'var(--border)', color: 'var(--text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>キャンセル</button>
            <button onClick={() => { setShowProjectSelect(false); if (selectedProjectId) handleSave() }} disabled={!selectedProjectId} style={{ flex: 1, padding: '0.5rem', fontSize: '11px', fontWeight: 600, background: selectedProjectId ? 'var(--accent)' : 'var(--border)', color: selectedProjectId ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '4px', cursor: selectedProjectId ? 'pointer' : 'default' }}>保存する</button>
          </div>
        </div>
      )}

      {result.language && (
        <div style={{ marginBottom: '1rem' }}>
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            {result.language}
          </span>
        </div>
      )}

      {/* Main text + integrated screening */}
      <div style={{ marginBottom: '1rem' }}>
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>変換結果 / スクリーニング</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {screeningModel && (
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--bg)', padding: '0.1rem 0.35rem', borderRadius: '3px', border: '1px solid var(--border)' }}>
                {screeningModel}
              </span>
            )}
            {isProofreading && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-block', width: '11px', height: '11px', borderRadius: '50%', border: '1.5px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                スクリーニング中...
              </span>
            )}
            {!isProofreading && proofreadError && (
              <span
                title={proofreadError}
                style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}
              >
                ⚠ {proofreadError}
              </span>
            )}
            {!isProofreading && !proofreadError && newNouns.length > 0 && (
              <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>
                ● {newNouns.length}語 検出 — クリックでライブラリ追加
              </span>
            )}
            {!isProofreading && !proofreadError && proofreadResult && newNouns.length === 0 && (
              <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
                ✓ スクリーニング完了
              </span>
            )}
            {onRequestProofread && !isProofreading && (
              <button
                onClick={onRequestProofread}
                style={{ fontSize: '11px', padding: '0.15rem 0.5rem', background: 'none', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {proofreadResult || proofreadError ? '再分析' : '分析'}
              </button>
            )}
          </div>
        </div>

        {/* Detected nouns — pill strip with Ctrl+F navigation */}
        {proofreadResult && !isProofreading && newNouns.length > 0 && (
          <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>検出:</span>
              {newNouns.map((noun, i) => {
                const isActive = activeSearchNoun?.term === noun.term
                const borderColor = noun.confidence < 0.6
                  ? 'rgba(239,68,68,0.4)'
                  : noun.confidence < 0.75
                    ? 'rgba(245,158,11,0.4)'
                    : 'var(--border)'
                return (
                  <span
                    key={i}
                    onClick={() => {
                      if (isActive) {
                        setActiveOccurrenceIndex((p) => (p + 1) % Math.max(1, activeOccurrenceCount))
                      } else {
                        setActiveSearchNoun(noun)
                        setActiveOccurrenceIndex(0)
                        setActiveOccurrenceCount(computeOccurrenceCount(noun))
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '12px',
                      padding: '0.2rem 0.45rem 0.2rem 0.55rem',
                      borderRadius: '20px',
                      background: isActive ? 'var(--accent)' : 'var(--bg)',
                      border: `1.5px solid ${isActive ? 'var(--accent)' : borderColor}`,
                      color: isActive ? 'white' : 'var(--text)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    title={`${CATEGORY_LABELS[noun.category] ?? noun.category} — 確信度 ${Math.round(noun.confidence * 100)}% / クリックでテキスト内を検索`}
                  >
                    <span style={{ fontSize: '8px', color: isActive ? 'rgba(255,255,255,0.8)' : noun.confidence < 0.6 ? '#ef4444' : noun.confidence < 0.75 ? '#f59e0b' : '#22c55e' }}>●</span>
                    {noun.term}
                    {noun.reading && (
                      <span style={{ fontSize: '10px', color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>({noun.reading})</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onNounApproved?.(noun) }}
                      title="ライブラリに追加"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'rgba(255,255,255,0.9)' : '#22c55e', fontSize: '14px', padding: 0, lineHeight: 1, fontWeight: 700 }}
                    >
                      ＋
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onNounRejected?.(noun.term) }}
                      title="スキップ"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', fontSize: '12px', padding: 0, lineHeight: 1, opacity: 0.7 }}
                    >
                      ×
                    </button>
                  </span>
                )
              })}

              {/* Ctrl+F occurrence counter */}
              {activeSearchNoun && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '12px', color: 'var(--text-muted)', marginLeft: '0.25rem', padding: '0.1rem 0.4rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <span style={{ color: activeOccurrenceCount === 0 ? '#ef4444' : 'var(--accent)', fontWeight: 700, minWidth: '2.5rem', textAlign: 'center' }}>
                    {activeOccurrenceCount === 0 ? '未検出' : `${activeOccurrenceIndex + 1} / ${activeOccurrenceCount}`}
                  </span>
                  {activeOccurrenceCount > 0 && (
                    <>
                      <button
                        onClick={() => setActiveOccurrenceIndex((p) => (p - 1 + activeOccurrenceCount) % activeOccurrenceCount)}
                        style={{ background: 'var(--border)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--text)', fontSize: '14px', padding: '0.15rem 0.5rem', lineHeight: 1, fontWeight: 700 }}
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => setActiveOccurrenceIndex((p) => (p + 1) % activeOccurrenceCount)}
                        style={{ background: 'var(--border)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--text)', fontSize: '14px', padding: '0.15rem 0.5rem', lineHeight: 1, fontWeight: 700 }}
                      >
                        ›
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { setActiveSearchNoun(null); setActiveOccurrenceIndex(0) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '0 0.1rem', lineHeight: 1, opacity: 0.7 }}
                  >
                    ✕
                  </button>
                </span>
              )}

              <button
                onClick={() => newNouns.forEach((n) => onNounApproved?.(n))}
                style={{ fontSize: '11px', padding: '0.2rem 0.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: 'auto', flexShrink: 0 }}
              >
                全てライブラリ追加
              </button>
            </div>
          </div>
        )}

        <HighlightedTranscriptionText
          text={result.text}
          highlightTerms={highlightTerms}
          onClickTerm={onNounClickedInText}
          activeNoun={activeSearchNoun}
          activeOccurrenceIndex={activeOccurrenceIndex}
          onOccurrenceCountChange={handleOccurrenceCountChange}
        />
      </div>

      {/* Download */}
      <div>
        <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>📥 ダウンロード</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          {(['txt', 'json', 'srt', 'vtt'] as const).map((fmt) => (
            <button key={fmt} onClick={() => handleDownload(fmt)} className="card" style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s' }}>
              <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{fmt.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {result.segments && result.segments.some(seg => seg.speaker) && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
            💬 SRT/VTTファイルには話者情報が含まれます
          </div>
        )}
      </div>

      {/* Action buttons */}
      {onStartSubtitleGeneration && (
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={onStartSubtitleGeneration}
            className="btn-primary"
            style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '13px', fontWeight: 600 }}
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            字幕を生成
          </button>
        </div>
      )}

      {/* Segment details */}
      {result.segments && result.segments.length > 0 && (
        <details className="card" style={{ marginTop: '1rem', overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: '0.75rem 1rem', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            タイムスタンプ付きセグメント ({result.segments.length}件)
          </summary>
          <div style={{ padding: '1rem', maxHeight: '20rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.segments.map((segment, index) => (
              <div key={index} className="card" style={{ padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="badge" style={{ fontSize: '10px' }}>#{index + 1}</span>
                  <span className="badge" style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s
                  </span>
                  {segment.speaker && <span className="badge" style={{ fontSize: '10px' }}>話者 {segment.speaker}</span>}
                </div>
                <p style={{ fontSize: '12px' }}>{segment.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {result.words && result.words.length > 0 && (
        <details className="card" style={{ marginTop: '0.75rem', overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: '0.75rem 1rem', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            ワードレベルタイムスタンプ
          </summary>
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {result.words.slice(0, 100).map((word, index) => (
                <span key={index} className="badge" title={`${word.start.toFixed(2)}s${(word as any).speaker ? ` - ${(word as any).speaker}` : ''}`} style={{ fontSize: '11px', cursor: 'default', backgroundColor: (word as any).speaker ? 'var(--accent-subtle)' : undefined }}>
                  {word.word}
                </span>
              ))}
            </div>
            {result.words.length > 100 && (
              <p className="card" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.75rem', padding: '0.5rem' }}>
                ... 他 {result.words.length - 100} ワード (完全なデータはJSONをダウンロードしてください)
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
