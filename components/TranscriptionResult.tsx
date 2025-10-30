'use client'

import { TranscriptionResult } from '@/lib/types'
import { generateSRT, generateVTT, downloadFile, generateTimestamp } from '@/lib/utils'

interface TranscriptionResultProps {
  result: TranscriptionResult
  onStartProofreading?: () => void
  onStartSubtitleGeneration?: () => void
}

export default function TranscriptionResultComponent({ result, onStartProofreading, onStartSubtitleGeneration }: TranscriptionResultProps) {
  const handleDownload = (format: 'txt' | 'json' | 'srt' | 'vtt') => {
    const timestamp = generateTimestamp()

    switch (format) {
      case 'txt':
        downloadFile(result.text, `transcription_${timestamp}.txt`, 'text/plain')
        break
      case 'json':
        const jsonContent = JSON.stringify(result, null, 2)
        downloadFile(jsonContent, `transcription_${timestamp}.json`, 'application/json')
        break
      case 'srt':
        const srtContent = generateSRT(result)
        if (srtContent) {
          downloadFile(srtContent, `transcription_${timestamp}.srt`, 'text/plain')
        }
        break
      case 'vtt':
        const vttContent = generateVTT(result)
        if (vttContent) {
          downloadFile(vttContent, `transcription_${timestamp}.vtt`, 'text/vtt')
        }
        break
    }
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1rem' }}>変換結果</h3>

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

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
          変換されたテキスト
        </label>
        <textarea
          value={result.text}
          readOnly
          className="textarea"
          rows={12}
        />
      </div>

      <div>
        <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
          📥 ダウンロード
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          <button
            onClick={() => handleDownload('txt')}
            className="card"
            style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s' }}
          >
            <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>TXT</span>
          </button>
          <button
            onClick={() => handleDownload('json')}
            className="card"
            style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s' }}
          >
            <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>JSON</span>
          </button>
          <button
            onClick={() => handleDownload('srt')}
            className="card"
            style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s' }}
          >
            <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>SRT</span>
          </button>
          <button
            onClick={() => handleDownload('vtt')}
            className="card"
            style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s' }}
          >
            <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>VTT</span>
          </button>
        </div>
        {result.segments && result.segments.some(seg => seg.speaker) && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
            💬 SRT/VTTファイルには話者情報が含まれます
          </div>
        )}
      </div>

      {(onStartProofreading || onStartSubtitleGeneration) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginTop: '1rem' }}>
            {onStartProofreading && (
              <button
                onClick={onStartProofreading}
                className="btn-primary"
                style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '13px', fontWeight: 600 }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                校正を開始
              </button>
            )}
            {onStartSubtitleGeneration && (
              <button
                onClick={onStartSubtitleGeneration}
                className="btn-primary"
                style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '13px', fontWeight: 600 }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                字幕を生成
              </button>
            )}
          </div>
        </>
      )}

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
                  <span className="badge" style={{ fontSize: '10px' }}>
                    #{index + 1}
                  </span>
                  <span className="badge" style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s
                  </span>
                  {segment.speaker && (
                    <span className="badge" style={{ fontSize: '10px' }}>
                      話者 {segment.speaker}
                    </span>
                  )}
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
                <span
                  key={index}
                  className="badge"
                  title={`${word.start.toFixed(2)}s${(word as any).speaker ? ` - ${(word as any).speaker}` : ''}`}
                  style={{
                    fontSize: '11px',
                    cursor: 'default',
                    backgroundColor: (word as any).speaker ? 'var(--accent-subtle)' : undefined
                  }}
                >
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
