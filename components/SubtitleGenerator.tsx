'use client'

import { useState, useEffect } from 'react'
import { TranscriptionWord, TranscriptionResult, SubtitleSettings, SubtitleGenerationResult, SubtitleEntry, AIPreferences } from '@/lib/types'
import { downloadFile, generateTimestamp, formatTimestampSRT, formatTimestampVTT } from '@/lib/utils'
import ProperNounsModalMinimal from './ProperNounsModalMinimal'
import ProjectSelectorCard from './common/ProjectSelectorCard'
import FileUploadSection from './common/FileUploadSection'
import { useProject } from '@/hooks/useProject'

interface SubtitleGeneratorProps {
  transcriptionResult?: TranscriptionResult | null  // オプショナルに変更
  subtitleSettings: SubtitleSettings
  apiKeys: { openai?: string; claude?: string; gemini?: string }
  aiPreferences: AIPreferences
  onSubtitleGenerated?: (srt: string, vtt: string) => void
  navigatedFromTranscription?: boolean
}

// テキストから疑似的なwordsデータを生成
function generateWordsFromText(text: string, language: 'en' | 'ja'): TranscriptionWord[] {
  let words: string[]

  if (language === 'ja') {
    // 日本語：句読点で分割し、さらに10文字程度のチャンクに分割
    const sentences = text.split(/[。、！？\n]/).filter(s => s.trim())
    words = []
    sentences.forEach(sentence => {
      const trimmed = sentence.trim()
      if (trimmed.length <= 15) {
        words.push(trimmed)
      } else {
        // 長い文は15文字程度のチャンクに分割
        for (let i = 0; i < trimmed.length; i += 15) {
          words.push(trimmed.slice(i, i + 15))
        }
      }
    })
  } else {
    // 英語：単語で分割
    words = text.split(/\s+/).filter(w => w.trim())
  }

  const avgWordDuration = language === 'ja' ? 2.0 : 0.5 // 日本語は長め
  const wordGap = 0.1 // 単語間の間隔（秒）

  return words.map((word, index) => ({
    word: word.trim(),
    start: index * (avgWordDuration + wordGap),
    end: index * (avgWordDuration + wordGap) + avgWordDuration,
  }))
}

// SRTファイルをパースしてSubtitleEntry[]に変換
function parseSRTFile(srtContent: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = []
  const lines = srtContent.split('\n')

  let currentEntry: Partial<SubtitleEntry> = {}
  let currentTextLines: string[] = []
  let parsingText = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 空行 - エントリの区切り
    if (line === '') {
      if (currentEntry.index && currentEntry.startTime !== undefined && currentEntry.endTime !== undefined && currentTextLines.length > 0) {
        entries.push({
          index: currentEntry.index,
          startTime: currentEntry.startTime,
          endTime: currentEntry.endTime,
          text: currentTextLines.join('\n'),
          lines: currentTextLines
        })
      }
      currentEntry = {}
      currentTextLines = []
      parsingText = false
      continue
    }

    // インデックス行（数字のみ）
    if (/^\d+$/.test(line) && !parsingText) {
      currentEntry.index = parseInt(line)
      continue
    }

    // タイムスタンプ行（例: 00:00:01,000 --> 00:00:03,000）
    if (line.includes('-->')) {
      const timestampMatch = line.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/)
      if (timestampMatch) {
        const [_, startH, startM, startS, startMs, endH, endM, endS, endMs] = timestampMatch
        currentEntry.startTime = parseInt(startH) * 3600 + parseInt(startM) * 60 + parseInt(startS) + parseInt(startMs) / 1000
        currentEntry.endTime = parseInt(endH) * 3600 + parseInt(endM) * 60 + parseInt(endS) + parseInt(endMs) / 1000
        parsingText = true
      }
      continue
    }

    // テキスト行
    if (parsingText) {
      currentTextLines.push(line)
    }
  }

  // 最後のエントリを追加
  if (currentEntry.index && currentEntry.startTime !== undefined && currentEntry.endTime !== undefined && currentTextLines.length > 0) {
    entries.push({
      index: currentEntry.index,
      startTime: currentEntry.startTime,
      endTime: currentEntry.endTime,
      text: currentTextLines.join('\n'),
      lines: currentTextLines
    })
  }

  return entries
}

export default function SubtitleGenerator({ transcriptionResult, subtitleSettings, apiKeys, aiPreferences, onSubtitleGenerated, navigatedFromTranscription = false }: SubtitleGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<SubtitleGenerationResult | null>(null)
  const [error, setError] = useState('')
  const [editingSubtitles, setEditingSubtitles] = useState<SubtitleEntry[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [fileUploadError, setFileUploadError] = useState('')
  const [showProperNounsModal, setShowProperNounsModal] = useState(false)
  const [inputText, setInputText] = useState(transcriptionResult?.text || '')
  const [textTab, setTextTab] = useState<'input' | 'preview'>('input')

  // プロジェクト管理（カスタムフック）
  const {
    projects,
    selectedProjectId,
    customContext,
    showNewProjectInput,
    newProjectName,
    setCustomContext,
    setShowNewProjectInput,
    setNewProjectName,
    handleProjectSelect,
    handleCreateProject,
  } = useProject()

  // ローカル設定（字幕生成時に使用）
  const [localLanguage, setLocalLanguage] = useState<'en' | 'ja'>(subtitleSettings.currentLanguage)
  const [localMaxCharsPerLine, setLocalMaxCharsPerLine] = useState(subtitleSettings[subtitleSettings.currentLanguage].maxCharsPerLine)
  const [localMaxLines, setLocalMaxLines] = useState(subtitleSettings[subtitleSettings.currentLanguage].maxLines)

  // subtitleSettingsが変更されたらローカル設定を同期
  useEffect(() => {
    setLocalLanguage(subtitleSettings.currentLanguage)
    setLocalMaxCharsPerLine(subtitleSettings[subtitleSettings.currentLanguage].maxCharsPerLine)
    setLocalMaxLines(subtitleSettings[subtitleSettings.currentLanguage].maxLines)
  }, [subtitleSettings])

  // 書き起こし結果の言語に基づいて字幕生成の言語を自動設定
  useEffect(() => {
    if (transcriptionResult?.language) {
      const detectedLang = transcriptionResult.language.toLowerCase()
      // 英語系（en, english等）は"en"、日本語系（ja, japanese等）は"ja"にマッピング
      if (detectedLang.startsWith('en') || detectedLang === 'english') {
        setLocalLanguage('en')
      } else if (detectedLang.startsWith('ja') || detectedLang === 'japanese') {
        setLocalLanguage('ja')
      }
      // その他の言語は英語をデフォルトとする
      else if (detectedLang && detectedLang !== 'en' && detectedLang !== 'ja') {
        setLocalLanguage('en')
      }
    }
  }, [transcriptionResult?.language])

  // 言語が変更されたら文字数・行数を更新
  useEffect(() => {
    setLocalMaxCharsPerLine(subtitleSettings[localLanguage].maxCharsPerLine)
    setLocalMaxLines(subtitleSettings[localLanguage].maxLines)
  }, [localLanguage, subtitleSettings])

  // transcriptionResultがある場合のwordsを計算
  const words = transcriptionResult?.words && transcriptionResult.words.length > 0
    ? transcriptionResult.words
    : transcriptionResult?.segments && transcriptionResult.segments.length > 0
    ? generateWordsFromSegments(transcriptionResult.segments, localLanguage)
    : transcriptionResult?.text
    ? generateWordsFromText(transcriptionResult.text, localLanguage)
    : null

  // segmentsからwordsを生成
  function generateWordsFromSegments(segments: any[], language: 'en' | 'ja'): TranscriptionWord[] {
    const allWords: TranscriptionWord[] = []
    segments.forEach(segment => {
      const segmentText = segment.text
      const segmentStart = segment.start
      const segmentEnd = segment.end
      const segmentDuration = segmentEnd - segmentStart

      let words: string[]
      if (language === 'ja') {
        const sentences = segmentText.split(/[。、！？\n]/).filter((s: string) => s.trim())
        words = []
        sentences.forEach((sentence: string) => {
          const trimmed = sentence.trim()
          if (trimmed.length <= 15) {
            words.push(trimmed)
          } else {
            for (let i = 0; i < trimmed.length; i += 15) {
              words.push(trimmed.slice(i, i + 15))
            }
          }
        })
      } else {
        words = segmentText.split(/\s+/).filter((w: string) => w.trim())
      }

      if (words.length === 0) return

      const wordDuration = segmentDuration / words.length
      words.forEach((word, idx) => {
        allWords.push({
          word: word.trim(),
          start: segmentStart + idx * wordDuration,
          end: segmentStart + (idx + 1) * wordDuration,
        })
      })
    })
    return allWords
  }

  // ファイルアップロード処理（FileUploadSectionから呼ばれる）
  const handleFileLoaded = (text: string, fileName: string) => {
    setInputText(text)
  }

  // SubtitleEntry[]からSRTを生成
  const regenerateSRTFromSubtitles = (subtitles: SubtitleEntry[]): string => {
    let content = ''
    subtitles.forEach((subtitle, idx) => {
      content += `${idx + 1}\n`
      content += `${formatTimestampSRT(subtitle.startTime)} --> ${formatTimestampSRT(subtitle.endTime)}\n`
      content += subtitle.lines.join('\n')
      content += '\n\n'
    })
    return content
  }

  // SubtitleEntry[]からVTTを生成
  const regenerateVTTFromSubtitles = (subtitles: SubtitleEntry[]): string => {
    let content = 'WEBVTT\n\n'
    subtitles.forEach((subtitle) => {
      content += `${formatTimestampVTT(subtitle.startTime)} --> ${formatTimestampVTT(subtitle.endTime)}\n`
      content += subtitle.lines.join('\n')
      content += '\n\n'
    })
    return content
  }

  const handleGenerate = async () => {
    // wordsがない場合はinputTextから疑似wordsを生成
    let wordsToUse = words
    if (!wordsToUse && inputText.trim()) {
      wordsToUse = generateWordsFromText(inputText, localLanguage)
    }

    if (!wordsToUse || wordsToUse.length === 0) {
      setError('字幕を生成するためのテキストまたはword情報がありません')
      return
    }

    // デフォルトAIサービスに基づいてAPIキーを選択
    const lineBreakService = aiPreferences.defaultService === 'openai' ? 'chatgpt' : aiPreferences.defaultService
    const apiKey = aiPreferences.defaultService === 'openai' ? apiKeys.openai : aiPreferences.defaultService === 'claude' ? apiKeys.claude : apiKeys.gemini

    setIsGenerating(true)
    setError('') // 一旦エラーをクリア

    // APIキーがない場合は警告メッセージを設定（エラーではない）
    const hasApiKey = !!apiKey

    try {
      const response = await fetch('/api/subtitles/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          words: wordsToUse,
          settings: {
            language: localLanguage,
            maxCharsPerLine: localMaxCharsPerLine,
            maxLines: localMaxLines,
            lineBreakService,
            lineBreakApiKey: apiKey,
          },
          language: localLanguage,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '字幕生成に失敗しました')
      }

      const data = await response.json()
      setResult(data)
      setEditingSubtitles(data.subtitles)

      // SRTプレビュータブに自動切替
      setTextTab('preview')

      // APIキーがなかった場合の警告メッセージを設定
      if (!hasApiKey) {
        setError(`⚠️ ${aiPreferences.defaultService === 'openai' ? 'OpenAI' : aiPreferences.defaultService === 'claude' ? 'Claude' : 'Google Gemini'} APIキーが設定されていないため、基本的な改行ロジックを使用しました。より自然な改行位置を求める場合は、設定からAPIキーを入力してください。`)
      }

      // 親コンポーネントにデータを渡す
      if (onSubtitleGenerated && data.srtContent && data.vttContent) {
        onSubtitleGenerated(data.srtContent, data.vttContent)
      }
    } catch (err: any) {
      setError(err.message || '字幕生成中にエラーが発生しました')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUpdateSubtitle = (index: number, field: keyof SubtitleEntry, value: any) => {
    const updated = [...editingSubtitles]
    updated[index] = { ...updated[index], [field]: value }
    setEditingSubtitles(updated)
  }

  const handleTimeChange = (index: number, field: 'startTime' | 'endTime', value: string) => {
    // HH:MM:SS,mmm または HH:MM:SS.mmm 形式から秒数に変換
    const parts = value.split(':')
    if (parts.length !== 3) return

    const hours = parseInt(parts[0]) || 0
    const minutes = parseInt(parts[1]) || 0
    const secondsParts = parts[2].split(/[,.]/)
    const seconds = parseInt(secondsParts[0]) || 0
    const milliseconds = parseInt(secondsParts[1]) || 0

    const totalSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
    handleUpdateSubtitle(index, field, totalSeconds)
  }

  const adjustTime = (index: number, field: 'startTime' | 'endTime', delta: number) => {
    const updated = [...editingSubtitles]
    const newTime = Math.max(0, updated[index][field] + delta)
    updated[index] = { ...updated[index], [field]: newTime }
    setEditingSubtitles(updated)
  }

  const handleTextChange = (index: number, value: string) => {
    handleUpdateSubtitle(index, 'text', value)
    // テキストを行に分割
    const lines = value.split('\n').filter(l => l.trim())
    handleUpdateSubtitle(index, 'lines', lines)
  }

  const regenerateSRT = () => {
    let content = ''
    editingSubtitles.forEach((subtitle, idx) => {
      content += `${idx + 1}\n`
      content += `${formatTimestampSRT(subtitle.startTime)} --> ${formatTimestampSRT(subtitle.endTime)}\n`
      content += subtitle.lines.join('\n')
      content += '\n\n'
    })
    return content
  }

  const regenerateVTT = () => {
    let content = 'WEBVTT\n\n'
    editingSubtitles.forEach((subtitle) => {
      content += `${formatTimestampVTT(subtitle.startTime)} --> ${formatTimestampVTT(subtitle.endTime)}\n`
      content += subtitle.lines.join('\n')
      content += '\n\n'
    })
    return content
  }

  const handleDownloadEdited = (format: 'srt' | 'vtt') => {
    const content = format === 'srt' ? regenerateSRT() : regenerateVTT()
    const mimeType = format === 'srt' ? 'text/plain' : 'text/vtt'
    downloadFile(content, `subtitles_edited_${generateTimestamp()}.${format}`, mimeType)

    // 編集後のデータを親に送信
    if (onSubtitleGenerated) {
      onSubtitleGenerated(regenerateSRT(), regenerateVTT())
    }
  }

  const deleteSubtitle = (index: number) => {
    const updated = editingSubtitles.filter((_, i) => i !== index)
    // インデックスを再割り当て
    updated.forEach((sub, i) => {
      sub.index = i + 1
    })
    setEditingSubtitles(updated)
  }

  const formatTimeForInput = (seconds: number): string => {
    return formatTimestampSRT(seconds)
  }

  const getDuration = (subtitle: SubtitleEntry): string => {
    const duration = subtitle.endTime - subtitle.startTime
    return `${duration.toFixed(2)}s`
  }

  // タイムスタンプ情報があるかどうかを判定（wordsまたはsegmentsがある場合）
  const hasRealWords = (transcriptionResult?.words && transcriptionResult.words.length > 0) || (transcriptionResult?.segments && transcriptionResult.segments.length > 0)
  const hasTranscriptionData = transcriptionResult && (transcriptionResult.text || transcriptionResult.words || transcriptionResult.segments)

  // AIサービスとモデルの表示名を取得
  const service = aiPreferences.defaultService
  const model = service === 'openai'
    ? aiPreferences.openaiModel
    : service === 'claude'
    ? aiPreferences.claudeModel
    : aiPreferences.geminiModel

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* テキスト */}
      <div className="card" style={{ padding: '1rem' }}>
        <FileUploadSection
          onFileLoaded={handleFileLoaded}
          onError={setFileUploadError}
          acceptedFormats={['.srt']}
          isOpen={!navigatedFromTranscription}
          parseSRT={false}
        />

        {/* タブ */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <button
            onClick={() => setTextTab('input')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '11px',
              fontWeight: 600,
              borderBottom: textTab === 'input' ? '2px solid var(--accent)' : 'none',
              color: textTab === 'input' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            入力テキスト
          </button>
          <button
            onClick={() => setTextTab('preview')}
            disabled={!result || !result.success}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '11px',
              fontWeight: 600,
              borderBottom: textTab === 'preview' ? '2px solid var(--accent)' : 'none',
              color: textTab === 'preview' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: (!result || !result.success) ? 'not-allowed' : 'pointer',
              marginBottom: '-1px',
              opacity: (!result || !result.success) ? 0.5 : 1
            }}
          >
            SRTプレビュー
          </button>
        </div>

        {/* 入力テキスト */}
        {textTab === 'input' && (
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="textarea"
            rows={12}
            placeholder="テキストを入力"
            style={{ fontSize: '12px' }}
          />
        )}

        {/* SRTプレビュー */}
        {textTab === 'preview' && (
          <textarea
            value={regenerateSRTFromSubtitles(editingSubtitles)}
            readOnly
            className="textarea"
            rows={12}
            style={{ fontSize: '11px', fontFamily: 'monospace', backgroundColor: 'var(--bg-subtle)' }}
          />
        )}
      </div>

      {/* プロジェクト設定 */}
      <ProjectSelectorCard
        projects={projects}
        selectedProjectId={selectedProjectId}
        customContext={customContext}
        showNewProjectInput={showNewProjectInput}
        newProjectName={newProjectName}
        aiPreferences={aiPreferences}
        onProjectSelect={handleProjectSelect}
        onContextChange={setCustomContext}
        onCreateProject={handleCreateProject}
        onToggleNewProjectInput={() => setShowNewProjectInput(!showNewProjectInput)}
        onNewProjectNameChange={setNewProjectName}
        onCancelNewProject={() => {
          setShowNewProjectInput(false)
          setNewProjectName('')
        }}
        showProperNounsButton={true}
        onOpenProperNouns={() => setShowProperNounsModal(true)}
      />


      {!hasRealWords && hasTranscriptionData && (
        <p style={{ fontSize: '10px', color: '#92400e', padding: '0.5rem', backgroundColor: '#fffbeb', borderRadius: '4px', marginBottom: '0.75rem' }}>
          ⚠️ タイムスタンプ情報なし（疑似タイミングで生成）
        </p>
      )}

      {error && (
        <p style={{
          fontSize: '10px',
          color: error.startsWith('⚠️') ? '#92400e' : '#dc2626',
          padding: '0.5rem',
          backgroundColor: error.startsWith('⚠️') ? '#fffbeb' : '#fef2f2',
          borderRadius: '4px',
          marginBottom: '0.75rem'
        }}>{error}</p>
      )}

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          字幕設定
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div
            className="input"
            style={{
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--bg-subtle)',
              cursor: 'default'
            }}
          >
            {localLanguage === 'ja' ? '🇯🇵 日本語' : '🇺🇸 English'}
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
              (自動)
            </span>
          </div>

          <input
            type="number"
            value={localMaxCharsPerLine}
            onChange={(e) => setLocalMaxCharsPerLine(parseInt(e.target.value) || 0)}
            className="input"
            placeholder="文字/行"
            style={{ fontSize: '11px' }}
            min="10"
            max="100"
          />

          <input
            type="number"
            value={localMaxLines}
            onChange={(e) => setLocalMaxLines(parseInt(e.target.value) || 0)}
            className="input"
            placeholder="最大行数"
            style={{ fontSize: '11px' }}
            min="1"
            max="5"
          />
        </div>
        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
          {service === 'openai' ? 'OpenAI' : service === 'claude' ? 'Claude' : 'Gemini'} · {model}
        </p>
      </div>

      {hasTranscriptionData && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="btn-primary"
          style={{ width: '100%', padding: '0.75rem', fontSize: '12px', marginBottom: result ? '1rem' : 0 }}
        >
          {isGenerating ? '生成中...' : '字幕生成'}
        </button>
      )}

      {result && result.success && editingSubtitles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
              📥 ダウンロード
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                onClick={() => handleDownloadEdited('srt')}
                className="card"
                style={{
                  padding: '1rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>SRT</span>
              </button>
              <button
                onClick={() => handleDownloadEdited('vtt')}
                className="card"
                style={{
                  padding: '1rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>VTT</span>
              </button>
            </div>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="btn"
              style={{ width: '100%', padding: '0.625rem', fontSize: '11px' }}
            >
              {showTimeline ? '📉 タイムラインを閉じる' : '📊 タイムラインを表示'}
            </button>
          </div>

          {showTimeline && (
            <div className="card" style={{ padding: '1rem', backgroundColor: 'rgba(20, 20, 20, 0.5)' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                タイムライン
              </p>
              <div style={{ position: 'relative', height: `${editingSubtitles.length * 40 + 40}px`, backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', padding: '20px 10px' }}>
                {/* タイムスケール */}
                <div style={{ position: 'absolute', top: 0, left: '10px', right: '10px', height: '20px', borderBottom: '1px solid var(--border)' }}>
                  {Array.from({ length: Math.ceil((editingSubtitles[editingSubtitles.length - 1]?.endTime || 0) / 5) + 1 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${(i * 5) / (editingSubtitles[editingSubtitles.length - 1]?.endTime || 1) * 100}%`,
                        top: 0,
                        fontSize: '10px',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {i * 5}s
                    </div>
                  ))}
                </div>

                {/* 字幕バー */}
                {editingSubtitles.map((subtitle, idx) => {
                  const maxTime = editingSubtitles[editingSubtitles.length - 1]?.endTime || 1
                  const left = (subtitle.startTime / maxTime) * 100
                  const width = ((subtitle.endTime - subtitle.startTime) / maxTime) * 100

                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        top: `${idx * 40 + 30}px`,
                        width: `${width}%`,
                        height: '30px',
                        backgroundColor: editingIndex === idx ? 'var(--accent)' : 'rgba(250, 204, 21, 0.6)',
                        border: '1px solid var(--accent)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#000',
                        overflow: 'hidden',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                      title={`#${subtitle.index}: ${subtitle.text.substring(0, 30)}...`}
                    >
                      #{subtitle.index}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '1rem' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
              字幕編集 ({editingSubtitles.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '32rem', overflowY: 'auto' }}>
              {editingSubtitles.map((subtitle, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: '0.75rem',
                    backgroundColor: editingIndex === idx ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
                    borderColor: editingIndex === idx ? 'var(--accent)' : 'var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    {/* インデックス */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' }}>
                      <span className="badge" style={{ fontSize: '11px', marginBottom: '0.5rem' }}>#{subtitle.index}</span>
                      <button
                        onClick={() => deleteSubtitle(idx)}
                        className="btn"
                        style={{ padding: '0.25rem', fontSize: '10px', color: '#dc2626' }}
                        title="削除"
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {/* タイミング調整 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                        {/* 開始時間 */}
                        <div>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                            開始時間
                          </label>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <input
                              type="text"
                              value={formatTimeForInput(subtitle.startTime)}
                              onChange={(e) => handleTimeChange(idx, 'startTime', e.target.value)}
                              className="input"
                              style={{ fontSize: '11px', fontFamily: 'monospace', padding: '0.375rem 0.5rem' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button
                                onClick={() => adjustTime(idx, 'startTime', 0.1)}
                                className="btn"
                                style={{ padding: '2px 6px', fontSize: '10px', lineHeight: 1 }}
                                title="+100ms"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => adjustTime(idx, 'startTime', -0.1)}
                                className="btn"
                                style={{ padding: '2px 6px', fontSize: '10px', lineHeight: 1 }}
                                title="-100ms"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 期間表示 */}
                        <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {getDuration(subtitle)}
                        </div>

                        {/* 終了時間 */}
                        <div>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                            終了時間
                          </label>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <input
                              type="text"
                              value={formatTimeForInput(subtitle.endTime)}
                              onChange={(e) => handleTimeChange(idx, 'endTime', e.target.value)}
                              className="input"
                              style={{ fontSize: '11px', fontFamily: 'monospace', padding: '0.375rem 0.5rem' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button
                                onClick={() => adjustTime(idx, 'endTime', 0.1)}
                                className="btn"
                                style={{ padding: '2px 6px', fontSize: '10px', lineHeight: 1 }}
                                title="+100ms"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => adjustTime(idx, 'endTime', -0.1)}
                                className="btn"
                                style={{ padding: '2px 6px', fontSize: '10px', lineHeight: 1 }}
                                title="-100ms"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* テキスト編集 */}
                      <div>
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                          字幕テキスト
                        </label>
                        <textarea
                          value={subtitle.text}
                          onChange={(e) => handleTextChange(idx, e.target.value)}
                          className="textarea"
                          rows={2}
                          style={{ fontSize: '12px', padding: '0.5rem', resize: 'vertical' }}
                        />

                        {/* 文字数検証 */}
                        {(() => {
                          const maxCharsPerLine = localMaxCharsPerLine
                          const maxLines = localMaxLines
                          const lines = subtitle.lines
                          const hasLineLengthIssue = lines.some(line => line.length > maxCharsPerLine)
                          const hasLineCountIssue = lines.length > maxLines

                          return (
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {/* 基本情報 */}
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                                <span>総文字数: {subtitle.text.length}</span>
                                <span style={{ color: hasLineCountIssue ? '#dc2626' : 'var(--text-muted)', fontWeight: hasLineCountIssue ? 600 : 400 }}>
                                  行数: {subtitle.lines.length} / {maxLines}
                                  {hasLineCountIssue && ' ⚠️'}
                                </span>
                              </div>

                              {/* 各行の文字数 */}
                              <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {lines.map((line, lineIdx) => {
                                  const isOverLimit = line.length > maxCharsPerLine
                                  return (
                                    <div
                                      key={lineIdx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.25rem 0.5rem',
                                        backgroundColor: isOverLimit ? 'rgba(220, 38, 38, 0.1)' : 'rgba(250, 204, 21, 0.05)',
                                        borderRadius: '3px',
                                        border: `1px solid ${isOverLimit ? '#dc2626' : 'rgba(250, 204, 21, 0.2)'}`
                                      }}
                                    >
                                      <span style={{ fontWeight: 600, color: 'var(--text-muted)', minWidth: '40px' }}>
                                        L{lineIdx + 1}:
                                      </span>
                                      <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {line}
                                      </span>
                                      <span style={{
                                        fontWeight: 600,
                                        color: isOverLimit ? '#dc2626' : '#16a34a',
                                        minWidth: '60px',
                                        textAlign: 'right'
                                      }}>
                                        {line.length}/{maxCharsPerLine}
                                        {isOverLimit && ' ⚠️'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>

                              {/* 警告メッセージ */}
                              {(hasLineLengthIssue || hasLineCountIssue) && (
                                <div style={{
                                  marginTop: '0.25rem',
                                  padding: '0.5rem',
                                  backgroundColor: 'rgba(220, 38, 38, 0.1)',
                                  border: '1px solid #dc2626',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  color: '#dc2626',
                                  fontWeight: 600
                                }}>
                                  ⚠️ {hasLineLengthIssue && '1行の文字数が制限を超えています。'}
                                  {hasLineLengthIssue && hasLineCountIssue && ' '}
                                  {hasLineCountIssue && '行数が制限を超えています。'}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 固有名詞管理モーダル */}
      {showProperNounsModal && (
        <ProperNounsModalMinimal
          onClose={() => setShowProperNounsModal(false)}
          selectedProjectId={selectedProjectId}
        />
      )}
    </div>
  )
}
