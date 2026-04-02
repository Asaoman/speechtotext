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
import { TranscriptionResult as TranscriptionResultType, ProofreadingResult, ApiKeys, SubtitleSettings, AIPreferences, TranscriptionProofreadResult, DetectedNoun, DictionaryEntry, SpeechProject } from '@/lib/types'
import { storage, generateTimestamp } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'

const SPEECH_PROJECTS_KEY = 'speech_projects_v1'
const STANDALONE_NOUNS_KEY = 'speech_standalone_nouns'
const RECENT_TRANSCRIPTIONS_KEY = 'speech_recent_transcriptions'
const PROOFREAD_CACHE_KEY = 'speech_proofread_cache_v2'
// All nouns the API returns have confidence ≥ 0.65 (enforced in prompt).
// We auto-approve everything at 0.65+ so nothing falls through.
// Pending bucket catches anything below 0.65 (edge cases / future tuning).
const PENDING_NOUN_THRESHOLD = 0.50
const AUTO_APPROVE_THRESHOLD = 0.65
const MAX_RECENT = 50

function loadSpeechProjects(): SpeechProject[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(SPEECH_PROJECTS_KEY) || '[]') } catch { return [] }
}
function saveSpeechProjects(projects: SpeechProject[]) {
  try { localStorage.setItem(SPEECH_PROJECTS_KEY, JSON.stringify(projects)) } catch {}
}
function loadStandaloneNouns(): DetectedNoun[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STANDALONE_NOUNS_KEY) || '[]') } catch { return [] }
}
function updateSessionMeta(sessionId: string, patch: Record<string, any>) {
  try {
    const items = JSON.parse(localStorage.getItem(RECENT_TRANSCRIPTIONS_KEY) || '[]')
    const updated = items.map((item: any) => item.id === sessionId ? { ...item, ...patch } : item)
    localStorage.setItem(RECENT_TRANSCRIPTIONS_KEY, JSON.stringify(updated))
  } catch {}
}

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

  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProofreadResult, setTranscriptionProofreadResult] = useState<TranscriptionProofreadResult | null>(null)
  const [isAutoProofreading, setIsAutoProofreading] = useState(false)
  const [proofreadError, setProofreadError] = useState<string | null>(null)
  // ===== Project / noun architecture =====
  const [speechProjects, setSpeechProjects] = useState<SpeechProject[]>(loadSpeechProjects)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [standaloneNouns, setStandaloneNouns] = useState<DetectedNoun[]>(loadStandaloneNouns)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  const activeProject = useMemo(
    () => speechProjects.find((p) => p.id === activeProjectId) ?? null,
    [speechProjects, activeProjectId]
  )
  const activeNouns: DetectedNoun[] = useMemo(
    () => activeProject?.nouns ?? standaloneNouns,
    [activeProject, standaloneNouns]
  )
  const activeNounsRef = useRef<DetectedNoun[]>(activeNouns)
  useEffect(() => { activeNounsRef.current = activeNouns }, [activeNouns])
  const activeProjectIdRef = useRef<string | null>(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])
  const speechProjectsRef = useRef<SpeechProject[]>(speechProjects)
  useEffect(() => { speechProjectsRef.current = speechProjects }, [speechProjects])

  const updateActiveNouns = useCallback((updater: (prev: DetectedNoun[]) => DetectedNoun[]) => {
    const projId = activeProjectIdRef.current
    if (projId) {
      setSpeechProjects((prev) => {
        const updated = prev.map((p) =>
          p.id === projId ? { ...p, nouns: updater(p.nouns) } : p
        )
        saveSpeechProjects(updated)
        return updated
      })
    } else {
      setStandaloneNouns((prev) => {
        const updated = updater(prev)
        try { localStorage.setItem(STANDALONE_NOUNS_KEY, JSON.stringify(updated)) } catch {}
        return updated
      })
    }
  }, [])

  const [navigatedFromTranscription, setNavigatedFromTranscription] = useState(false)
  const [currentProjectId] = useState<string | null>(storage.getCurrentProjectId())
  const [movieProjectIdToLoad, setMovieProjectIdToLoad] = useState<string | null>(null)
  const [autoDetectedContext, setAutoDetectedContext] = useState('')
  const transcriptionContextRef = useRef('')
  const autoDetectedContextRef = useRef('')
  const currentSessionIdRef = useRef<string | null>(null)
  useEffect(() => { autoDetectedContextRef.current = autoDetectedContext }, [autoDetectedContext])
  useEffect(() => { currentSessionIdRef.current = currentSessionId }, [currentSessionId])

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

  // Load content of all context files attached to the active project
  const loadProjectContextFileContent = useCallback(async (): Promise<string> => {
    const proj = speechProjectsRef.current.find((p) => p.id === activeProjectIdRef.current)
    if (!proj?.contextFiles?.length) return ''
    const results = await Promise.allSettled(
      proj.contextFiles.map((f) =>
        fetch(`/api/read-file?path=${encodeURIComponent(f.path)}`).then((r) => r.json()).then((d) => d.content ?? '')
      )
    )
    return results
      .map((r, i) => r.status === 'fulfilled' ? `### ${proj.contextFiles![i].name}\n${r.value}` : '')
      .filter(Boolean)
      .join('\n\n---\n\n')
  }, [])

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
      const approvedNouns = activeNounsRef.current.filter((n: any) => n.approved !== false)
      // Merge project context + reference file content
      const fileContent = await loadProjectContextFileContent()
      const baseContext = transcriptionContextRef.current || autoDetectedContextRef.current || ''
      const fullContext = [baseContext, fileContent].filter(Boolean).join('\n\n---\n\n') || undefined

      const res = await fetch('/api/transcription-proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: 'ja',
          globalNouns: approvedNouns.map((n) => ({ term: n.term, reading: n.reading, category: n.category })),
          apiKey: apiKeys.gemini,
          model: aiPreferences.geminiModel || 'gemini-2.5-flash',
          context: fullContext,
        }),
      })
      const data: TranscriptionProofreadResult & { error?: string } = await res.json()
      if (data.success) {
        // Auto-detected context: update session + project
        if (data.detectedContext) {
          if (!transcriptionContextRef.current) {
            setAutoDetectedContext(data.detectedContext)
          }
          // Store context on session
          const sessId = currentSessionIdRef.current
          if (sessId) updateSessionMeta(sessId, { autoContext: data.detectedContext })
          // Auto-set project context if empty
          const projId = activeProjectIdRef.current
          if (projId) {
            setSpeechProjects((prev) => {
              const updated = prev.map((p) =>
                p.id === projId && !p.context
                  ? { ...p, context: data.detectedContext! }
                  : p
              )
              saveSpeechProjects(updated)
              return updated
            })
          }
        }
        // Auto-approve high-confidence NEW nouns into project/standalone dictionary
        if (data.detectedNouns) {
          const autoApprove = data.detectedNouns.filter(
            (n) => n.isNew && n.confidence >= AUTO_APPROVE_THRESHOLD
          )
          if (autoApprove.length > 0) {
            const projId = activeProjectIdRef.current
            if (projId) {
              setSpeechProjects((prev) => {
                const updated = prev.map((p) => {
                  if (p.id !== projId) return p
                  const newNouns = autoApprove.filter(
                    (n) => !p.nouns.some((e) => e.term.toLowerCase() === n.term.toLowerCase())
                  )
                  if (newNouns.length === 0) return p
                  const next = { ...p, nouns: [...p.nouns, ...newNouns.map((n) => ({ ...n, approved: true }))] }
                  saveSpeechProjects(prev.map((pp) => pp.id === projId ? next : pp))
                  return next
                })
                return updated
              })
            } else {
              setStandaloneNouns((prev) => {
                const newNouns = autoApprove.filter(
                  (n) => !prev.some((e) => e.term.toLowerCase() === n.term.toLowerCase())
                )
                if (newNouns.length === 0) return prev
                const updated = [...prev, ...newNouns.map((n) => ({ ...n, approved: true }))]
                try { localStorage.setItem(STANDALONE_NOUNS_KEY, JSON.stringify(updated)) } catch {}
                return updated
              })
            }
          }
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

  const handleTranscriptionComplete = (result: TranscriptionResultType, fileName: string, service: string, projectId?: string) => {
    // Update active project
    const newProjectId = projectId ?? null
    setActiveProjectId(newProjectId)
    // If project has context, use it; otherwise clear auto-detected
    if (newProjectId) {
      const proj = speechProjects.find((p) => p.id === newProjectId)
      if (proj?.context) {
        setAutoDetectedContext(proj.context)
      } else {
        setAutoDetectedContext('')
      }
    } else {
      setAutoDetectedContext('')
    }

    const sessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setCurrentSessionId(sessionId)
    const meta = { fileName, service, isNew: true, sessionId, projectId: newProjectId }
    setTranscriptionResult(result)
    setTranscriptionMeta(meta)
    setResultQueue((prev) => {
      const next = [{ result, meta }, ...prev].slice(0, 10)
      return next
    })
    setSelectedQueueIndex(0)

    // Auto-save to localStorage history
    try {
      const item = {
        id: sessionId,
        fileName,
        service,
        language: result.language,
        text: result.text,
        segments: result.segments,
        words: result.words,
        createdAt: new Date().toISOString(),
        projectId: newProjectId,
        autoContext: '',
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
    // Restore project context
    const projId = meta?.projectId ?? null
    setActiveProjectId(projId)
    setCurrentSessionId(meta?.sessionId ?? null)
    if (projId) {
      const proj = speechProjectsRef.current.find((p: SpeechProject) => p.id === projId)
      if (proj?.context) setAutoDetectedContext(proj.context)
    } else if (meta?.autoContext) {
      setAutoDetectedContext(meta.autoContext)
    }
  }, [])

  // 履歴から校正結果をロード（校正タブ廃止のため書き起こしタブに切り替え）
  const handleLoadProofreading = useCallback((_data: ProofreadingResult, _meta?: any) => {
    setActiveTab('transcription')
  }, [])

  // 履歴から字幕をロード
  const handleLoadSubtitles = useCallback((_data: any) => {
    setActiveTab('subtitle-generation')
  }, [])

  // 履歴から映画字幕プロジェクトをロード
  const handleLoadMovieProject = useCallback((projectId: string) => {
    setMovieProjectIdToLoad(projectId)
    setActiveTab('movie-subtitle')
  }, [])

  const handleStartSubtitleGeneration = () => {
    if (transcriptionResult) {
      setNavigatedFromTranscription(true)
      setActiveTab('subtitle-generation')
    }
  }

  const handleNounApproved = useCallback((noun: DetectedNoun) => {
    updateActiveNouns((prev) => {
      if (prev.some((n) => n.term.toLowerCase() === noun.term.toLowerCase())) return prev
      return [...prev, { ...noun, approved: true } as any]
    })
    // Also sync to DB dictionary
    try {
      const dicts = storage.getDictionaries()
      if (dicts.length > 0) {
        const dictId = dicts[0].id
        const entries = storage.getDictionaryEntries(dictId)
        if (!entries.some((e) => e.term.toLowerCase() === noun.term.toLowerCase())) {
          const newEntry: DictionaryEntry = {
            id: `noun_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            term: noun.term,
            reading: noun.reading || '',
            dictionaryId: dictId,
          }
          storage.setDictionaryEntries(dictId, [...entries, newEntry])
          setHistoryRefreshKey((k: number) => k + 1)
        }
      }
    } catch {}
  }, [updateActiveNouns])

  const handleNounRejected = useCallback((term: string) => {
    updateActiveNouns((prev) => prev.filter((n) => n.term.toLowerCase() !== term.toLowerCase()))
  }, [updateActiveNouns])

  const handleNounsMerged = useCallback((canonical: string, aliases: string[]) => {
    updateActiveNouns((prev) => {
      const mapped = prev.map((n) => aliases.includes(n.term) ? { ...n, term: canonical } : n)
      const seen = new Set<string>()
      return mapped.filter((n) => {
        if (seen.has(n.term.toLowerCase())) return false
        seen.add(n.term.toLowerCase())
        return true
      })
    })
  }, [updateActiveNouns])

  const handleNounUpdated = useCallback((oldTerm: string, newTerm: string, reading?: string) => {
    updateActiveNouns((prev) =>
      prev.map((n) => n.term.toLowerCase() === oldTerm.toLowerCase() ? { ...n, term: newTerm, reading } : n)
    )
  }, [updateActiveNouns])

  const pendingNouns = useMemo(() => {
    if (!transcriptionProofreadResult) return []
    // Pending = new nouns below auto-approve threshold (for manual review)
    return transcriptionProofreadResult.detectedNouns.filter(
      (n) => n.isNew && n.confidence >= PENDING_NOUN_THRESHOLD && n.confidence < AUTO_APPROVE_THRESHOLD
    )
  }, [transcriptionProofreadResult])

  // Highlight = project library words + newly detected nouns
  const highlightNouns = useMemo(() => {
    const approvedLib = activeNouns
      .filter((n: any) => n.approved !== false)
      .map((n) => ({ ...n, confidence: (n as any).confidence ?? 1.0, isNew: false as const }))
    const newDetected = transcriptionProofreadResult
      ? transcriptionProofreadResult.detectedNouns.filter((n) => n.isNew)
      : []
    const seen = new Set(newDetected.map((n) => n.term.toLowerCase()))
    const libOnly = approvedLib.filter((n) => !seen.has(n.term.toLowerCase()))
    return [...newDetected, ...libOnly]
  }, [transcriptionProofreadResult, activeNouns])

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

  const handleBulkSubtitleGenerate = useCallback(async (sessions: { id: string; fileName: string; text: string; segments?: any[]; words?: any[] }[]) => {
    const withWords = sessions.filter((s) => s.words && s.words.length > 0)
    const withSegs  = sessions.filter((s) => (!s.words || s.words.length === 0) && s.segments && s.segments.length > 0)

    // Items that have word-level data → call /api/subtitles/generate for best quality
    for (const session of withWords) {
      const base = session.fileName.replace(/\.[^.]+$/, '')
      try {
        const res = await fetch('/api/subtitles/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            words: session.words,
            settings: {
              language: 'ja',
              maxCharsPerLine: subtitleSettings.ja?.maxCharsPerLine ?? 20,
              maxLines: subtitleSettings.ja?.maxLines ?? 2,
              lineBreakService: 'none',
            },
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const srtLines = (data.entries ?? []).map((e: any, i: number) => {
            const fmt = (s: number) => {
              const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000)
              return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`
            }
            return `${i + 1}\n${fmt(e.startTime)} --> ${fmt(e.endTime)}\n${e.text}\n`
          }).join('\n')
          const blob = new Blob([srtLines], { type: 'text/plain;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `${base}.srt`
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      } catch (e) { console.error('[bulk subtitle]', session.fileName, e) }
      await new Promise((r) => setTimeout(r, 400))
    }

    // Items with only segments → generate SRT directly
    for (const session of withSegs) {
      const base = session.fileName.replace(/\.[^.]+$/, '')
      const fmt = (s: number) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000)
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`
      }
      const srt = (session.segments || []).map((seg: any, i: number) =>
        `${i + 1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${(seg.text || '').trim()}\n`
      ).join('\n')
      const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${base}.srt`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      await new Promise((r) => setTimeout(r, 300))
    }
  }, [subtitleSettings])

  // Extract proper nouns from context MD files and add to project dictionary
  const handleExtractNounsFromFiles = useCallback(async (project: SpeechProject) => {
    if (!apiKeys.gemini || !project.contextFiles?.length) return
    const fileContent = await (async () => {
      const results = await Promise.allSettled(
        project.contextFiles!.map((f) =>
          fetch(`/api/read-file?path=${encodeURIComponent(f.path)}`).then((r) => r.json()).then((d) => d.content ?? '')
        )
      )
      return results
        .map((r, i) => r.status === 'fulfilled' ? `### ${project.contextFiles![i].name}\n${(r as any).value}` : '')
        .filter(Boolean).join('\n\n')
    })()
    if (!fileContent.trim()) return

    try {
      const res = await fetch('/api/transcription-proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fileContent,
          language: 'ja',
          globalNouns: project.nouns.map((n) => ({ term: n.term, reading: n.reading, category: n.category })),
          apiKey: apiKeys.gemini,
          model: aiPreferences.geminiModel || 'gemini-2.5-flash',
          context: `これはプロジェクト「${project.name}」の参照ドキュメント。固有名詞を最大限抽出せよ。`,
        }),
      })
      const data = await res.json()
      if (data.success && data.detectedNouns?.length) {
        setSpeechProjects((prev) => {
          const updated = prev.map((p) => {
            if (p.id !== project.id) return p
            const newNouns: DetectedNoun[] = data.detectedNouns.filter(
              (n: DetectedNoun) => !p.nouns.some((e) => e.term.toLowerCase() === n.term.toLowerCase())
            ).map((n: DetectedNoun) => ({ ...n, approved: true }))
            if (newNouns.length === 0) return p
            return { ...p, nouns: [...p.nouns, ...newNouns] }
          })
          saveSpeechProjects(updated)
          return updated
        })
      }
    } catch (e) { console.error('[extract-nouns-from-files]', e) }
  }, [apiKeys.gemini, aiPreferences.geminiModel])

  const handleTabClick = (tab: 'transcription' | 'subtitle-generation' | 'movie-subtitle') => {
    setNavigatedFromTranscription(false)
    setActiveTab(tab)
  }

  const handleSubtitleGenerated = (srt: string, vtt: string) => {
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
        speechProjects={speechProjects}
        onSpeechProjectsChange={(projects) => { setSpeechProjects(projects); saveSpeechProjects(projects) }}
        activeProjectId={activeProjectId}
        onProjectSelect={(id) => setActiveProjectId(id)}
        onBulkSubtitleGenerate={handleBulkSubtitleGenerate}
        onExtractNounsFromFiles={handleExtractNounsFromFiles}
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
                speechProjects={speechProjects}
                defaultProjectId={activeProjectId}
              />

              {/* 分析コンテキスト（常時表示） */}
              {(activeProject || autoDetectedContext) && (
                <div className="card" style={{ padding: '0.6rem 0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, paddingTop: '1px', flexShrink: 0 }}>
                    {activeProject ? `📁 ${activeProject.name}` : '💬 セッション'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1, lineHeight: 1.5 }}>
                    {activeProject?.context || autoDetectedContext || '（コンテキスト生成中...）'}
                  </span>
                </div>
              )}

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
                    meta={transcriptionMeta}
                    onStartSubtitleGeneration={handleStartSubtitleGeneration}
                    onRequestProofread={handleRequestProofread}
                    proofreadResult={transcriptionProofreadResult}
                    isProofreading={isAutoProofreading}
                    proofreadError={proofreadError}
                    globalNouns={activeNouns}
                    onNounApproved={handleNounApproved}
                    onNounRejected={handleNounRejected}
                    onNounsMerged={handleNounsMerged}
                    highlightTerms={highlightNouns}
                    onNounClickedInText={handleNounApproved}
                    screeningModel={aiPreferences.geminiModel || 'gemini-2.5-flash'}
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
                proofreadResult={transcriptionProofreadResult}
                autoDetectedContext={activeProject?.context || autoDetectedContext || undefined}
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
        globalNouns={activeNouns}
        onRemoveGlobalNoun={handleNounRejected}
        pendingNouns={pendingNouns}
        onApprovePendingNoun={handleNounApproved}
        onRejectPendingNoun={handleNounRejected}
        onUpdateGlobalNoun={handleNounUpdated}
        activeProjectName={activeProject?.name ?? null}
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
