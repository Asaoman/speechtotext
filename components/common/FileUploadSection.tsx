'use client'

import { useState } from 'react'

interface FileUploadSectionProps {
  onFileLoaded: (text: string, fileName: string) => void
  onError: (error: string) => void
  acceptedFormats?: string[]
  isOpen?: boolean
  parseSRT?: boolean
}

export default function FileUploadSection({
  onFileLoaded,
  onError,
  acceptedFormats = ['.srt', '.txt', '.md'],
  isOpen = false,
  parseSRT = true,
}: FileUploadSectionProps) {
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [fileUploadError, setFileUploadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const parseSRTFile = (srtContent: string): string => {
    const lines = srtContent.split('\n')
    const textLines: string[] = []
    let parsingText = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line === '') {
        parsingText = false
        continue
      }
      if (/^\d+$/.test(line) && !parsingText) continue
      if (line.includes('-->')) {
        parsingText = true
        continue
      }
      if (parsingText) {
        textLines.push(line)
      }
    }
    return textLines.join(' ')
  }

  const processFile = (file: File) => {
    setFileUploadError('')
    onError('')

    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))

    if (!acceptedFormats.includes(fileExtension)) {
      const errorMsg = `対応していないファイル形式です。${acceptedFormats.join(', ')}ファイルをアップロードしてください。`
      setFileUploadError(errorMsg)
      onError(errorMsg)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        let parsedText = ''

        if (fileExtension === '.srt' && parseSRT) {
          parsedText = parseSRTFile(content)
        } else {
          parsedText = content
        }

        setUploadedFileName(file.name)
        setFileUploadError('')
        onFileLoaded(parsedText, file.name)
      } catch (err: any) {
        const errorMsg = `ファイルの読み込みに失敗しました: ${err.message}`
        setFileUploadError(errorMsg)
        onError(errorMsg)
      }
    }

    reader.onerror = () => {
      const errorMsg = 'ファイルの読み込み中にエラーが発生しました'
      setFileUploadError(errorMsg)
      onError(errorMsg)
    }

    reader.readAsText(file, 'UTF-8')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    processFile(file)
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  return (
    <details style={{ marginBottom: '0.75rem' }} open={isOpen}>
      <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        📁 ファイル ({acceptedFormats.join(', ')})
      </summary>

      {/* ドラッグ&ドロップエリア */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: '1.5rem',
          border: isDragging ? '2px dashed var(--accent)' : '2px dashed var(--border)',
          borderRadius: '8px',
          backgroundColor: isDragging ? 'var(--bg-subtle)' : 'transparent',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '0.75rem'
        }}
        onClick={() => document.getElementById('file-upload-hidden')?.click()}
      >
        <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text)' }}>
          {isDragging ? '📁 ここにドロップ' : '📎 ファイルを選択またはドラッグ&ドロップ'}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {acceptedFormats.join(', ')}
        </div>
      </div>

      <input
        id="file-upload-hidden"
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {uploadedFileName && (
        <p style={{ fontSize: '10px', color: '#16a34a', marginTop: '0.5rem' }}>
          ✓ {uploadedFileName}
        </p>
      )}
      {fileUploadError && (
        <p style={{ fontSize: '10px', color: '#dc2626', marginTop: '0.5rem' }}>
          {fileUploadError}
        </p>
      )}
    </details>
  )
}
