'use client'

import { useState } from 'react'
import { MovieSubtitleEntry, Character, MovieSettings, AIPreferences, ApiKeys } from '@/lib/types'
import { formatTimestampSRT } from '@/lib/utils'

interface TranslationEditorProps {
  subtitles: MovieSubtitleEntry[]
  characters: Character[]
  movieSettings: MovieSettings | null
  apiKeys: ApiKeys
  aiPreferences: AIPreferences
  onSubtitlesChange: (subtitles: MovieSubtitleEntry[]) => void
}

// チャンクサイズ（一度に翻訳するセグメント数）
const CHUNK_SIZE = 20

export default function TranslationEditor({
  subtitles,
  characters,
  movieSettings,
  apiKeys,
  aiPreferences,
  onSubtitlesChange
}: TranslationEditorProps) {
  const [isTranslating, setIsTranslating] = useState(false)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [filterCharacter, setFilterCharacter] = useState<string>('all')
  const [showOnlyUntranslated, setShowOnlyUntranslated] = useState(false)
  const [translationProgress, setTranslationProgress] = useState<{ current: number; total: number; status: string } | null>(null)
  const [isCancelled, setIsCancelled] = useState(false)

  // APIキーを取得
  const getApiKey = () => {
    if (aiPreferences.defaultService === 'openai') return apiKeys.openai
    if (aiPreferences.defaultService === 'claude') return apiKeys.claude
    return apiKeys.gemini
  }

  // モデルを取得（古いモデル名を新しいモデル名に変換）
  const getModel = () => {
    let model: string
    if (aiPreferences.defaultService === 'openai') {
      model = aiPreferences.openaiModel
    } else if (aiPreferences.defaultService === 'claude') {
      model = aiPreferences.claudeModel
    } else {
      model = aiPreferences.geminiModel
    }
    
    // Geminiモデル名のマッピング（古いモデル名を新しいモデル名に変換）
    if (aiPreferences.defaultService === 'gemini') {
      const modelMapping: Record<string, string> = {
        'gemini-1.5-flash': 'gemini-2.5-flash-lite',
        'gemini-1.5-flash-latest': 'gemini-2.5-flash-lite',
        'gemini-2.0-flash-exp': 'gemini-2.5-flash-lite',
        'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash-lite'
      }
      
      const mappedModel = modelMapping[model] || model
      if (mappedModel !== model) {
        console.log(`[TranslationEditor] モデル名を変換: ${model} → ${mappedModel}`)
      }
      return mappedModel
    }
    
    return model
  }

  // 単一字幕を翻訳
  const translateSingle = async (index: number) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('APIキーが設定されていません')
      return
    }

    const subtitle = subtitles[index]
    const character = subtitle.characterId 
      ? characters.find(c => c.id === subtitle.characterId)
      : undefined

    setIsTranslating(true)
    setTranslatingIndex(index)
    setError('')

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: subtitle.originalText || subtitle.text,
          sourceLanguage: movieSettings?.originalLanguage || 'en',
          targetLanguage: movieSettings?.targetLanguage || 'ja',
          character,
          movieSettings,
          service: aiPreferences.defaultService,
          model: getModel(),
          apiKey
        })
      })

      const data = await response.json()
      
      if (data.success) {
        const updated = [...subtitles]
        updated[index] = {
          ...updated[index],
          originalText: subtitle.originalText || subtitle.text,
          translatedText: data.translatedText,
          text: data.translatedText,
          lines: data.translatedText.split('\n'),
          isTranslated: true
        }
        onSubtitlesChange(updated)
      } else {
        setError(data.error || '翻訳に失敗しました')
      }
    } catch (err: any) {
      setError(err.message || '翻訳に失敗しました')
    } finally {
      setIsTranslating(false)
      setTranslatingIndex(null)
    }
  }

  // 選択した字幕をバッチ翻訳
  const translateSelected = async () => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('APIキーが設定されていません')
      return
    }

    if (selectedIndices.size === 0) {
      setError('翻訳する字幕を選択してください')
      return
    }

    setIsTranslating(true)
    setError('')

    try {
      const selectedSubtitles = subtitles.filter((_, i) => selectedIndices.has(i))
      
      const response = await fetch('/api/translate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: selectedSubtitles,
          sourceLanguage: movieSettings?.originalLanguage || 'en',
          targetLanguage: movieSettings?.targetLanguage || 'ja',
          characters,
          movieSettings,
          service: aiPreferences.defaultService,
          model: getModel(),
          apiKey
        })
      })

      const data = await response.json()
      
      if (data.success || data.translatedCount > 0) {
        // 翻訳結果をマージ
        const updated = [...subtitles]
        const translatedMap = new Map(
          data.subtitles.map((s: MovieSubtitleEntry) => [s.index, s])
        )
        
        selectedIndices.forEach(idx => {
          const translated = translatedMap.get(subtitles[idx].index)
          if (translated) {
            updated[idx] = {
              ...updated[idx],
              ...translated,
              lines: translated.text.split('\n')
            }
          }
        })
        
        onSubtitlesChange(updated)
        setSelectedIndices(new Set())
        
        if (data.failedCount > 0) {
          setError(`${data.translatedCount}件翻訳完了、${data.failedCount}件失敗`)
        }
      } else {
        setError(data.error || '翻訳に失敗しました')
      }
    } catch (err: any) {
      setError(err.message || '翻訳に失敗しました')
    } finally {
      setIsTranslating(false)
    }
  }

  // 翻訳をキャンセル
  const cancelTranslation = () => {
    setIsCancelled(true)
  }

  // 全て翻訳（チャンク分割対応・長編映画向け）
  const translateAll = async () => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('APIキーが設定されていません')
      return
    }

    // 未翻訳のものだけを対象にするか確認
    const untranslatedOnly = subtitles.filter(s => !s.isTranslated).length > 0 &&
      confirm(`未翻訳の${subtitles.filter(s => !s.isTranslated).length}件のみ翻訳しますか？\n（キャンセルで全て再翻訳）`)
    
    const targetSubtitles = untranslatedOnly 
      ? subtitles.filter(s => !s.isTranslated)
      : subtitles

    if (targetSubtitles.length === 0) {
      setError('翻訳対象がありません')
      return
    }

    setIsTranslating(true)
    setIsCancelled(false)
    setError('')
    
    const totalChunks = Math.ceil(targetSubtitles.length / CHUNK_SIZE)
    let translatedCount = 0
    let failedCount = 0
    const errors: string[] = []
    const allTranslated: MovieSubtitleEntry[] = [...subtitles]

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // キャンセルチェック
        if (isCancelled) {
          setError(`翻訳がキャンセルされました（${translatedCount}件翻訳済み）`)
          break
        }

        const start = chunkIndex * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, targetSubtitles.length)
        const chunk = targetSubtitles.slice(start, end)

        setTranslationProgress({
          current: start + 1,
          total: targetSubtitles.length,
          status: `チャンク ${chunkIndex + 1}/${totalChunks} を翻訳中... (${start + 1}-${end}/${targetSubtitles.length})`
        })

        try {
          const response = await fetch('/api/translate', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subtitles: chunk,
              sourceLanguage: movieSettings?.originalLanguage || 'en',
              targetLanguage: movieSettings?.targetLanguage || 'ja',
              characters,
              movieSettings,
              service: aiPreferences.defaultService,
              model: getModel(),
              apiKey
            })
          })

          const data = await response.json()
          
          if (data.success || data.translatedCount > 0) {
            // 翻訳結果をマージ
            data.subtitles.forEach((translated: MovieSubtitleEntry) => {
              const idx = allTranslated.findIndex(s => s.index === translated.index)
              if (idx !== -1) {
                allTranslated[idx] = {
                  ...translated,
                  lines: translated.text.split('\n')
                }
              }
            })
            
            translatedCount += data.translatedCount
            failedCount += data.failedCount || 0
            
            if (data.errors) {
              errors.push(...data.errors)
            }

            // 中間結果を反映
            onSubtitlesChange([...allTranslated])
          } else {
            failedCount += chunk.length
            errors.push(`チャンク ${chunkIndex + 1}: ${data.error || '翻訳失敗'}`)
          }
        } catch (err: any) {
          failedCount += chunk.length
          errors.push(`チャンク ${chunkIndex + 1}: ${err.message}`)
        }

        // チャンク間で少し待機（レート制限対策）
        if (chunkIndex < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // 最終結果メッセージ
      if (failedCount > 0) {
        setError(`✅ ${translatedCount}件翻訳完了、❌ ${failedCount}件失敗`)
      } else if (translatedCount > 0) {
        setError(`✅ ${translatedCount}件すべて翻訳完了！`)
      }
    } catch (err: any) {
      setError(err.message || '翻訳に失敗しました')
    } finally {
      setIsTranslating(false)
      setTranslationProgress(null)
      setIsCancelled(false)
    }
  }

  // 字幕のテキストを直接編集
  const handleTextEdit = (index: number, newText: string) => {
    const updated = [...subtitles]
    updated[index] = {
      ...updated[index],
      text: newText,
      translatedText: newText,
      lines: newText.split('\n')
    }
    onSubtitlesChange(updated)
  }

  // キャラクターを割り当て
  const assignCharacter = (index: number, characterId: string | null) => {
    const updated = [...subtitles]
    const character = characterId ? characters.find(c => c.id === characterId) : null
    updated[index] = {
      ...updated[index],
      characterId: characterId || undefined,
      characterName: character?.name
    }
    onSubtitlesChange(updated)
  }

  // 選択をトグル
  const toggleSelection = (index: number) => {
    const newSelected = new Set(selectedIndices)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedIndices(newSelected)
  }

  // 全選択/全解除
  const toggleSelectAll = () => {
    if (selectedIndices.size === filteredSubtitles.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(filteredSubtitles.map((_, i) => 
        subtitles.findIndex(s => s.index === filteredSubtitles[i].index)
      )))
    }
  }

  // フィルタリング
  const filteredSubtitles = subtitles.filter(subtitle => {
    if (filterCharacter !== 'all' && subtitle.characterId !== filterCharacter) {
      return false
    }
    if (showOnlyUntranslated && subtitle.isTranslated) {
      return false
    }
    return true
  })

  // 翻訳進捗
  const translatedCount = subtitles.filter(s => s.isTranslated).length
  const totalCount = subtitles.length

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          🌐 翻訳エディタ
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {translatedCount}/{totalCount} 翻訳済み
          </span>
          <div style={{ 
            width: '100px', 
            height: '6px', 
            backgroundColor: 'var(--border)', 
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${(translatedCount / totalCount) * 100}%`, 
              height: '100%', 
              backgroundColor: 'var(--accent)',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      </div>

      {error && (
        <p style={{ 
          fontSize: '11px', 
          color: error.includes('完了') ? '#16a34a' : '#dc2626', 
          padding: '0.5rem', 
          backgroundColor: error.includes('完了') ? '#f0fdf4' : '#fef2f2', 
          borderRadius: '4px', 
          marginBottom: '0.75rem' 
        }}>
          {error}
        </p>
      )}

      {/* コントロールパネル */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '0.5rem', 
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: '8px'
      }}>
        {/* フィルター */}
        <select
          value={filterCharacter}
          onChange={(e) => setFilterCharacter(e.target.value)}
          className="input"
          style={{ fontSize: '11px', padding: '0.375rem 0.5rem', minWidth: '120px' }}
        >
          <option value="all">全キャラクター</option>
          <option value="">未割当</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.25rem', 
          fontSize: '11px', 
          color: 'var(--text-muted)',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showOnlyUntranslated}
            onChange={(e) => setShowOnlyUntranslated(e.target.checked)}
          />
          未翻訳のみ
        </label>

        <div style={{ flex: 1 }} />

        {/* アクションボタン */}
        <button
          onClick={toggleSelectAll}
          className="btn"
          style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
        >
          {selectedIndices.size === filteredSubtitles.length ? '全解除' : '全選択'}
        </button>

        <button
          onClick={translateSelected}
          disabled={isTranslating || selectedIndices.size === 0}
          className="btn"
          style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
        >
          {isTranslating ? '翻訳中...' : `選択を翻訳 (${selectedIndices.size})`}
        </button>

        {isTranslating ? (
          <button
            onClick={cancelTranslation}
            className="btn"
            style={{ padding: '0.375rem 0.75rem', fontSize: '11px', color: '#dc2626' }}
          >
            ⏹ キャンセル
          </button>
        ) : (
          <button
            onClick={translateAll}
            disabled={isTranslating}
            className="btn-primary"
            style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
          >
            全て翻訳
          </button>
        )}
      </div>

      {/* 翻訳進捗バー（長編映画対応） */}
      {translationProgress && (
        <div style={{ 
          padding: '0.75rem',
          backgroundColor: 'rgba(250, 204, 21, 0.1)',
          borderRadius: '8px',
          marginBottom: '0.5rem',
          border: '1px solid var(--accent)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
              🎬 {translationProgress.status}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {Math.round((translationProgress.current / translationProgress.total) * 100)}%
            </span>
          </div>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: 'var(--border)', 
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${(translationProgress.current / translationProgress.total) * 100}%`, 
              height: '100%', 
              backgroundColor: 'var(--accent)',
              transition: 'width 0.3s',
              backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
              backgroundSize: '1rem 1rem',
              animation: 'progress-stripes 1s linear infinite'
            }} />
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
            💡 長編映画は自動的にチャンク分割して翻訳されます。キャンセルしても翻訳済みの結果は保持されます。
          </p>
        </div>
      )}

      {/* 字幕リスト */}
      {subtitles.length === 0 ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
          字幕データがありません。SRTファイルをインポートしてください。
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
          {filteredSubtitles.map((subtitle, filteredIndex) => {
            const actualIndex = subtitles.findIndex(s => s.index === subtitle.index)
            const character = subtitle.characterId 
              ? characters.find(c => c.id === subtitle.characterId)
              : null
            const isSelected = selectedIndices.has(actualIndex)
            const isCurrentlyTranslating = translatingIndex === actualIndex

            return (
              <div
                key={subtitle.index}
                className="card"
                style={{
                  padding: '0.75rem',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: isCurrentlyTranslating 
                    ? 'rgba(250, 204, 21, 0.1)' 
                    : isSelected 
                    ? 'rgba(250, 204, 21, 0.05)' 
                    : 'transparent'
                }}
              >
                {/* ヘッダー */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(actualIndex)}
                  />
                  <span className="badge" style={{ fontSize: '10px' }}>
                    #{subtitle.index}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {formatTimestampSRT(subtitle.startTime)} → {formatTimestampSRT(subtitle.endTime)}
                  </span>
                  
                  {/* キャラクター選択 */}
                  <select
                    value={subtitle.characterId || ''}
                    onChange={(e) => assignCharacter(actualIndex, e.target.value || null)}
                    className="input"
                    style={{ 
                      fontSize: '10px', 
                      padding: '0.25rem 0.5rem', 
                      minWidth: '100px',
                      marginLeft: 'auto'
                    }}
                  >
                    <option value="">キャラクター未設定</option>
                    {characters.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  {character && (
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: character.color || 'var(--accent)'
                      }}
                      title={character.name}
                    />
                  )}

                  {/* ステータスバッジ */}
                  {subtitle.isTranslated ? (
                    <span style={{ fontSize: '9px', color: '#16a34a', fontWeight: 600 }}>✓ 翻訳済</span>
                  ) : (
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>未翻訳</span>
                  )}
                </div>

                {/* 原文と翻訳文 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {/* 原文 */}
                  <div>
                    <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                      原文 ({movieSettings?.originalLanguage === 'ja' ? '日本語' : '英語'})
                    </label>
                    <div style={{ 
                      fontSize: '11px', 
                      padding: '0.5rem', 
                      backgroundColor: 'var(--bg-subtle)', 
                      borderRadius: '4px',
                      minHeight: '40px',
                      color: 'var(--text)'
                    }}>
                      {subtitle.originalText || subtitle.text}
                    </div>
                  </div>

                  {/* 翻訳文（編集可能） */}
                  <div>
                    <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                      翻訳 ({movieSettings?.targetLanguage === 'ja' ? '日本語' : '英語'})
                    </label>
                    <textarea
                      value={subtitle.translatedText || subtitle.text}
                      onChange={(e) => handleTextEdit(actualIndex, e.target.value)}
                      className="textarea"
                      rows={2}
                      style={{ 
                        fontSize: '11px', 
                        padding: '0.5rem',
                        minHeight: '40px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>

                {/* 個別翻訳ボタン */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => translateSingle(actualIndex)}
                    disabled={isTranslating}
                    className="btn"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '10px' }}
                  >
                    {isCurrentlyTranslating ? '翻訳中...' : '🔄 再翻訳'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

