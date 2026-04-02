'use client'

import { useState, useRef } from 'react'
import { ApiKeys, TranscriptionResult, SpeechProject } from '@/lib/types'

interface FileUploadProps {
  apiKeys: ApiKeys
  onTranscriptionComplete: (result: TranscriptionResult, fileName: string, service: string, projectId?: string) => void
  isTranscribing: boolean
  setIsTranscribing: (value: boolean) => void
  speechProjects?: SpeechProject[]
  defaultProjectId?: string | null
}

interface QueuedFile {
  file: File
  status: 'pending' | 'processing' | 'done' | 'error'
  error?: string
}

const ALLOWED_EXTENSIONS = /\.(mp3|wav|m4a|mp4|flac|ogg|webm)$/i
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/ogg', 'audio/webm', 'video/mp4']
const MAX_SIZE = 300 * 1024 * 1024

export default function FileUpload({
  apiKeys,
  onTranscriptionComplete,
  isTranscribing,
  setIsTranscribing,
  speechProjects = [],
  defaultProjectId = null,
}: FileUploadProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const service = 'elevenlabs' as const
  const enableDiarization = true
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(defaultProjectId)
  const [numSpeakers, setNumSpeakers] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [progressStep, setProgressStep] = useState<string>('')
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_SIZE) return `ファイルサイズが大きすぎます (最大300MB)`
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.test(file.name)) {
      return 'サポートされていないファイル形式です'
    }
    return null
  }

  const addFilesToQueue = (files: File[]) => {
    setError('')
    const newItems: QueuedFile[] = []
    for (const file of files) {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        continue
      }
      // Skip duplicates
      if (queue.some((q) => q.file.name === file.name && q.file.size === file.size)) continue
      newItems.push({ file, status: 'pending' })
    }
    setQueue((prev) => [...prev, ...newItems])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) addFilesToQueue(files)
    // Reset input so same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addFilesToQueue(files)
  }

  const removeFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }

  const transcribeFile = async (file: File, idx: number): Promise<void> => {
    const apiKey = apiKeys.elevenlabs

    setCurrentFileIndex(idx)
    setProgress(0)
    setProgressStep('ファイルをアップロード中...')
    setQueue((prev) => prev.map((q, i) => i === idx ? { ...q, status: 'processing' } : q))

    const formData = new FormData()
    formData.append('audio', file)
    formData.append('service', service)
    formData.append('diarization', enableDiarization.toString())

    if (enableDiarization && numSpeakers) {
      const n = parseInt(numSpeakers, 10)
      if (n >= 2 && n <= 32) formData.append('numSpeakers', numSpeakers)
    }

    if (apiKey) {
      formData.append('apiKey', apiKey)
    }

    setProgress(20)
    setProgressStep('ElevenLabs Scribe APIで処理中...')

    const response = await fetch('/api/transcribe', { method: 'POST', body: formData })

    setProgress(70)
    setProgressStep('レスポンスを処理中...')

    if (!response.ok) {
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const errorData = await response.json()
        throw new Error(errorData.error || '文字起こしに失敗しました')
      }
      const text = await response.text()
      if (text.includes('413') || text.includes('Request Entity Too Large')) {
        throw new Error('ファイルが大きすぎます。より小さいファイルを選択してください')
      }
      throw new Error(`文字起こしに失敗しました (HTTP ${response.status})`)
    }

    setProgress(90)
    setProgressStep('結果を読み込み中...')
    const result = await response.json()

    setProgress(100)
    setProgressStep('完了')

    setQueue((prev) => prev.map((q, i) => i === idx ? { ...q, status: 'done' } : q))
    onTranscriptionComplete(result, file.name, service, selectedProjectId ?? undefined)
  }

  const handleTranscribeAll = async () => {
    const pendingFiles = queue.filter((q) => q.status === 'pending')
    if (pendingFiles.length === 0) {
      setError('ファイルを選択してください')
      return
    }

    if (!apiKeys.elevenlabs) {
      setError('ElevenLabs APIキーが設定されていません')
      return
    }

    setIsTranscribing(true)
    setError('')

    const pendingIndices = queue
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.status === 'pending')
      .map(({ i }) => i)

    for (const idx of pendingIndices) {
      try {
        await transcribeFile(queue[idx].file, idx)
      } catch (err: any) {
        setQueue((prev) => prev.map((q, i) => i === idx ? { ...q, status: 'error', error: err.message } : q))
        setError(`${queue[idx].file.name}: ${err.message}`)
        // Continue with next file even on error
      }
    }

    setCurrentFileIndex(-1)
    setTimeout(() => {
      setIsTranscribing(false)
      setProgress(0)
      setProgressStep('')
    }, 1000)
  }

  const canTranscribe = !!apiKeys.elevenlabs
  const pendingCount = queue.filter((q) => q.status === 'pending').length
  const doneCount = queue.filter((q) => q.status === 'done').length

  return (
    <div className="card" style={{ padding: '1rem' }}>
      {/* プロジェクト選択 */}
      {speechProjects.length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>保存先:</span>
          <button
            onClick={() => setSelectedProjectId(null)}
            style={{
              padding: '0.25rem 0.6rem', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', border: '1px solid',
              borderColor: selectedProjectId === null ? 'var(--accent)' : 'var(--border)',
              background: selectedProjectId === null ? 'rgba(var(--accent-rgb, 250,204,21),0.15)' : 'var(--bg)',
              color: selectedProjectId === null ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600,
            }}
          >
            セッション
          </button>
          {speechProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              style={{
                padding: '0.25rem 0.6rem', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', border: '1px solid',
                borderColor: selectedProjectId === p.id ? 'var(--accent)' : 'var(--border)',
                background: selectedProjectId === p.id ? 'rgba(var(--accent-rgb, 250,204,21),0.15)' : 'var(--bg)',
                color: selectedProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: selectedProjectId === p.id ? 700 : 400,
              }}
            >
              📁 {p.name}
            </button>
          ))}
        </div>
      )}

      {/* 話者数（オプション） */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>話者数</span>
        <input
          type="number"
          min="2"
          max="32"
          value={numSpeakers}
          onChange={(e) => setNumSpeakers(e.target.value)}
          placeholder="自動検出"
          className="input"
          style={{ width: '90px', padding: '0.375rem 0.5rem', fontSize: '12px', backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>空欄で自動検出（最大32名）</span>
      </div>

      {/* API key warning */}
      {!canTranscribe && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', borderColor: '#fbbf24', backgroundColor: '#fffbeb' }}>
          <div style={{ fontSize: '12px', color: '#92400e' }}>ElevenLabs APIキーが必要です（設定から登録してください）</div>
        </div>
      )}

      {/* Drop zone */}
      <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.mp4,.flac,.ogg,.webm" onChange={handleFileChange} className="hidden" id="file-upload" multiple />
      <label
        htmlFor="file-upload"
        className="card"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ display: 'block', padding: '1.5rem 2rem', cursor: 'pointer', textAlign: 'center', marginBottom: '1rem', border: isDragging ? '2px dashed var(--accent)' : '1px dashed var(--border)', backgroundColor: isDragging ? 'var(--bg-subtle)' : 'var(--card)', transition: 'all 0.2s ease' }}
      >
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '0.25rem' }}>
          {isDragging ? '📁 ここにドロップ' : '📎 ファイルを選択またはドラッグ&ドロップ（複数可）'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MP3 / WAV / M4A / MP4 / FLAC / OGG / WEBM・最大300MB</div>
      </label>

      {/* File queue */}
      {queue.length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {queue.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--card)', borderRadius: '6px', border: `1px solid ${item.status === 'error' ? '#ef4444' : item.status === 'done' ? 'var(--border)' : 'var(--border)'}` }}>
              {/* Status icon */}
              <span style={{ fontSize: '14px', flexShrink: 0 }}>
                {item.status === 'pending' && '⏳'}
                {item.status === 'processing' && (
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', verticalAlign: 'middle' }} />
                )}
                {item.status === 'done' && '✅'}
                {item.status === 'error' && '❌'}
              </span>
              {/* Filename */}
              <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: item.status === 'done' ? 'var(--text-muted)' : 'var(--text)' }}>
                {item.file.name}
              </span>
              {/* Size */}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                {(item.file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              {/* Remove (pending only) */}
              {item.status === 'pending' && !isTranscribing && (
                <button onClick={() => removeFromQueue(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '0 0.2rem', flexShrink: 0 }}>✕</button>
              )}
            </div>
          ))}
          {/* Queue summary */}
          {queue.length > 1 && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', paddingRight: '0.25rem' }}>
              {doneCount > 0 && `完了: ${doneCount}件　`}{pendingCount > 0 && `待機: ${pendingCount}件`}
            </div>
          )}
        </div>
      )}

      {/* Progress bar (current file) */}
      {isTranscribing && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
              {queue.length > 1 ? `処理中 (${doneCount + 1}/${queue.length})` : '文字起こし処理中'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--accent)' }}>{progress}%</span>
          </div>
          {currentFileIndex >= 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {queue[currentFileIndex]?.file.name}
            </div>
          )}
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--accent)', transition: 'width 0.3s ease', borderRadius: '3px' }} />
          </div>
          {progressStep && <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{progressStep}</p>}
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', borderColor: '#dc2626', backgroundColor: '#fef2f2', fontSize: '12px', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleTranscribeAll}
        disabled={pendingCount === 0 || !canTranscribe || isTranscribing}
        className="btn-primary"
        style={{ width: '100%', padding: '0.625rem' }}
      >
        {isTranscribing ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <svg className="animate-spin" style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            処理中...
          </span>
        ) : pendingCount > 1 ? `変換を開始（${pendingCount}件）` : '変換を開始'}
      </button>
    </div>
  )
}
