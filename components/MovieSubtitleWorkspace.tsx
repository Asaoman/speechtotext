'use client'

import { useState, useRef, useCallback } from 'react'
import DialogueList, { DialogueEntry, CharacterInfo } from './DialogueList'
import CharacterPanel, { CharacterData, ProperNoun } from './CharacterPanel'
import { downloadFile, formatTimestampSRT, formatTimestampVTT } from '@/lib/utils'

interface MovieSubtitleWorkspaceProps {
  apiKeys: {
    gemini?: string
    elevenlabs?: string
  }
  projectId?: string
}

// SRTをパース
function parseSRT(content: string): DialogueEntry[] {
  const entries: DialogueEntry[] = []
  const blocks = content.trim().split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim())
    if (lines.length < 2) continue

    const indexMatch = lines[0].match(/^\d+$/)
    if (!indexMatch) continue
    const index = parseInt(lines[0])

    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    )
    if (!timeMatch) continue

    const startTime =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000

    const endTime =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000

    const textLines = lines.slice(2)
    let fullText = textLines.join('\n')

    // 話者タグを検出
    let characterName: string | undefined
    const speakerMatch = fullText.match(/^\[([^\]]+)\]\s*(.*)$/s) ||
                         fullText.match(/^\(([^)]+)\)\s*(.*)$/s)
    if (speakerMatch) {
      characterName = speakerMatch[1].trim()
      fullText = speakerMatch[2].trim()
    }

    entries.push({
      index,
      startTime,
      endTime,
      originalText: fullText,
      characterName,
      isTranslated: false
    })
  }

  return entries
}

// SRTを生成
function generateSRT(dialogues: DialogueEntry[], includeSpeakers: boolean = false): string {
  let content = ''
  for (const d of dialogues) {
    content += `${d.index}\n`
    content += `${formatTimestampSRT(d.startTime)} --> ${formatTimestampSRT(d.endTime)}\n`
    const text = d.translatedText || d.originalText
    if (includeSpeakers && d.characterName) {
      content += `[${d.characterName}] ${text}\n`
    } else {
      content += `${text}\n`
    }
    content += '\n'
  }
  return content
}

// VTTを生成
function generateVTT(dialogues: DialogueEntry[]): string {
  let content = 'WEBVTT\n\n'
  for (const d of dialogues) {
    content += `${formatTimestampVTT(d.startTime)} --> ${formatTimestampVTT(d.endTime)}\n`
    content += `${d.translatedText || d.originalText}\n`
    content += '\n'
  }
  return content
}

export default function MovieSubtitleWorkspace({ apiKeys, projectId }: MovieSubtitleWorkspaceProps) {
  // データ状態
  const [dialogues, setDialogues] = useState<DialogueEntry[]>([])
  const [characters, setCharacters] = useState<CharacterData[]>([])
  const [properNouns, setProperNouns] = useState<ProperNoun[]>([])
  
  // UI状態
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedDialogueIndex, setSelectedDialogueIndex] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  
  // ファイル参照
  const srtInputRef = useRef<HTMLInputElement>(null)
  const scriptInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // SRTインポート
  const handleSRTImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError('')

    try {
      const content = await file.text()
      const parsed = parseSRT(content)
      setDialogues(parsed)

      // キャラクター識別を実行
      if (parsed.length > 0 && apiKeys.gemini) {
        await identifyCharacters(parsed)
      }
    } catch (err: any) {
      setError(err.message || 'SRTの読み込みに失敗しました')
    } finally {
      setIsLoading(false)
      if (e.target) e.target.value = ''
    }
  }

  // 脚本インポート
  const handleScriptImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError('')

    try {
      let content: string
      if (file.name.endsWith('.pdf')) {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: formData
        })
        const data = await response.json()
        if (!data.success) throw new Error(data.error)
        content = data.text
      } else {
        content = await file.text()
      }

      // 脚本からキャラクター識別（既存のセリフがなくても実行）
      if (apiKeys.gemini) {
        await identifyCharactersFromScript(content)
      }
    } catch (err: any) {
      setError(err.message || '脚本の読み込みに失敗しました')
    } finally {
      setIsLoading(false)
      if (e.target) e.target.value = ''
    }
  }

  // 音声ファイルインポート（ElevenLabs書き起こし）
  const handleAudioImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!apiKeys.elevenlabs) {
      setError('ElevenLabs APIキーが必要です')
      return
    }

    setIsLoading(true)
    setError('')
    setProgress({ current: 0, total: 100 })

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('apiKey', apiKeys.elevenlabs)
      formData.append('enableDiarization', 'true')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error)

      // 書き起こし結果をセリフに変換
      const newDialogues: DialogueEntry[] = (data.result.segments || []).map((seg: any, i: number) => ({
        index: i + 1,
        startTime: seg.start,
        endTime: seg.end,
        originalText: seg.text,
        characterName: seg.speaker,
        isTranslated: false
      }))

      setDialogues(newDialogues)

      // キャラクター識別
      if (newDialogues.length > 0 && apiKeys.gemini) {
        await identifyCharacters(newDialogues)
      }
    } catch (err: any) {
      setError(err.message || '音声の書き起こしに失敗しました')
    } finally {
      setIsLoading(false)
      setProgress(null)
      if (e.target) e.target.value = ''
    }
  }

  // キャラクター識別（セリフから）
  const identifyCharacters = async (dialoguesToAnalyze: DialogueEntry[]) => {
    if (!apiKeys.gemini) return

    try {
      const response = await fetch('/api/identify-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialogues: dialoguesToAnalyze.map(d => ({
            index: d.index,
            text: d.originalText,
            speaker: d.characterName
          })),
          apiKey: apiKeys.gemini
        })
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error)

      // キャラクターを設定
      const chars: CharacterData[] = (data.characters || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        nameReading: c.nameReading,
        gender: c.gender,
        ageGroup: c.ageGroup,
        speechStyle: c.speechStyle,
        description: c.description,
        dialogueCount: c.dialogueCount
      }))
      setCharacters(chars)

      // セリフにキャラクターを紐付け
      const assignmentMap = new Map<number, { characterId: string; characterName: string; confidence?: number }>(
        (data.assignments || []).map((a: any) => [a.index, { characterId: a.characterId, characterName: a.characterName, confidence: a.confidence }])
      )
      
      setDialogues(prev => prev.map(d => {
        const assignment = assignmentMap.get(d.index)
        if (assignment) {
          return {
            ...d,
            characterId: assignment.characterId,
            characterName: assignment.characterName,
            confidence: assignment.confidence
          }
        }
        return d
      }))

      // 固有名詞を設定
      if (data.properNouns) {
        setProperNouns(data.properNouns.map((n: any, i: number) => ({
          id: `noun_${i + 1}`,
          name: n.name,
          type: n.type,
          reading: n.reading,
          translation: n.translation,
          isConfirmed: false
        })))
      }
    } catch (err: any) {
      console.error('Character identification error:', err)
      setError(err.message || 'キャラクター識別に失敗しました')
    }
  }

  // 脚本からキャラクター識別
  const identifyCharactersFromScript = async (scriptContent: string) => {
    if (!apiKeys.gemini) return

    try {
      const response = await fetch('/api/analyze-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scriptContent,
          apiKey: apiKeys.gemini
        })
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error)

      if (data.analysis?.characters) {
        const chars: CharacterData[] = data.analysis.characters.map((c: any, i: number) => ({
          id: `char_${String(i + 1).padStart(3, '0')}`,
          name: c.name,
          gender: c.gender,
          ageGroup: c.ageGroup,
          speechStyle: c.speechStyle,
          description: c.description,
          dialogueCount: 0
        }))
        setCharacters(chars)
      }
    } catch (err: any) {
      console.error('Script analysis error:', err)
      setError(err.message || '脚本分析に失敗しました')
    }
  }

  // セリフ編集
  const handleDialogueEdit = useCallback((index: number, field: 'originalText' | 'translatedText' | 'characterId', value: string) => {
    setDialogues(prev => prev.map(d => {
      if (d.index === index) {
        if (field === 'translatedText') {
          return { ...d, translatedText: value, isTranslated: !!value }
        }
        if (field === 'characterId') {
          const char = characters.find(c => c.id === value)
          return { ...d, characterId: value, characterName: char?.name }
        }
        return { ...d, [field]: value }
      }
      return d
    }))
  }, [characters])

  // キャラクター更新
  const handleCharacterUpdate = useCallback((character: CharacterData) => {
    setCharacters(prev => prev.map(c => c.id === character.id ? character : c))
  }, [])

  // 固有名詞更新
  const handleProperNounUpdate = useCallback((noun: ProperNoun) => {
    setProperNouns(prev => prev.map(n => n.id === noun.id ? noun : n))
  }, [])

  // 固有名詞確定
  const handleProperNounConfirm = useCallback((id: string) => {
    setProperNouns(prev => prev.map(n => n.id === id ? { ...n, isConfirmed: true } : n))
  }, [])

  // 固有名詞削除
  const handleProperNounDelete = useCallback((id: string) => {
    setProperNouns(prev => prev.filter(n => n.id !== id))
  }, [])

  // 一括翻訳
  const handleBatchTranslate = async () => {
    if (!apiKeys.gemini) {
      setError('Gemini APIキーが必要です')
      return
    }

    const untranslated = dialogues.filter(d => !d.isTranslated)
    if (untranslated.length === 0) {
      setError('翻訳するセリフがありません')
      return
    }

    setIsTranslating(true)
    setError('')
    setProgress({ current: 0, total: untranslated.length })

    try {
      // バッチサイズ
      const BATCH_SIZE = 30
      const batches: DialogueEntry[][] = []
      for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
        batches.push(untranslated.slice(i, i + BATCH_SIZE))
      }

      let processedTotal = 0

      for (const batch of batches) {
        setTranslatingIndex(batch[0].index)

        const response = await fetch('/api/translate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dialogues: batch.map(d => ({
              index: d.index,
              text: d.originalText,
              characterId: d.characterId
            })),
            characters: characters.map(c => ({
              id: c.id,
              name: c.name,
              gender: c.gender,
              ageGroup: c.ageGroup,
              speechStyle: c.speechStyle,
              firstPerson: c.firstPerson,
              sentenceEndings: c.sentenceEndings
            })),
            properNouns: properNouns.filter(n => n.isConfirmed),
            sourceLanguage: 'en',
            targetLanguage: 'ja',
            apiKey: apiKeys.gemini
          })
        })

        const data = await response.json()
        if (!data.success) throw new Error(data.error)

        // 翻訳結果を反映
        const translationMap = new Map<number, string>(
          (data.translations || []).map((t: any) => [t.index, t.translatedText || ''])
        )

        setDialogues(prev => prev.map(d => {
          const translated = translationMap.get(d.index)
          if (translated) {
            return { ...d, translatedText: translated, isTranslated: true }
          }
          return d
        }))

        processedTotal += batch.length
        setProgress({ current: processedTotal, total: untranslated.length })
      }
    } catch (err: any) {
      setError(err.message || '翻訳に失敗しました')
    } finally {
      setIsTranslating(false)
      setTranslatingIndex(null)
      setProgress(null)
    }
  }

  // 出力
  const handleExport = (format: 'srt' | 'vtt' | 'srt-speakers') => {
    if (dialogues.length === 0) return

    let content: string
    let filename: string
    let mimeType: string

    if (format === 'vtt') {
      content = generateVTT(dialogues)
      filename = 'subtitles.vtt'
      mimeType = 'text/vtt'
    } else if (format === 'srt-speakers') {
      content = generateSRT(dialogues, true)
      filename = 'subtitles_with_speakers.srt'
      mimeType = 'application/x-subrip'
    } else {
      content = generateSRT(dialogues, false)
      filename = 'subtitles.srt'
      mimeType = 'application/x-subrip'
    }

    downloadFile(content, filename, mimeType)
  }

  // 統計
  const stats = {
    total: dialogues.length,
    translated: dialogues.filter(d => d.isTranslated).length,
    characters: characters.length,
    properNouns: properNouns.filter(n => n.isConfirmed).length
  }

  // CharacterInfo に変換
  const characterInfos: CharacterInfo[] = characters.map(c => ({
    id: c.id,
    name: c.name,
    dialogueCount: c.dialogueCount,
    color: c.color
  }))

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 140px)',
      gap: '1rem'
    }}>
      {/* ヘッダー */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* 左: タイトル・インポート */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              🎬 映画字幕翻訳
            </h2>
            
            {/* インポートボタン */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt"
                onChange={handleSRTImport}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => srtInputRef.current?.click()}
                className="btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
                disabled={isLoading}
              >
                📂 SRT
              </button>

              <input
                ref={scriptInputRef}
                type="file"
                accept=".txt,.md,.pdf"
                onChange={handleScriptImport}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => scriptInputRef.current?.click()}
                className="btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
                disabled={isLoading}
              >
                📜 脚本
              </button>

              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.mp4,.webm"
                onChange={handleAudioImport}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => audioInputRef.current?.click()}
                className="btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
                disabled={isLoading || !apiKeys.elevenlabs}
                title={!apiKeys.elevenlabs ? 'ElevenLabs APIキーが必要です' : ''}
              >
                🎙️ 音声
              </button>
            </div>
          </div>

          {/* 中央: 統計 */}
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>💬 {stats.translated}/{stats.total} 翻訳</span>
            <span>🎭 {stats.characters} キャラ</span>
            <span>📚 {stats.properNouns} 固有名詞</span>
          </div>

          {/* 右: アクション */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleBatchTranslate}
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '12px' }}
              disabled={isTranslating || stats.total === 0 || stats.translated === stats.total || !apiKeys.gemini}
            >
              {isTranslating ? '🔄 翻訳中...' : '🚀 一括翻訳'}
            </button>
            
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleExport(e.target.value as any)
                  e.target.value = ''
                }
              }}
              className="btn-secondary"
              style={{ padding: '0.5rem', fontSize: '12px' }}
              disabled={stats.total === 0}
            >
              <option value="">📥 出力</option>
              <option value="srt">SRT</option>
              <option value="srt-speakers">SRT (話者タグ付き)</option>
              <option value="vtt">VTT</option>
            </select>
          </div>
        </div>

        {/* 進捗バー */}
        {(isLoading || isTranslating) && progress && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: 'var(--border)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(progress.current / progress.total) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--accent)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '0.25rem' }}>
              {isTranslating ? `翻訳中... ${progress.current}/${progress.total}` : `読み込み中...`}
            </p>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#ef4444'
          }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div style={{ 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '1rem',
        minHeight: 0
      }}>
        {/* 左: セリフ一覧 */}
        <DialogueList
          dialogues={dialogues}
          characters={characterInfos}
          selectedCharacterId={selectedCharacterId}
          onDialogueSelect={setSelectedDialogueIndex}
          onDialogueEdit={handleDialogueEdit}
          onCharacterFilter={setSelectedCharacterId}
          selectedDialogueIndex={selectedDialogueIndex}
          isTranslating={isTranslating}
          translatingIndex={translatingIndex}
        />

        {/* 右: キャラクター・固有名詞 */}
        <CharacterPanel
          characters={characters}
          properNouns={properNouns}
          selectedCharacterId={selectedCharacterId}
          onCharacterSelect={setSelectedCharacterId}
          onCharacterUpdate={handleCharacterUpdate}
          onProperNounUpdate={handleProperNounUpdate}
          onProperNounConfirm={handleProperNounConfirm}
          onProperNounDelete={handleProperNounDelete}
        />
      </div>
    </div>
  )
}

