'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import FileUpload from '@/components/FileUpload'
import SettingsModal from '@/components/SettingsModal'
import TranscriptionResult from '@/components/TranscriptionResult'
import SubtitleGenerator from '@/components/SubtitleGenerator'
import MovieSubtitleTab from '@/components/MovieSubtitleTab'
import HistorySidebar from '@/components/HistorySidebar'
import DictionaryPanel from '@/components/DictionaryPanel'
import SRTUpload from '@/components/SRTUpload'
import { TranscriptionResult as TranscriptionResultType, ProofreadingResult, ApiKeys, SubtitleSettings, AIPreferences, TranscriptionProofreadResult, DetectedNoun, DictionaryEntry } from '@/lib/types'
import { storage, generateTimestamp } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'

const GLOBAL_NOUN_STOCK_KEY = 'speech_global_proper_nouns'
const RECENT_TRANSCRIPTIONS_KEY = 'speech_recent_transcriptions'
const CONFIDENCE_THRESHOLD_KEY = 'speech_confidence_threshold'
const PROOFREAD_CACHE_KEY = 'speech_proofread_cache_v2'
const MAX_RECENT = 50

function hashText(text: string): string {
  let h = 5381
  const t = text.trim()
  for (let i = 0; i < t.length; i++) {
    h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

function getProofreadCache(text: string): TranscriptionProofreadResult | null {
  if (typeof window === 'undefined') return null
  try {
    const key = hashText(text)
    const cache = JSON.parse(localStorage.getItem(PROOFREAD_CACHE_KEY) || '{}')
    return cache[key] || null
  } catch { return null }
}

function setProofreadCache(text: string, result: TranscriptionProofreadResult) {
  if (typeof window === 'undefined') return
  try {
    const key = hashText(text)
    const cache = JSON.parse(localStorage.getItem(PROOFREAD_CACHE_KEY) || '{}')
    cache[key] = result
    const keys = Object.keys(cache)
    if (keys.length > 20) keys.slice(0, keys.length - 20).forEach((k) => delete cache[k])
    localStorage.setItem(PROOFREAD_CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

export default function Home() {
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'transcription' | 'subtitle-generation' | 'movie-subtitle'>('transcription')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKeys>(storage.getApiKeys())
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(storage.getSubtitleSettings())
  const [aiPreferences, setAIPreferences] = useState<AIPreferences>(storage.getAIPreferences())

  // 環境変数からAPIキーを自動読み取り
  useEffect(() => {
    const loadEnvKeys = async () => {
      try {
        const response = await fetch('/api/env-keys')
        const envKeys = await response.json()
        
        // 環境変数に設定があれば、localStorageより優先して使用
        const currentKeys = storage.getApiKeys()
        const mergedKeys: ApiKeys = {
          openai: envKeys.openai || currentKeys.openai,
          elevenlabs: envKeys.elevenlabs || currentKeys.elevenlabs,
          gemini: envKeys.gemini || currentKeys.gemini,
          claude: envKeys.claude || currentKeys.claude,
        }
        
        // 環境変数から新しいキーが読み込まれた場合は更新
        if (envKeys.openai || envKeys.elevenlabs || envKeys.gemini || envKeys.claude) {
          setApiKeys(mergedKeys)
          storage.setApiKeys(mergedKeys)
        }
      } catch (err) {
        console.error('Failed to load env keys:', err)
      }
    }
    
    loadEnvKeys()
  }, [])
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResultType | null>(null)
  const [transcriptionMeta, setTranscriptionMeta] = useState<any>(null)
  // Queue of recent results for switching between multiple files
  const [resultQueue, setResultQueue] = useState<{ result: TranscriptionResultType; meta: any }[]>([])
  const [selectedQueueIndex, setSelectedQueueIndex] = useState(0)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [dictionaryRefreshKey, setDictionaryRefreshKey] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProofreadResult, setTranscriptionProofreadResult] = useState<TranscriptionProofreadResult | null>(null)
  const [isAutoProofreading, setIsAutoProofreading] = useState(false)
  const [proofreadError, setProofreadError] = useState<string | null>(null)
  const [globalNounStock, setGlobalNounStock] = useState<DetectedNoun[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(GLOBAL_NOUN_STOCK_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const globalNounStockRef = useRef<DetectedNoun[]>(globalNounStock)
  useEffect(() => { globalNounStockRef.current = globalNounStock }, [globalNounStock])

  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.75
    return parseFloat(localStorage.getItem(CONFIDENCE_THRESHOLD_KEY) || '0.75')
  })
  const [subtitleContent, setSubtitleContent] = useState<{ srt: string; vtt: string } | null>(null)
  const [navigatedFromTranscription, setNavigatedFromTranscription] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(storage.getCurrentProjectId())
  const [movieProjectIdToLoad, setMovieProjectIdToLoad] = useState<string | null>(null)
  const [transcriptionContext, setTranscriptionContext] = useState('')
  const [showContextInput, setShowContextInput] = useState(false)
  const [autoDetectedContext, setAutoDetectedContext] = useState('')
  const transcriptionContextRef = useRef('')
  const autoDetectedContextRef = useRef('')
  useEffect(() => { transcriptionContextRef.current = transcriptionContext }, [transcriptionContext])
  useEffect(() => { autoDetectedContextRef.current = autoDetectedContext }, [autoDetectedContext])

  const handleSaveApiKeys = (keys: ApiKeys) => {
    setApiKeys(keys)
    storage.setApiKeys(keys)
  }

  const handleSaveSubtitleSettings = (settings: SubtitleSettings) => {
    setSubtitleSettings(settings)
    storage.setSubtitleSettings(settings)
  }

  const handleSaveAIPreferences = (preferences: AIPreferences) => {
    setAIPreferences(preferences)
    storage.setAIPreferences(preferences)
  }

  const triggerAutoProofread = useCallback(async (text: string, forceRefresh = false) => {
    if (!apiKeys.gemini || !text.trim()) return

    // Use cache unless forced refresh
    if (!forceRefresh) {
      const cached = getProofreadCache(text)
      if (cached) {
        setTranscriptionProofreadResult(cached)
        setProofreadError(null)
        return
      }
    }

    setIsAutoProofreading(true)
    setTranscriptionProofreadResult(null)
    setProofreadError(null)
    try {
      const approvedNouns = globalNounStockRef.current.filter((n: DetectedNoun & { approved?: boolean }) => (n as any).approved !== false)
      const res = await fetch('/api/transcription-proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: 'ja',
          globalNouns: approvedNouns.map((n) => ({ term: n.term, reading: n.reading, category: n.category })),
          apiKey: apiKeys.gemini,
          model: aiPreferences.geminiModel || 'gemini-3-flash-preview',
          // 手動コンテキストを優先、なければ前回の自動検出を使用
          context: transcriptionContextRef.current || autoDetectedContextRef.current || undefined,
        }),
      })
      const data: TranscriptionProofreadResult & { error?: string } = await res.json()
      if (data.success) {
        // 自動検出コンテキストを保存（次回呼び出しで精度向上に使う）
        if (data.detectedContext && !transcriptionContextRef.current) {
          setAutoDetectedContext(data.detectedContext)
        }
        setTranscriptionProofreadResult(data)
        setProofreadCache(text, data)
      } else {
        setProofreadError(data.error || 'スクリーニングに失敗しました')
      }
    } catch (e: any) {
      console.error('[auto-proofread]', e)
      setProofreadError(e?.message || 'ネットワークエラーが発生しました')
    } finally {
      setIsAutoProofreading(false)
    }
  }, [apiKeys.gemini, aiPreferences.geminiModel])

  const saveToDisk = async (subDir: string, filename: string, content: string) => {
    const outputDir = storage.getOutputDir()
    if (!outputDir) return
    try {
      await fetch('/api/save-to-disk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputDir, subDir, filename, content }),
      })
    } catch {
      // disk save is best-effort
    }
  }

  const handleTranscriptionComplete = (result: TranscriptionResultType, fileName: string, service: string) => {
    const meta = { fileName, service, isNew: true }
    setTranscriptionResult(result)
    setTranscriptionMeta(meta)
    setResultQueue((prev) => {
      const next = [{ result, meta }, ...prev].slice(0, 10)
      return next
    })
    setSelectedQueueIndex(0)

    // Auto-save to localStorage history (no project/DB required)
    try {
      const item = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fileName,
        service,
        language: result.language,
        text: result.text,
        segments: result.segments,
        words: result.words,
        createdAt: new Date().toISOString(),
      }
      const stored = localStorage.getItem(RECENT_TRANSCRIPTIONS_KEY)
      const existing = stored ? JSON.parse(stored) : []
      const updated = [item, ...existing].slice(0, MAX_RECENT)
      localStorage.setItem(RECENT_TRANSCRIPTIONS_KEY, JSON.stringify(updated))
      setHistoryRefreshKey((k) => k + 1)
    } catch {
      // localStorage unavailable – silently skip
    }

    // Auto-save to disk if outputDir configured
    const date = new Date().toISOString().slice(0, 10)
    const ts = generateTimestamp()
    const base = fileName.replace(/\.[^.]+$/, '')
    const subDir = `transcriptions/${date}`
    saveToDisk(subDir, `${base}_書き起こし_${ts}.txt`, result.text)
    saveToDisk(subDir, `${base}_書き起こし_${ts}.json`, JSON.stringify(result, null, 2))
  }

  // SRT/VTTからテキストを抽出して変換完了と同じフローに流す
  const handleSRTLoaded = (text: string, fileName: string) => {
    const result: TranscriptionResultType = { text, language: 'ja', segments: [], words: [] }
    handleTranscriptionComplete(result, fileName, 'SRT/VTT')
  }

  // 履歴から書き起こしをロード
  const handleLoadTranscription = useCallback((data: TranscriptionResultType, meta?: any) => {
    setTranscriptionResult(data)
    setTranscriptionMeta(meta)
    setResultQueue([{ result: data, meta }])
    setSelectedQueueIndex(0)
    setActiveTab('transcription')
    setProofreadError(null)
  }, [])

  // 履歴から校正結果をロード（校正タブ廃止のため書き起こしタブに切り替え）
  const handleLoadProofreading = useCallback((data: ProofreadingResult, meta?: any) => {
    setActiveTab('transcription')
  }, [])

  // 履歴から字幕をロード
  const handleLoadSubtitles = useCallback((data: any) => {
    // SubtitleGeneratorに渡すためのデータ形式に変換
    if (data.srtContent) {
      setSubtitleContent({ srt: data.srtContent, vtt: data.vttContent || '' })
    }
    setActiveTab('subtitle-generation')
  }, [])

  // 履歴から映画字幕プロジェクトをロード
  const handleLoadMovieProject = useCallback((projectId: string) => {
    setMovieProjectIdToLoad(projectId)
    setActiveTab('movie-subtitle')
  }, [])

  // 映画字幕プロジェクト読み込み完了時のコールバック
  const handleMovieProjectLoaded = useCallback(() => {
    setMovieProjectIdToLoad(null)
  }, [])

  const handleStartSubtitleGeneration = () => {
    if (transcriptionResult) {
      setNavigatedFromTranscription(true)
      setActiveTab('subtitle-generation')
    }
  }

  const handleNounApproved = useCallback((noun: DetectedNoun) => {
    setGlobalNounStock((prev) => {
      const exists = prev.some(
        (n) => n.term.toLowerCase() === noun.term.toLowerCase()
      )
      if (exists) return prev
      const updated = [...prev, { ...noun, approved: true } as any]
      try {
        localStorage.setItem(GLOBAL_NOUN_STOCK_KEY, JSON.stringify(updated))
      } catch {}
      return updated
    })

    // 辞書（先頭プロジェクト）にも自動登録
    try {
      const dicts = storage.getDictionaries()
      if (dicts.length > 0) {
        const dictId = dicts[0].id
        const entries = storage.getDictionaryEntries(dictId)
        const exists = entries.some((e) => e.term.toLowerCase() === noun.term.toLowerCase())
        if (!exists) {
          const newEntry: DictionaryEntry = {
            id: `noun_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            term: noun.term,
            reading: noun.reading || '',
            dictionaryId: dictId,
          }
          storage.setDictionaryEntries(dictId, [...entries, newEntry])
          setDictionaryRefreshKey((k) => k + 1)
        }
      }
    } catch {}
  }, [])

  const handleNounRejected = useCallback((term: string) => {
    // rejected nouns: mark as approved:false so they don't resurface
    setGlobalNounStock((prev) => {
      const exists = prev.some((n) => n.term.toLowerCase() === term.toLowerCase())
      if (exists) return prev
      // We just skip adding it — rejection means "don't stock"
      return prev
    })
  }, [])

  const handleNounsMerged = useCallback((canonical: string, aliases: string[]) => {
    setGlobalNounStock((prev) => {
      const updated = prev.map((n) => {
        if (aliases.includes(n.term)) {
          return { ...n, term: canonical }
        }
        return n
      })
      // deduplicate after merge
      const seen = new Set<string>()
      const deduped = updated.filter((n) => {
        if (seen.has(n.term.toLowerCase())) return false
        seen.add(n.term.toLowerCase())
        return true
      })
      try {
        localStorage.setItem(GLOBAL_NOUN_STOCK_KEY, JSON.stringify(deduped))
      } catch {}
      return deduped
    })
  }, [])

  const handleNounUpdated = useCallback((oldTerm: string, newTerm: string, reading?: string) => {
    setGlobalNounStock((prev) => {
      const updated = prev.map((n) =>
        n.term.toLowerCase() === oldTerm.toLowerCase()
          ? { ...n, term: newTerm, reading }
          : n
      )
      try { localStorage.setItem(GLOBAL_NOUN_STOCK_KEY, JSON.stringify(updated)) } catch {}
      return updated
    })
  }, [])

  const handleManualNounAdd = useCallback((term: string, reading?: string) => {
    handleNounApproved({
      term,
      reading,
      category: 'other',
      context: '',
      confidence: 1.0,
      isNew: true,
    })
  }, [handleNounApproved])

  const handleConfidenceThresholdChange = useCallback((v: number) => {
    setConfidenceThreshold(v)
    localStorage.setItem(CONFIDENCE_THRESHOLD_KEY, String(v))
  }, [])

  const pendingNouns = useMemo(() => {
    if (!transcriptionProofreadResult) return []
    return transcriptionProofreadResult.detectedNouns.filter(
      (n) => n.confidence < confidenceThreshold && n.isNew
    )
  }, [transcriptionProofreadResult, confidenceThreshold])

  // Highlight = library words + newly detected nouns (library words show even after approval)
  const highlightNouns = useMemo(() => {
    const approvedLib = globalNounStock
      .filter((n: any) => n.approved !== false)
      .map((n) => ({ ...n, confidence: (n as any).confidence ?? 1.0, isNew: false as const }))
    const newDetected = transcriptionProofreadResult
      ? transcriptionProofreadResult.detectedNouns.filter((n) => n.isNew)
      : []
    const seen = new Set(newDetected.map((n) => n.term.toLowerCase()))
    const libOnly = approvedLib.filter((n) => !seen.has(n.term.toLowerCase()))
    return [...newDetected, ...libOnly]
  }, [transcriptionProofreadResult, globalNounStock])

  // Stable ref so useEffect only re-fires when transcriptionResult.text changes
  const triggerAutoProofreadRef = useRef(triggerAutoProofread)
  useEffect(() => { triggerAutoProofreadRef.current = triggerAutoProofread }, [triggerAutoProofread])

  const lastProofreadTextRef = useRef<string | null>(null)
  useEffect(() => {
    const text = transcriptionResult?.text
    if (!text) return
    if (lastProofreadTextRef.current === text) return
    lastProofreadTextRef.current = text
    triggerAutoProofreadRef.current(text)
  }, [transcriptionResult?.text])  // deps: text only, function change does NOT retrigger

  const handleRequestProofread = useCallback(() => {
    if (transcriptionResult) {
      setTranscriptionProofreadResult(null)
      setProofreadError(null)
      triggerAutoProofread(transcriptionResult.text, true)
    }
  }, [transcriptionResult, triggerAutoProofread])

  const handleTabClick = (tab: 'transcription' | 'subtitle-generation' | 'movie-subtitle') => {
    setNavigatedFromTranscription(false)
    setActiveTab(tab)
  }

  const handleSubtitleGenerated = (srt: string, vtt: string) => {
    setSubtitleContent({ srt, vtt })

    // Auto-save subtitles to disk if outputDir configured
    const date = new Date().toISOString().slice(0, 10)
    const ts = generateTimestamp()
    const base = transcriptionMeta?.fileName?.replace(/\.[^.]+$/, '') || 'subtitle'
    const subDir = `subtitles/${date}`
    if (srt) saveToDisk(subDir, `${base}_sub_${ts}.srt`, srt)
    if (vtt) saveToDisk(subDir, `${base}_sub_${ts}.vtt`, vtt)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--bg)' }}>
      {/* 履歴サイドバー（常時表示） */}
      <HistorySidebar
        onLoadTranscription={handleLoadTranscription}
        onLoadProofreading={handleLoadProofreading}
        onLoadSubtitles={handleLoadSubtitles}
        onLoadMovieProject={handleLoadMovieProject}
        currentProjectId={currentProjectId}
        refreshKey={historyRefreshKey}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '960px', padding: '0 1.5rem' }}>
        <header style={{ padding: '1.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.5px' }}>
            <span style={{ color: 'var(--accent)' }}>SPEECH</span> TO TEXT
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={toggleTheme}
              className="btn"
              style={{ padding: '0.5rem', minWidth: 'auto', fontSize: '16px' }}
              title={theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button onClick={() => setShowSettings(true)} className="btn" style={{ padding: '0.5rem 1rem', fontSize: '12px' }}>
              Settings
            </button>
          </div>
        </header>

        {/* タブナビゲーション */}
        <div style={{ display: 'flex', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', marginBottom: '1.5rem', gap: '0.5rem' }}>
          <button
            onClick={() => handleTabClick('transcription')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '13px',
              fontWeight: 600,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'transcription' ? '3px solid var(--accent)' : '3px solid transparent',
              color: activeTab === 'transcription' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            📝 書き起こし
          </button>
          <button
            onClick={() => handleTabClick('subtitle-generation')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '13px',
              fontWeight: 600,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'subtitle-generation' ? '3px solid var(--accent)' : '3px solid transparent',
              color: activeTab === 'subtitle-generation' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            🎬 字幕生成
          </button>
          <button
            onClick={() => handleTabClick('movie-subtitle')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '13px',
              fontWeight: 600,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'movie-subtitle' ? '3px solid var(--accent)' : '3px solid transparent',
              color: activeTab === 'movie-subtitle' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            🎭 映画字幕
          </button>
        </div>

        <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
          {/* 書き起こしタブ */}
          {activeTab === 'transcription' && (
            <>
              <FileUpload
                apiKeys={apiKeys}
                onTranscriptionComplete={handleTranscriptionComplete}
                isTranscribing={isTranscribing}
                setIsTranscribing={setIsTranscribing}
              />

              {/* 分析コンテキスト入力 */}
              <div className="card" style={{ padding: '0.75rem 1rem' }}>
                <button
                  onClick={() => setShowContextInput((v) => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {showContextInput ? '▾' : '▸'} 分析コンテキスト（任意）
                  </span>
                  {transcriptionContext.trim() && (
                    <span style={{ fontSize: '9px', padding: '1px 0.3rem', background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: '3px', fontWeight: 700 }}>
                      設定済み
                    </span>
                  )}
                </button>
                {showContextInput && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <textarea
                      value={transcriptionContext}
                      onChange={(e) => setTranscriptionContext(e.target.value)}
                      placeholder="例：映画監督インタビュー。タランティーノ監督、スパイダーマンシリーズ、ZFILMS制作会社について話している"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '12px',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        lineHeight: 1.6,
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      このコンテキストはGeminiの固有名詞検出精度向上に使用されます。「再分析」で反映。
                    </div>
                  </div>
                )}
              </div>

              {/* 複数ファイル処理時のスイッチャー */}
              {resultQueue.length > 1 && (
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '0.25rem', fontWeight: 600 }}>
                    結果:
                  </span>
                  {resultQueue.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedQueueIndex(i)
                        setTranscriptionResult(item.result)
                        setTranscriptionMeta(item.meta)
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: i === selectedQueueIndex ? 'var(--accent)' : 'var(--border)',
                        background: i === selectedQueueIndex ? 'var(--accent)' : 'var(--bg-glass)',
                        color: i === selectedQueueIndex ? '#000' : 'var(--text)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item.meta?.fileName}
                    >
                      {item.meta?.fileName?.replace(/\.[^.]+$/, '') || `ファイル ${resultQueue.length - i}`}
                    </button>
                  ))}
                </div>
              )}

              {transcriptionResult && (
                <div className="animate-fade-in">
                  <TranscriptionResult
                    result={transcriptionResult}
                    onStartSubtitleGeneration={handleStartSubtitleGeneration}
                    onRequestProofread={handleRequestProofread}
                    proofreadResult={transcriptionProofreadResult}
                    isProofreading={isAutoProofreading}
                    proofreadError={proofreadError}
                    globalNouns={globalNounStock}
                    onNounApproved={handleNounApproved}
                    onNounRejected={handleNounRejected}
                    onNounsMerged={handleNounsMerged}
                    highlightTerms={highlightNouns}
                    onNounClickedInText={handleNounApproved}
                    screeningModel={aiPreferences.geminiModel || 'gemini-3-flash-preview'}
                    autoDetectedContext={autoDetectedContext}
                  />
                </div>
              )}
            </>
          )}

          {/* 字幕生成タブ */}
          {activeTab === 'subtitle-generation' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <SRTUpload onTextExtracted={handleSRTLoaded} />
              <SubtitleGenerator
                transcriptionResult={transcriptionResult}
                subtitleSettings={subtitleSettings}
                apiKeys={apiKeys}
                aiPreferences={aiPreferences}
                onSubtitleGenerated={handleSubtitleGenerated}
                navigatedFromTranscription={navigatedFromTranscription}
              />
            </div>
          )}

          {/* 映画字幕タブ */}
          {activeTab === 'movie-subtitle' && (
            <div className="animate-fade-in">
              <MovieSubtitleTab
                apiKeys={apiKeys}
                aiPreferences={aiPreferences}
                loadProjectId={movieProjectIdToLoad}
                onProjectLoaded={() => setMovieProjectIdToLoad(null)}
              />
            </div>
          )}
        </main>
      </div>
      </div>

      {/* 右: 辞書パネル */}
      <DictionaryPanel
        globalNouns={globalNounStock}
        onRemoveGlobalNoun={handleNounRejected}
        pendingNouns={pendingNouns}
        confidenceThreshold={confidenceThreshold}
        onConfidenceThresholdChange={handleConfidenceThresholdChange}
        onApprovePendingNoun={handleNounApproved}
        onRejectPendingNoun={handleNounRejected}
        onManualAddNoun={handleManualNounAdd}
        onUpdateGlobalNoun={handleNounUpdated}
      />

      {showSettings && (
        <SettingsModal
          apiKeys={apiKeys}
          subtitleSettings={subtitleSettings}
          aiPreferences={aiPreferences}
          onSaveApiKeys={handleSaveApiKeys}
          onSaveSubtitleSettings={handleSaveSubtitleSettings}
          onSaveAIPreferences={handleSaveAIPreferences}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
