'use client'

import { useRef, useState } from 'react'

/**
 * SRT/VTT から字幕テキストのみを抽出する（タイムコードは一切変更しない）
 * 入力ファイルは読み取り専用で、タイムコードデータは抽出対象から除外される。
 */
function parseSRTText(content: string): string {
  const blocks = content.split(/\r?\n\r?\n+/)
  const lines: string[] = []
  for (const block of blocks) {
    for (const line of block.trim().split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      if (/^\d+$/.test(t)) continue  // シーケンス番号
      if (/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*/.test(t)) continue  // タイムコード行
      if (t === 'WEBVTT' || /^NOTE\b/.test(t) || /^STYLE\b/.test(t) || /^REGION\b/.test(t)) continue  // VTTヘッダー
      if (/^X-TIMESTAMP-MAP=/.test(t)) continue  // HLS VTT
      lines.push(t)
    }
  }
  return lines.join('\n')
}

interface SRTUploadProps {
  onTextExtracted: (text: string, fileName: string) => void
}

export default function SRTUpload({ onTextExtracted }: SRTUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const text = parseSRTText(content)
      if (text.trim()) {
        onTextExtracted(text, file.name)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '8px',
        padding: '0.6rem 1rem',
        textAlign: 'center',
        cursor: 'pointer',
        background: isDragging ? 'rgba(212,180,86,0.06)' : 'transparent',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        🎬 SRT / VTT をドロップ — 字幕ファイルから書き起こしを読み込んでスクリーニング
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".srt,.vtt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
