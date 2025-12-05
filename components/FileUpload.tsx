'use client'

import { useState, useRef } from 'react'
import { ApiKeys, TranscriptionResult } from '@/lib/types'

interface FileUploadProps {
  apiKeys: ApiKeys
  onTranscriptionComplete: (result: TranscriptionResult) => void
  isTranscribing: boolean
  setIsTranscribing: (value: boolean) => void
}

export default function FileUpload({
  apiKeys,
  onTranscriptionComplete,
  isTranscribing,
  setIsTranscribing,
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [service, setService] = useState<'openai' | 'elevenlabs' | 'whisperx'>('whisperx')
  const [enableDiarization, setEnableDiarization] = useState<boolean>(false)
  const [numSpeakers, setNumSpeakers] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [progressStep, setProgressStep] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateAndSetFile = (file: File) => {
    const maxSize = 300 * 1024 * 1024
    if (file.size > maxSize) {
      setError(`ファイルサイズが大きすぎます (最大300MB)`)
      setSelectedFile(null)
      return
    }

    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/ogg', 'audio/webm', 'video/mp4']
    if (allowedTypes.includes(file.type) || file.name.match(/\.(mp3|wav|m4a|mp4|flac|ogg|webm)$/i)) {
      setSelectedFile(file)
      setError('')
    } else {
      setError('サポートされていないファイル形式です')
      setSelectedFile(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndSetFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      validateAndSetFile(file)
    }
  }

  const handleTranscribe = async () => {
    if (!selectedFile) {
      setError('ファイルを選択してください')
      return
    }

    if (service !== 'whisperx') {
      const apiKey = service === 'openai' ? apiKeys.openai : apiKeys.elevenlabs
      if (!apiKey) {
        setError(`${service === 'openai' ? 'OpenAI' : 'ElevenLabs'} APIキーが設定されていません`)
        return
      }
    }

    setIsTranscribing(true)
    setError('')
    setProgress(0)
    setProgressStep('ファイルをアップロード中...')

    try {
      const formData = new FormData()
      formData.append('audio', selectedFile)
      formData.append('service', service)
      formData.append('diarization', enableDiarization.toString())

      // 話者数を指定している場合
      if (enableDiarization && numSpeakers) {
        const numSpeakersInt = parseInt(numSpeakers, 10)
        if (numSpeakersInt > 0 && numSpeakersInt <= 32) {
          formData.append('numSpeakers', numSpeakers)
        }
      }

      if (service !== 'whisperx') {
        const apiKey = service === 'openai' ? apiKeys.openai : apiKeys.elevenlabs
        if (apiKey) {
          formData.append('apiKey', apiKey)
        }
      }

      setProgress(20)
      setProgressStep(service === 'whisperx' ? 'WhisperXで処理中...' : service === 'openai' ? 'OpenAI Whisper APIで処理中...' : 'ElevenLabs Scribe APIで処理中...')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      setProgress(70)
      setProgressStep('レスポンスを処理中...')

      if (!response.ok) {
        // レスポンスがJSONでない場合（HTMLエラーページなど）を処理
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          throw new Error(errorData.error || '文字起こしに失敗しました')
        } else {
          // HTMLエラーページの場合
          const text = await response.text()
          if (text.includes('Request Entity Too Large') || text.includes('413')) {
            throw new Error('ファイルが大きすぎます。より小さいファイルを選択してください')
          }
          throw new Error(`文字起こしに失敗しました (HTTP ${response.status})`)
        }
      }

      setProgress(90)
      setProgressStep('結果を読み込み中...')

      const result = await response.json()
      
      setProgress(100)
      setProgressStep('完了')
      
      onTranscriptionComplete(result)
    } catch (err: any) {
      setError(err.message || '文字起こし中にエラーが発生しました')
      setProgress(0)
      setProgressStep('')
    } finally {
      setTimeout(() => {
        setIsTranscribing(false)
        setProgress(0)
        setProgressStep('')
      }, 1000)
    }
  }

  const canTranscribe = service === 'whisperx' ? true : (service === 'openai' ? !!apiKeys.openai : !!apiKeys.elevenlabs)

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button onClick={() => setService('whisperx')} className={service === 'whisperx' ? 'btn-primary' : 'btn'} style={{ flex: 1, fontSize: '12px', padding: '0.5rem' }}>
            WhisperX
          </button>
          <button onClick={() => setService('openai')} className={service === 'openai' ? 'btn-primary' : 'btn'} style={{ flex: 1, fontSize: '12px', padding: '0.5rem' }}>
            OpenAI
          </button>
          <button onClick={() => setService('elevenlabs')} className={service === 'elevenlabs' ? 'btn-primary' : 'btn'} style={{ flex: 1, fontSize: '12px', padding: '0.5rem' }}>
            ElevenLabs
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
          {service === 'whisperx' && 'ローカル処理・APIキー不要'}
          {service === 'openai' && 'Whisper API'}
          {service === 'elevenlabs' && '話者識別対応'}
        </div>
      </div>

      {/* 話者分離チェックボックス */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: service === 'openai' ? 'not-allowed' : 'pointer', opacity: service === 'openai' ? 0.5 : 1 }}>
          <input
            type="checkbox"
            checked={enableDiarization}
            onChange={(e) => setEnableDiarization(e.target.checked)}
            disabled={service === 'openai'}
            style={{ width: '16px', height: '16px', cursor: service === 'openai' ? 'not-allowed' : 'pointer' }}
          />
          <span style={{ fontSize: '12px', fontWeight: 500 }}>話者分離を有効にする</span>
        </label>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
          {service === 'openai' ? 'OpenAI Whisper APIは話者分離に対応していません' : '声質で話者を自動識別（WhisperX・ElevenLabs対応、最大32名まで）'}
        </div>

        {/* 話者数の入力（オプション） */}
        {enableDiarization && service !== 'openai' && (
          <div style={{ marginTop: '0.75rem', marginLeft: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '0.25rem' }}>
              話者数（オプション）
            </label>
            <input
              type="number"
              min="2"
              max="32"
              value={numSpeakers}
              onChange={(e) => setNumSpeakers(e.target.value)}
              placeholder="自動検出"
              className="input"
              style={{
                width: '100px',
                padding: '0.375rem 0.5rem',
                fontSize: '12px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              空欄で自動検出、2〜32で指定可能
            </div>
          </div>
        )}
      </div>

      {service !== 'whisperx' && !canTranscribe && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', borderColor: '#fbbf24', backgroundColor: '#fffbeb' }}>
          <div style={{ fontSize: '12px', color: '#92400e' }}>
            {service === 'openai' ? 'OpenAI' : 'ElevenLabs'} APIキーが必要です
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.mp4,.flac,.ogg,.webm" onChange={handleFileChange} className="hidden" id="file-upload" />
      <label
        htmlFor="file-upload"
        className="card"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'block',
          padding: '2rem',
          cursor: 'pointer',
          textAlign: 'center',
          marginBottom: '1rem',
          border: isDragging ? '2px dashed var(--accent)' : '1px solid var(--border)',
          backgroundColor: isDragging ? 'var(--bg-subtle)' : 'var(--card)',
          transition: 'all 0.2s ease'
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '0.25rem' }}>
          {isDragging ? '📁 ここにドロップ' : '📎 ファイルを選択またはドラッグ&ドロップ'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>最大300MB</div>
      </label>

      {selectedFile && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px' }}>{selectedFile.name}</div>
          <button onClick={() => setSelectedFile(null)} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '11px' }}>削除</button>
        </div>
      )}

      {/* 進行状況表示 */}
      {isTranscribing && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>文字起こし処理中</span>
            <span style={{ fontSize: '11px', color: 'var(--accent)' }}>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${progress}%`, 
                height: '100%', 
                backgroundColor: 'var(--accent)', 
                transition: 'width 0.3s ease',
                borderRadius: '3px'
              }} 
            />
          </div>
          {progressStep && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{progressStep}</p>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', borderColor: '#dc2626', backgroundColor: '#fef2f2', fontSize: '12px', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <button onClick={handleTranscribe} disabled={!selectedFile || !canTranscribe || isTranscribing} className="btn-primary" style={{ width: '100%', padding: '0.625rem' }}>
        {isTranscribing ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <svg className="animate-spin" style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            処理中...
          </span>
        ) : '変換を開始'}
      </button>
    </div>
  )
}
