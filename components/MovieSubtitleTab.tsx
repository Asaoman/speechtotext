'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MovieSubtitleEntry,
  Character,
  MovieSettings as MovieSettingsType,
  AIPreferences,
  ApiKeys,
  SubtitleTimingValidation,
  LanguageTimingConfig,
  ExtractedProperNoun,
  SubtitlePlatform,
  LineBreakPatternType,
  SegmentSplitPatternType,
  SubtitleProofreadIssue
} from '@/lib/types'
import { downloadFile, formatTimestampSRT, formatTimestampVTT } from '@/lib/utils'
import { 
  SUBTITLE_PRESETS, 
  LINE_BREAK_PATTERNS, 
  SEGMENT_SPLIT_PATTERNS,
  getPresetsForLanguage,
  getLineBreakPatternsForLanguage
} from '@/lib/subtitlePresets'
import CharacterManager from './CharacterManager'
import MovieSettings from './MovieSettings'
import TranslationEditor from './TranslationEditor'
import SpeakerMapping from './SpeakerMapping'
import ProperNounExtractor from './ProperNounExtractor'
import { useProject } from '@/hooks/useProject'

interface MovieSubtitleTabProps {
  apiKeys: ApiKeys
  aiPreferences: AIPreferences
  loadProjectId?: string | null
  onProjectLoaded?: () => void
}

// SRTファイルをパース（話者タグ対応）
function parseSRTWithSpeakers(content: string): MovieSubtitleEntry[] {
  const entries: MovieSubtitleEntry[] = []
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
      text: fullText,
      lines: fullText.split('\n'),
      characterName,
      originalText: fullText,
      isTranslated: false
    })
  }

  return entries
}

// SRTを生成
function generateSRTWithSpeakers(
  subtitles: MovieSubtitleEntry[], 
  includeSpeakerTags: boolean = false
): string {
  let content = ''

  for (const subtitle of subtitles) {
    content += `${subtitle.index}\n`
    content += `${formatTimestampSRT(subtitle.startTime)} --> ${formatTimestampSRT(subtitle.endTime)}\n`
    
    const text = subtitle.translatedText || subtitle.text
    if (includeSpeakerTags && subtitle.characterName) {
      content += `[${subtitle.characterName}] ${text}\n`
    } else {
      content += `${text}\n`
    }
    content += '\n'
  }

  return content
}

// VTTを生成
function generateVTT(subtitles: MovieSubtitleEntry[]): string {
  let content = 'WEBVTT\n\n'

  for (const subtitle of subtitles) {
    content += `${formatTimestampVTT(subtitle.startTime)} --> ${formatTimestampVTT(subtitle.endTime)}\n`
    content += `${subtitle.translatedText || subtitle.text}\n`
    content += '\n'
  }

  return content
}

export default function MovieSubtitleTab({ apiKeys, aiPreferences, loadProjectId, onProjectLoaded }: MovieSubtitleTabProps) {
  const [subtitles, setSubtitles] = useState<MovieSubtitleEntry[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [movieSettings, setMovieSettings] = useState<MovieSettingsType | null>(null)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'settings' | 'format' | 'workspace'>('settings')
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | null>(null)
  const [includeSpeakerTags, setIncludeSpeakerTags] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [currentMovieProjectId, setCurrentMovieProjectId] = useState<string | null>(null)
  
  // プリセット・パターン設定
  const [selectedPreset, setSelectedPreset] = useState<SubtitlePlatform>('netflix_ja')
  const [selectedLineBreakPattern, setSelectedLineBreakPattern] = useState<LineBreakPatternType>('bunsetsu')
  const [selectedSegmentPattern, setSelectedSegmentPattern] = useState<SegmentSplitPatternType>('sentence_end')

  // 話者分離設定
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, string>>({})
  const [enableDiarization, setEnableDiarization] = useState(true)
  const [numSpeakers, setNumSpeakers] = useState<number | undefined>(undefined)

  // タイミング検証
  const [timingValidation, setTimingValidation] = useState<SubtitleTimingValidation | null>(null)

  // 字幕校正
  const [proofreadIssues, setProofreadIssues] = useState<SubtitleProofreadIssue[]>([])
  const [isProofreading, setIsProofreading] = useState(false)

  // 固有名詞
  const [properNouns, setProperNouns] = useState<ExtractedProperNoun[]>([])

  // 脚本テキスト
  const [scriptText, setScriptText] = useState<string>('')
  
  // 処理状態
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [processingProgress, setProcessingProgress] = useState(0)
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false)
  const [analysisStep, setAnalysisStep] = useState('')
  const [analysisProgress, setAnalysisProgress] = useState(0)

  // プロジェクト管理
  const { 
    projects, 
    selectedProjectId, 
    handleProjectSelect,
    handleCreateProject,
    newProjectName,
    setNewProjectName,
    showNewProjectInput,
    setShowNewProjectInput,
    loadProjects 
  } = useProject()

  // localStorageキーのプレフィックス
  const STORAGE_KEY_PREFIX = 'movie_subtitle_'
  const getStorageKey = (key: string) => `${STORAGE_KEY_PREFIX}${selectedProjectId || 'default'}_${key}`

  // MovieProjectを作成または取得
  const ensureMovieProject = useCallback(async (): Promise<string | null> => {
    if (!selectedProjectId) return null

    try {
      // 既存のMovieProjectを検索
      const existingRes = await fetch(`/api/movie-projects?projectId=${selectedProjectId}&limit=1`)
      if (existingRes.ok) {
        const existingData = await existingRes.json()
        if (existingData.movieProjects && existingData.movieProjects.length > 0) {
          return existingData.movieProjects[0].id
        }
      }

      // 新規作成
      const title = movieSettings?.title || projects.find(p => p.id === selectedProjectId)?.name || '無題の映画字幕プロジェクト'
      const createRes = await fetch('/api/movie-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          title,
          originalLanguage: movieSettings?.originalLanguage || 'en',
          targetLanguage: movieSettings?.targetLanguage || 'ja',
          genres: movieSettings?.genres ? JSON.stringify(movieSettings.genres) : null,
          eraSetting: movieSettings?.eraSetting || null,
          targetAudience: movieSettings?.targetAudience || null,
          translationStyle: movieSettings?.translationStyle || null,
          toneDescription: movieSettings?.toneDescription || null,
          specialInstructions: movieSettings?.specialInstructions || null,
          glossary: movieSettings?.glossary ? JSON.stringify(movieSettings.glossary) : null,
          preset: selectedPreset || null,
          settings: movieSettings ? JSON.stringify(movieSettings) : null,
        })
      })

      if (createRes.ok) {
        const newProject = await createRes.json()
        return newProject.id
      }
    } catch (err) {
      console.error('Failed to ensure movie project:', err)
    }
    return null
  }, [selectedProjectId, movieSettings, projects, selectedPreset])

  // データベースへの自動保存（debounce付き）
  const saveToDatabase = useCallback(async () => {
    if (!selectedProjectId) return

    const movieProjectId = await ensureMovieProject()
    if (!movieProjectId) return

    setSaveStatus('saving')

    try {
      // MovieProjectを更新
      if (movieSettings) {
        await fetch('/api/movie-projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: movieProjectId,
            title: movieSettings.title || projects.find(p => p.id === selectedProjectId)?.name || '無題',
            originalLanguage: movieSettings.originalLanguage || 'en',
            targetLanguage: movieSettings.targetLanguage || 'ja',
            genres: movieSettings.genres ? JSON.stringify(movieSettings.genres) : null,
            eraSetting: movieSettings.eraSetting || null,
            targetAudience: movieSettings.targetAudience || null,
            translationStyle: movieSettings.translationStyle || null,
            toneDescription: movieSettings.toneDescription || null,
            specialInstructions: movieSettings.specialInstructions || null,
            glossary: movieSettings.glossary ? JSON.stringify(movieSettings.glossary) : null,
            preset: selectedPreset || null,
            settings: JSON.stringify(movieSettings),
          })
        })
      }

      // 字幕を保存（全置換）
      if (subtitles.length > 0) {
        await fetch('/api/movie-projects/subtitles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movieProjectId,
            replaceAll: true,
            subtitles: subtitles.map(sub => ({
              index: sub.index,
              startTime: sub.startTime,
              endTime: sub.endTime,
              originalText: sub.originalText || sub.text,
              translatedText: sub.translatedText,
              characterId: sub.characterId || null,
              speakerId: sub.speakerId || sub.characterName || null,
              isTranslated: sub.isTranslated || false,
              needsReview: sub.needsReview || false,
              notes: sub.notes || null,
            }))
          })
        })
      }

      // キャラクターを保存
      if (characters.length > 0) {
        // 既存のキャラクターを取得
        const charsRes = await fetch(`/api/movie-projects/characters?movieProjectId=${movieProjectId}`)
        const existingChars = charsRes.ok ? await charsRes.json() : []
        const existingCharIds = new Set(existingChars.map((c: any) => c.id))

        // 新規作成または更新
        for (const char of characters) {
          const charData = {
            movieProjectId,
            name: char.name,
            nameReading: char.nameReading || null,
            gender: char.gender || 'unknown',
            ageGroup: char.ageGroup || 'adult',
            speechStyle: char.speechStyle || 'casual',
            firstPerson: char.firstPerson || '私',
            secondPerson: char.secondPerson || 'あなた',
            sentenceEndings: char.sentenceEndings ? JSON.stringify(char.sentenceEndings) : null,
            characterTraits: char.characterTraits || null,
            sampleDialogues: char.sampleDialogues ? JSON.stringify(char.sampleDialogues) : null,
            speakerId: char.speakerId || null,
            color: char.color || null,
          }

          if (existingCharIds.has(char.id)) {
            await fetch('/api/movie-projects/characters', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: char.id, ...charData })
            })
          } else {
            await fetch('/api/movie-projects/characters', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(charData)
            })
          }
        }
      }

      setCurrentMovieProjectId(movieProjectId)
      setLastSavedTime(new Date())
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to save to database:', err)
      setSaveStatus('idle')
    }
  }, [selectedProjectId, subtitles, characters, movieSettings, selectedPreset, projects, ensureMovieProject])

  // データベースからの読み込み
  useEffect(() => {
    if (loadProjectId) {
      const loadFromDatabase = async () => {
        try {
          const res = await fetch(`/api/movie-projects?id=${loadProjectId}&includeAll=true`)
          if (res.ok) {
            const movieProject = await res.json()
            
            // プロジェクトを選択
            if (movieProject.projectId) {
              handleProjectSelect(movieProject.projectId)
            }
            
            // 設定を復元
            if (movieProject.settings) {
              try {
                const settings = JSON.parse(movieProject.settings)
                setMovieSettings(settings)
              } catch (e) {
                // settingsがJSONでない場合
              }
            }
            
            // 字幕を復元
            if (movieProject.subtitles && movieProject.subtitles.length > 0) {
              setSubtitles(movieProject.subtitles.map((sub: any) => ({
                index: sub.index,
                startTime: sub.startTime,
                endTime: sub.endTime,
                text: sub.originalText || '',
                originalText: sub.originalText || '',
                translatedText: sub.translatedText || '',
                characterId: sub.characterId || null,
                characterName: sub.character?.name || null,
                speakerId: sub.speakerId || null,
                isTranslated: sub.isTranslated || false,
                needsReview: sub.needsReview || false,
                notes: sub.notes || null,
                lines: (sub.translatedText || sub.originalText || '').split('\n'),
              })))
            }
            
            // キャラクターを復元
            if (movieProject.characters && movieProject.characters.length > 0) {
              setCharacters(movieProject.characters.map((char: any) => ({
                id: char.id,
                projectId: movieProject.projectId,
                name: char.name,
                nameReading: char.nameReading || '',
                gender: char.gender || 'unknown',
                ageGroup: char.ageGroup || 'adult',
                speechStyle: char.speechStyle || 'casual',
                firstPerson: char.firstPerson || '私',
                secondPerson: char.secondPerson || 'あなた',
                sentenceEndings: char.sentenceEndings ? JSON.parse(char.sentenceEndings) : [],
                characterTraits: char.characterTraits || '',
                description: char.characterTraits || '',
                sampleDialogues: char.sampleDialogues ? JSON.parse(char.sampleDialogues) : [],
                speakerId: char.speakerId || null,
                color: char.color || null,
                created_at: char.createdAt,
                updated_at: char.updatedAt,
              })))
            }
            
            setCurrentMovieProjectId(movieProject.id)
            onProjectLoaded?.()
          }
        } catch (err) {
          console.error('Failed to load movie project from database:', err)
        }
      }
      loadFromDatabase()
    }
  }, [loadProjectId, handleProjectSelect, onProjectLoaded])

  // localStorageからのデータ復元（データベースにない場合のみ）
  useEffect(() => {
    if (typeof window === 'undefined' || loadProjectId) return
    
    try {
      const savedSubtitles = localStorage.getItem(getStorageKey('subtitles'))
      const savedCharacters = localStorage.getItem(getStorageKey('characters'))
      const savedScriptText = localStorage.getItem(getStorageKey('scriptText'))
      const savedSettings = localStorage.getItem(getStorageKey('movieSettings'))
      const savedProperNouns = localStorage.getItem(getStorageKey('properNouns'))
      
      if (savedSubtitles) {
        const parsed = JSON.parse(savedSubtitles)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSubtitles(parsed)
        }
      }
      if (savedCharacters) {
        const parsed = JSON.parse(savedCharacters)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCharacters(parsed)
        }
      }
      if (savedScriptText) {
        setScriptText(savedScriptText)
      }
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings)
        if (parsed) {
          setMovieSettings(parsed)
        }
      }
      if (savedProperNouns) {
        const parsed = JSON.parse(savedProperNouns)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProperNouns(parsed)
        }
      }
    } catch (err) {
      console.error('Failed to restore data from localStorage:', err)
    }
  }, [selectedProjectId, loadProjectId])

  // プロジェクト選択時にMovieProjectを初期化
  useEffect(() => {
    if (selectedProjectId) {
      ensureMovieProject().then(id => {
        if (id) setCurrentMovieProjectId(id)
      })
    }
  }, [selectedProjectId, ensureMovieProject])

  // データベースへの自動保存（debounce付き）
  useEffect(() => {
    if (!selectedProjectId || (!subtitles.length && !characters.length && !movieSettings)) return

    const timeoutId = setTimeout(() => {
      saveToDatabase()
    }, 2000) // 2秒後に保存

    return () => clearTimeout(timeoutId)
  }, [subtitles, characters, movieSettings, selectedProjectId, saveToDatabase])

  // localStorageへのデータ自動保存
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (subtitles.length > 0) {
      localStorage.setItem(getStorageKey('subtitles'), JSON.stringify(subtitles))
    }
  }, [subtitles, selectedProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (characters.length > 0) {
      localStorage.setItem(getStorageKey('characters'), JSON.stringify(characters))
    }
  }, [characters, selectedProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (scriptText) {
      localStorage.setItem(getStorageKey('scriptText'), scriptText)
    }
  }, [scriptText, selectedProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (movieSettings) {
      localStorage.setItem(getStorageKey('movieSettings'), JSON.stringify(movieSettings))
    }
  }, [movieSettings, selectedProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (properNouns.length > 0) {
      localStorage.setItem(getStorageKey('properNouns'), JSON.stringify(properNouns))
    }
  }, [properNouns, selectedProjectId])

  // 現在のプリセット
  const currentPreset = SUBTITLE_PRESETS[selectedPreset]
  const currentLineBreakPattern = LINE_BREAK_PATTERNS[selectedLineBreakPattern]

  // 言語に応じたプリセットリスト
  const availablePresets = getPresetsForLanguage(movieSettings?.targetLanguage || 'ja')
  const availableLineBreakPatterns = getLineBreakPatternsForLanguage(movieSettings?.targetLanguage || 'ja')

  // SRTインポート
  const handleSRTImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const parsed = parseSRTWithSpeakers(content)
      setSubtitles(parsed)
      setError('')
      
      // キャラクター自動識別
      if (parsed.length > 0 && apiKeys.gemini) {
        await identifyCharacters(parsed)
      }
    } catch (err: any) {
      setError(err.message || 'SRTの読み込みに失敗しました')
    }
    if (e.target) e.target.value = ''
  }

  // 脚本インポート
  const handleScriptImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

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
      setScriptText(content)
      setError('')
    } catch (err: any) {
      setError(err.message || '脚本の読み込みに失敗しました')
    }
    if (e.target) e.target.value = ''
  }

  // 音声インポート
  const handleAudioImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!apiKeys.elevenlabs) {
      setError('ElevenLabs APIキーが必要です')
      return
    }

    setIsProcessing(true)
    setProcessingStep('音声ファイルをアップロード中...')
    setProcessingProgress(10)
    setError('')

    try {
      const formData = new FormData()
      formData.append('audio', file)
      formData.append('service', 'elevenlabs')
      formData.append('apiKey', apiKeys.elevenlabs)
      formData.append('diarization', String(enableDiarization))
      if (numSpeakers) formData.append('numSpeakers', String(numSpeakers))

      setProcessingStep('ElevenLabsで書き起こし中...')
      setProcessingProgress(30)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })

      setProcessingStep('レスポンスを処理中...')
      setProcessingProgress(70)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }

      setProcessingStep('字幕データを生成中...')
      setProcessingProgress(85)

      const newSubtitles: MovieSubtitleEntry[] = (data.segments || []).map((seg: any, i: number) => ({
        index: i + 1,
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text,
        lines: seg.text.split('\n'),
        characterName: seg.speaker,
        originalText: seg.text,
        isTranslated: false
      }))

      setSubtitles(newSubtitles)

      if (newSubtitles.length > 0 && apiKeys.gemini) {
        setProcessingStep('キャラクターを識別中...')
        setProcessingProgress(90)
        await identifyCharacters(newSubtitles)
        
        // 自動マッピング処理（脚本が存在する場合）
        if (scriptText && characters.length > 0) {
          setProcessingStep('話者を自動マッピング中...')
          setProcessingProgress(95)
          await autoMapSpeakers(newSubtitles, data.segments || [])
        }
      }
      
      setProcessingStep('完了')
      setProcessingProgress(100)
    } catch (err: any) {
      setError(err.message || '音声の書き起こしに失敗しました')
    } finally {
      setTimeout(() => {
        setIsProcessing(false)
        setProcessingStep('')
        setProcessingProgress(0)
      }, 1000)
    }
    if (e.target) e.target.value = ''
  }

  // キャラクター識別
  const identifyCharacters = async (dialogues: MovieSubtitleEntry[]) => {
    if (!apiKeys.gemini) return

    try {
      const response = await fetch('/api/identify-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialogues: dialogues.map(d => ({
            index: d.index,
            text: d.originalText || d.text,
            speaker: d.characterName
          })),
          scriptText: scriptText || undefined,
          apiKey: apiKeys.gemini
        })
      })

      const data = await response.json()
      if (!data.success) return

      // キャラクターを設定
      if (data.characters) {
        const chars: Character[] = data.characters.map((c: any) => ({
          id: c.id,
          projectId: selectedProjectId || '',
          name: c.name,
          nameReading: c.nameReading,
          gender: c.gender,
          ageGroup: c.ageGroup,
          speechStyle: c.speechStyle,
          firstPerson: '私',
          secondPerson: 'あなた',
          characterTraits: c.description,
          sampleDialogues: []
        }))
        setCharacters(chars)
      }

      // セリフにキャラクターを紐付け
      if (data.assignments) {
        const assignmentMap = new Map(
          data.assignments.map((a: any) => [a.index, { characterId: a.characterId, characterName: a.characterName }])
        )
        
        setSubtitles(prev => prev.map(d => {
          const assignment = assignmentMap.get(d.index) as any
          if (assignment) {
            return {
              ...d,
              characterId: assignment.characterId,
              characterName: assignment.characterName
            }
          }
          return d
        }))
      }

      // 固有名詞
      if (data.properNouns) {
        setProperNouns(data.properNouns.map((n: any, i: number) => ({
          id: `noun_${i + 1}`,
          original: n.name,
          type: n.type,
          reading: n.reading,
          variants: [],
          approved: false
        })))
      }
    } catch (err) {
      console.error('Character identification error:', err)
    }
  }

  // 自動話者マッピング
  const autoMapSpeakers = async (subtitles: MovieSubtitleEntry[], segments: any[]) => {
    if (!apiKeys.gemini || !scriptText || characters.length === 0) return

    try {
      // 音声話者情報を抽出
      const speakerMap = new Map<string, { segments: any[], totalDuration: number, wordCount: number }>()
      
      segments.forEach((seg: any) => {
        const speakerId = seg.speaker || seg.speaker_id || 'unknown'
        if (!speakerMap.has(speakerId)) {
          speakerMap.set(speakerId, { segments: [], totalDuration: 0, wordCount: 0 })
        }
        const speakerData = speakerMap.get(speakerId)!
        speakerData.segments.push({
          text: seg.text,
          startTime: seg.start || seg.start_time || 0,
          endTime: seg.end || seg.end_time || 0
        })
        speakerData.totalDuration += (seg.end || seg.end_time || 0) - (seg.start || seg.start_time || 0)
        speakerData.wordCount += (seg.text || '').split(/\s+/).length
      })

      const audioSpeakers = Array.from(speakerMap.entries()).map(([speakerId, data]) => ({
        speakerId,
        segments: data.segments,
        totalDuration: data.totalDuration,
        wordCount: data.wordCount
      }))

      if (audioSpeakers.length === 0) {
        console.log('[autoMapSpeakers] No speakers found in audio')
        return
      }

      // 各キャラクターのペルソナを抽出
      const scriptCharactersWithPersona = await Promise.all(
        characters.map(async (char) => {
          try {
            const response = await fetch('/api/extract-persona', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scriptText,
                characterName: char.name,
                apiKey: apiKeys.gemini
              })
            })

            const data = await response.json()
            if (data.success && data.persona) {
              return {
                name: char.name,
                dialogues: subtitles
                  .filter(s => s.characterId === char.id || s.characterName === char.name)
                  .map(s => ({ text: s.text })),
                persona: data.persona
              }
            }
          } catch (err) {
            console.error(`[autoMapSpeakers] Failed to extract persona for ${char.name}:`, err)
          }
          
          // ペルソナ抽出に失敗した場合は基本情報のみ
          return {
            name: char.name,
            dialogues: subtitles
              .filter(s => s.characterId === char.id || s.characterName === char.name)
              .map(s => ({ text: s.text })),
            persona: undefined
          }
        })
      )

      // 話者マッピングAPIを呼び出し
      const response = await fetch('/api/auto-map-speakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioSpeakers,
          scriptCharacters: scriptCharactersWithPersona,
          scriptText,
          apiKey: apiKeys.gemini
        })
      })

      const data = await response.json()
      if (!data.success || !data.mappings) {
        console.log('[autoMapSpeakers] Mapping failed:', data.error)
        return
      }

      console.log('[autoMapSpeakers] Mappings received:', data.mappings)

      // マッピングを適用
      const mappingMap = new Map<string, { characterId: string, characterName: string, confidence: number }>()
      data.mappings.forEach((m: any) => {
        // characterIdから実際のキャラクターIDを取得
        const charIndex = parseInt(m.characterId.replace('char_', ''))
        const character = characters[charIndex]
        if (character) {
          mappingMap.set(m.speakerId, {
            characterId: character.id,
            characterName: character.name,
            confidence: m.confidence
          })
        }
      })

      // 字幕エントリにマッピングを適用
      setSubtitles(prev => prev.map(sub => {
        const speakerId = sub.characterName || sub.speakerId
        const mapping = mappingMap.get(speakerId || '')
        if (mapping && mapping.confidence >= 0.5) {
          return {
            ...sub,
            characterId: mapping.characterId,
            characterName: mapping.characterName,
            speakerId: speakerId
          }
        }
        return sub
      }))

      // キャラクターにマッピング情報を保存
      setCharacters(prev => prev.map(char => {
        const mapping = Array.from(mappingMap.entries()).find(([_, m]) => m.characterId === char.id)
        if (mapping) {
          return {
            ...char,
            mappedSpeakerId: mapping[0],
            mappingConfidence: mapping[1].confidence
          }
        }
        return char
      }))

    } catch (err) {
      console.error('[autoMapSpeakers] Error:', err)
    }
  }

  // 脚本分析
  const analyzeScript = async (text: string) => {
    if (!apiKeys.gemini || !text) return

    setIsAnalyzingScript(true)
    setAnalysisStep('脚本を読み込み中...')
    setAnalysisProgress(10)
    
    try {
      setAnalysisStep('AIが脚本を分析中...')
      setAnalysisProgress(30)
      
      const response = await fetch('/api/analyze-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          apiKey: apiKeys.gemini,
          geminiModelScript: aiPreferences.geminiModelScript || 'gemini-2.5-pro',
          geminiModelLight: aiPreferences.geminiModelLight || 'gemini-2.5-flash-lite'
        })
      })

      setAnalysisStep('分析結果を処理中...')
      setAnalysisProgress(70)

      const data = await response.json()
      console.log('[analyzeScript] API response:', data)
      
      if (data.success && data.analysis) {
        setAnalysisStep('作品設定を更新中...')
        setAnalysisProgress(85)
        
        // デフォルト設定
        const defaultSettings: MovieSettingsType = {
          id: `settings_${Date.now()}`,
          projectId: selectedProjectId || '',
          title: '',
          originalLanguage: 'en',
          targetLanguage: 'ja',
          genres: [],
          eraSetting: 'modern',
          targetAudience: 'all_ages',
          translationStyle: 'subtitle',
          toneDescription: '',
          specialInstructions: '',
          glossary: {}
        }
        
        // 作品設定を更新（movieSettingsがnullでも動作）
        const baseSettings = movieSettings || defaultSettings
        const newSettings = {
          ...baseSettings,
          title: data.analysis.title || baseSettings.title,
          genres: data.analysis.genres || baseSettings.genres,
          eraSetting: data.analysis.eraSetting || baseSettings.eraSetting,
          targetAudience: data.analysis.targetAudience || baseSettings.targetAudience,
          translationStyle: data.analysis.translationStyle || baseSettings.translationStyle,
          toneDescription: data.analysis.toneDescription || baseSettings.toneDescription,
          specialInstructions: data.analysis.specialInstructions || baseSettings.specialInstructions
        }
        console.log('[analyzeScript] Setting movieSettings:', newSettings)
        setMovieSettings(newSettings)

        setAnalysisStep('キャラクターを抽出中...')
        setAnalysisProgress(95)

        // キャラクターを設定
        if (data.analysis.characters) {
          const chars: Character[] = data.analysis.characters.map((c: any, i: number) => ({
            id: `char_${String(i + 1).padStart(3, '0')}`,
            projectId: selectedProjectId || '',
            name: c.name,
            gender: c.gender || 'unknown',
            ageGroup: c.ageGroup || 'adult',
            speechStyle: c.speechStyle || 'casual',
            firstPerson: '私',
            secondPerson: 'あなた',
            characterTraits: c.description,
            sampleDialogues: c.sampleDialogues || []
          }))
          setCharacters(chars)
        }

        // 固有名詞を設定（脚本分析から自動抽出）
        if (data.properNouns && Array.isArray(data.properNouns)) {
          setProperNouns(data.properNouns.map((n: any) => ({
            id: n.id || `noun_${Date.now()}_${Math.random()}`,
            term: n.term || '',
            category: n.category || 'other',
            reading: n.reading,
            variants: n.variants || [],
            context: n.context || '',
            confidence: n.confidence || 0.5,
            approved: false
          })))
        }
        
        setAnalysisStep('完了')
        setAnalysisProgress(100)
      } else if (data.error) {
        setError(data.error)
      } else {
        setError('脚本分析に失敗しました（不明なエラー）')
      }
    } catch (err: any) {
      console.error('Script analysis error:', err)
      setError(err.message || '脚本分析に失敗しました')
    } finally {
      setTimeout(() => {
        setIsAnalyzingScript(false)
        setAnalysisStep('')
        setAnalysisProgress(0)
      }, 1000)
    }
  }

  // 字幕校正
  const handleSubtitleProofread = async () => {
    if (!apiKeys.gemini || subtitles.length === 0) return
    setIsProofreading(true)
    setProofreadIssues([])
    try {
      const language = movieSettings?.originalLanguage === 'en' ? 'en' : 'ja'
      const res = await fetch('/api/subtitles/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles,
          language,
          properNouns,
          apiKey: apiKeys.gemini,
          model: aiPreferences.geminiModel || 'gemini-3-flash-preview',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setProofreadIssues(data.issues || [])
      }
    } catch (e) {
      console.error('[proofread]', e)
    } finally {
      setIsProofreading(false)
    }
  }

  // 出力
  const handleExport = (format: 'srt' | 'vtt' | 'srt-speakers') => {
    if (subtitles.length === 0) return

    let content: string
    let filename: string

    let mimeType: string

    if (format === 'vtt') {
      content = generateVTT(subtitles)
      filename = `${movieSettings?.title || 'subtitles'}.vtt`
      mimeType = 'text/vtt'
    } else if (format === 'srt-speakers') {
      content = generateSRTWithSpeakers(subtitles, true)
      filename = `${movieSettings?.title || 'subtitles'}_speakers.srt`
      mimeType = 'application/x-subrip'
    } else {
      content = generateSRTWithSpeakers(subtitles, false)
      filename = `${movieSettings?.title || 'subtitles'}.srt`
      mimeType = 'application/x-subrip'
    }

    downloadFile(content, filename, mimeType)
  }

  // タイミング検証
  const validateTiming = useCallback(() => {
    if (subtitles.length === 0) {
      setTimingValidation(null)
      return
    }

    const violations: any[] = []
    const preset = currentPreset

    subtitles.forEach((sub, i) => {
      const duration = sub.endTime - sub.startTime
      const text = sub.translatedText || sub.text
      const cps = text.length / duration

      if (duration < preset.minDuration) {
        violations.push({
          subtitleIndex: sub.index,
          type: 'min_duration',
          severity: 'error',
          message: `表示時間が短すぎます: ${duration.toFixed(2)}s < ${preset.minDuration}s`,
          details: {
            actual: duration,
            expected: preset.minDuration,
            unit: 'seconds'
          },
          autoFixable: true
        })
      }

      if (duration > preset.maxDuration) {
        violations.push({
          subtitleIndex: sub.index,
          type: 'max_duration',
          severity: 'warning',
          message: `表示時間が長すぎます: ${duration.toFixed(2)}s > ${preset.maxDuration}s`,
          details: {
            actual: duration,
            expected: preset.maxDuration,
            unit: 'seconds'
          },
          autoFixable: false
        })
      }

      if (cps > preset.maxCPS) {
        violations.push({
          subtitleIndex: sub.index,
          type: 'reading_speed',
          severity: 'warning',
          message: `読み取り速度が速すぎます: ${cps.toFixed(1)} CPS > ${preset.maxCPS} CPS`,
          details: {
            actual: cps,
            expected: preset.maxCPS,
            unit: 'cps'
          },
          autoFixable: false
        })
      }

      const lines = text.split('\n')
      lines.forEach((line, lineIndex) => {
        if (line.length > preset.maxCharsPerLine) {
          violations.push({
            subtitleIndex: sub.index,
            type: 'char_limit',
            severity: 'error',
            message: `行${lineIndex + 1}: ${line.length}文字 > ${preset.maxCharsPerLine}文字`,
            details: {
              actual: line.length,
              expected: preset.maxCharsPerLine,
              unit: 'characters'
            },
            autoFixable: false
          })
        }
      })
    })

    // 統計を計算
    const durations = subtitles.map(s => s.endTime - s.startTime)
    const gaps = subtitles.slice(1).map((s, i) => s.startTime - subtitles[i].endTime)
    
    setTimingValidation({
      isValid: violations.length === 0,
      violations,
      totalViolations: violations.length,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      statistics: {
        totalSubtitles: subtitles.length,
        avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        avgCPS: 0, // 後で計算
        minDuration: durations.length > 0 ? Math.min(...durations) : 0,
        maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
        avgGap: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
      }
    })
  }, [subtitles, currentPreset])

  useEffect(() => {
    validateTiming()
  }, [validateTiming])

  // ダミーデータをロード（テスト用）
  const loadDummyData = useCallback(() => {
    console.log('[TEST] ダミーデータをロード中...')
    
    // ダミー字幕データ
    const dummySubtitles: MovieSubtitleEntry[] = [
      {
        index: 1,
        startTime: 0.0,
        endTime: 3.5,
        text: "Hello, my name is John.",
        lines: ["Hello, my name is John."],
        characterName: "John",
        originalText: "Hello, my name is John.",
        isTranslated: false
      },
      {
        index: 2,
        startTime: 4.0,
        endTime: 7.2,
        text: "Nice to meet you, John.",
        lines: ["Nice to meet you, John."],
        characterName: "Sarah",
        originalText: "Nice to meet you, John.",
        isTranslated: false
      },
      {
        index: 3,
        startTime: 8.0,
        endTime: 11.5,
        text: "How are you doing today?",
        lines: ["How are you doing today?"],
        characterName: "John",
        originalText: "How are you doing today?",
        isTranslated: false
      },
      {
        index: 4,
        startTime: 12.0,
        endTime: 15.8,
        text: "I'm doing great, thanks for asking!",
        lines: ["I'm doing great, thanks for asking!"],
        characterName: "Sarah",
        originalText: "I'm doing great, thanks for asking!",
        isTranslated: false
      }
    ]
    
    // ダミーキャラクターデータ
    const dummyCharacters: Character[] = [
      {
        id: 'char_1',
        projectId: selectedProjectId || 'test_project',
        name: 'John',
        gender: 'male',
        ageGroup: 'adult',
        speechStyle: 'casual',
        firstPerson: 'I',
        secondPerson: 'you',
        sentenceEndings: ['です', 'ます'],
        characterTraits: 'friendly, outgoing',
        sampleDialogues: ['Hello, my name is John.']
      },
      {
        id: 'char_2',
        projectId: selectedProjectId || 'test_project',
        name: 'Sarah',
        gender: 'female',
        ageGroup: 'adult',
        speechStyle: 'polite',
        firstPerson: 'I',
        secondPerson: 'you',
        sentenceEndings: ['です', 'ます'],
        characterTraits: 'kind, professional',
        sampleDialogues: ['Nice to meet you, John.']
      }
    ]
    
    // ダミー映画設定
    const dummySettings: MovieSettingsType = {
      id: `settings_${Date.now()}`,
      projectId: selectedProjectId || 'test_project',
      title: 'テスト映画',
      originalLanguage: 'en',
      targetLanguage: 'ja',
      genres: ['drama', 'comedy'],
      eraSetting: 'modern',
      targetAudience: 'all_ages',
      translationStyle: 'subtitle',
      toneDescription: '軽快で親しみやすいトーン',
      specialInstructions: 'キャラクターの個性を活かした翻訳を心がける',
      glossary: {
        'John': 'ジョン',
        'Sarah': 'サラ'
      }
    }
    
    // ダミー固有名詞（variantsがundefinedのケースも含む）
    const dummyProperNouns: ExtractedProperNoun[] = [
      {
        id: 'noun_1',
        term: 'John',
        category: 'person',
        reading: 'ジョン',
        variants: ['John', 'Jon'],
        context: '主人公の名前',
        confidence: 0.95,
        approved: true,
        sourceFile: 'script.txt'
      },
      {
        id: 'noun_2',
        term: 'Sarah',
        category: 'person',
        reading: 'サラ',
        variants: [], // 空配列のケース
        context: 'ヒロインの名前',
        confidence: 0.92,
        approved: false,
        sourceFile: 'script.txt'
      },
      {
        id: 'noun_3',
        term: 'Tokyo',
        category: 'place',
        reading: 'トウキョウ',
        // variantsがundefinedのケースをテスト（実際には空配列になるように修正済み）
        variants: undefined as any,
        context: '物語の舞台',
        confidence: 0.88,
        approved: true,
        sourceFile: 'srt.txt'
      }
    ]
    
    // データを設定
    setSubtitles(dummySubtitles)
    setCharacters(dummyCharacters)
    setMovieSettings(dummySettings)
    setProperNouns(dummyProperNouns.filter(n => n.variants !== undefined).map(n => ({
      ...n,
      variants: n.variants || [] // undefinedの場合は空配列に変換
    })))
    setScriptText('TEST SCRIPT\n\n[John] Hello, my name is John.\n[Sarah] Nice to meet you, John.')
    
    console.log('[TEST] ダミーデータロード完了:', {
      subtitles: dummySubtitles.length,
      characters: dummyCharacters.length,
      settings: dummySettings.title,
      properNouns: dummyProperNouns.length
    })
    
    // タイミング検証を実行
    setTimeout(() => {
      validateTiming()
    }, 100)
  }, [selectedProjectId, validateTiming])
  
  // 統計
  const stats = {
    total: subtitles.length,
    translated: subtitles.filter(s => s.isTranslated).length,
    characters: characters.length,
    properNouns: properNouns.filter(n => n.approved).length
  }

  // タブスタイル
  const tabStyle = (isActive: boolean) => ({
    padding: '0.5rem 0.75rem',
    fontSize: '11px',
    fontWeight: 600,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottomWidth: '3px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
    background: 'transparent',
    cursor: 'pointer',
    marginBottom: '-2px'
  })

  return (
    <div style={{ maxWidth: '1800px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              映画字幕翻訳
            </h2>
            {/* 保存状態表示 */}
            {saveStatus === 'saving' && (
              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>💾 保存中...</span>
            )}
            {saveStatus === 'saved' && lastSavedTime && (
              <span style={{ fontSize: '11px', color: 'rgb(34, 197, 94)' }}>
                ✓ 保存済み ({lastSavedTime.toLocaleTimeString()})
              </span>
            )}
            {saveStatus === 'idle' && lastSavedTime && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                最終保存: {lastSavedTime.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* テスト用ダミーデータボタン */}
          <button
            onClick={loadDummyData}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '11px',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600
            }}
            title="テスト用のダミーデータをロードします"
          >
            🧪 テストデータ読み込み
          </button>

          {/* プロジェクト選択 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => handleProjectSelect(e.target.value)}
              style={{
                padding: '0.375rem 0.5rem',
                fontSize: '11px',
                backgroundColor: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)',
                minWidth: '150px'
              }}
            >
              <option value="">プロジェクトを選択</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowNewProjectInput(true)}
              className="btn-secondary"
              style={{ padding: '0.375rem 0.5rem', fontSize: '11px' }}
            >
              + 新規
            </button>
          </div>
          {showNewProjectInput && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateProject()
                  } else if (e.key === 'Escape') {
                    setShowNewProjectInput(false)
                    setNewProjectName('')
                  }
                }}
                className="input"
                placeholder="プロジェクト名を入力"
                style={{ fontSize: '12px', flex: 1, padding: '0.375rem 0.5rem' }}
                autoFocus
              />
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="btn-primary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '12px' }}
              >
                作成
              </button>
              <button
                onClick={() => {
                  setShowNewProjectInput(false)
                  setNewProjectName('')
                }}
                className="btn"
                style={{ padding: '0.375rem 0.75rem', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* インポート */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input 
              id="srt-file-input"
              type="file" 
              accept=".srt" 
              onChange={handleSRTImport} 
              style={{ display: 'none' }} 
            />
            <label 
              htmlFor="srt-file-input"
              className="btn-secondary" 
              style={{ 
                padding: '0.5rem 1rem', 
                fontSize: '12px', 
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                border: '1px dashed var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
              }}
            >
              <span>📄</span>
              <span>SRTをアップロード</span>
            </label>
            <input 
              id="script-file-input"
              type="file" 
              accept=".txt,.md,.pdf" 
              onChange={handleScriptImport} 
              style={{ display: 'none' }} 
            />
            <label 
              htmlFor="script-file-input"
              className="btn-secondary" 
              style={{ 
                padding: '0.5rem 1rem', 
                fontSize: '12px', 
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                border: '1px dashed var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
              }}
            >
              <span>📝</span>
              <span>脚本をアップロード</span>
            </label>
            <input 
              id="audio-file-input"
              type="file" 
              accept=".mp3,.wav,.m4a,.mp4" 
              onChange={handleAudioImport} 
              style={{ display: 'none' }} 
              disabled={!apiKeys.elevenlabs}
            />
            <label 
              htmlFor="audio-file-input"
              className="btn-secondary" 
              style={{ 
                padding: '0.5rem 1rem', 
                fontSize: '12px', 
                cursor: apiKeys.elevenlabs ? 'pointer' : 'not-allowed',
                opacity: apiKeys.elevenlabs ? 1 : 0.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                border: '1px dashed var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (apiKeys.elevenlabs) {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
              }}
            >
              <span>🎵</span>
              <span>音声をアップロード</span>
            </label>
          </div>

          {/* 統計 */}
          <div style={{ display: 'flex', gap: '1rem', fontSize: '10px', color: 'var(--text-muted)' }}>
            <span>{stats.translated}/{stats.total} 翻訳</span>
            <span>{stats.characters} キャラ</span>
            <span>{stats.properNouns} 固有名詞</span>
          </div>

          {/* 出力 */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleExport(e.target.value as any)
                e.target.value = ''
              }
            }}
            className="btn-secondary"
            style={{ padding: '0.375rem 0.5rem', fontSize: '11px' }}
            disabled={subtitles.length === 0}
          >
            <option value="">出力</option>
            <option value="srt">SRT</option>
            <option value="srt-speakers">SRT (話者タグ)</option>
            <option value="vtt">VTT</option>
          </select>
        </div>

        {/* 音声処理中表示 */}
        {isProcessing && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>音声書き起こし</span>
              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>{processingProgress}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${processingProgress}%`, 
                  height: '100%', 
                  backgroundColor: 'var(--accent)', 
                  transition: 'width 0.3s ease',
                  borderRadius: '3px'
                }} 
              />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{processingStep}</p>
          </div>
        )}

        {/* 脚本分析中表示 */}
        {isAnalyzingScript && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>脚本分析</span>
              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>{analysisProgress}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${analysisProgress}%`, 
                  height: '100%', 
                  backgroundColor: 'var(--accent)', 
                  transition: 'width 0.3s ease',
                  borderRadius: '3px'
                }} 
              />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{analysisStep}</p>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontSize: '11px', color: '#ef4444' }}>
            {error}
          </div>
        )}
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', marginBottom: '1rem' }}>
        <button onClick={() => setActiveSection('settings')} style={tabStyle(activeSection === 'settings')}>作品設定</button>
        <button onClick={() => setActiveSection('format')} style={tabStyle(activeSection === 'format')}>
          フォーマット {timingValidation && !timingValidation.isValid && <span style={{ color: '#ef4444' }}>({timingValidation.totalViolations})</span>}
        </button>
        <button onClick={() => setActiveSection('workspace')} style={tabStyle(activeSection === 'workspace')}>
          翻訳ワークスペース
        </button>
      </div>

      {/* セクションコンテンツ */}
      {!selectedProjectId ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>プロジェクトを選択または作成してください</p>
        </div>
      ) : (
        <>
          {/* 作品設定 */}
          {activeSection === 'settings' && (
            <>
              {scriptText && (
                <div className="card" style={{ padding: '1rem', marginBottom: '1rem', backgroundColor: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>脚本から自動分析</p>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                        AIが脚本を分析し、設定を自動入力します
                      </p>
                    </div>
                    <button
                      onClick={() => analyzeScript(scriptText)}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1rem', fontSize: '11px' }}
                      disabled={isAnalyzingScript || !apiKeys.gemini}
                    >
                      {isAnalyzingScript ? '分析中...' : '脚本を分析'}
                    </button>
                  </div>
                </div>
              )}
              <MovieSettings
                projectId={selectedProjectId}
                settings={movieSettings}
                onSettingsChange={setMovieSettings}
              />

              {/* 固有名詞管理 */}
              {selectedProjectId && (
                <div style={{ marginTop: '1rem' }}>
                  <ProperNounExtractor
                    projectId={selectedProjectId}
                    apiKeys={apiKeys}
                    aiPreferences={aiPreferences}
                    existingNouns={properNouns}
                    scriptText={scriptText}
                    subtitleText={subtitles.length > 0 ? subtitles.map(s => s.text).join('\n') : undefined}
                    onNounsExtracted={(newNouns) => {
                      setProperNouns(prev => {
                        const existingIds = new Set(prev.map(n => n.id))
                        const merged = [...prev, ...newNouns.filter(n => !existingIds.has(n.id))]
                        return merged
                      })
                    }}
                    onNounApproved={(noun) => {
                      setProperNouns(prev => prev.map(n => n.id === noun.id ? noun : n))
                    }}
                    onNounRemoved={(nounId) => {
                      setProperNouns(prev => prev.filter(n => n.id !== nounId))
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* フォーマット設定 */}
          {activeSection === 'format' && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '1rem' }}>字幕フォーマット設定</h3>
              
              {/* プリセット選択 */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                  プラットフォームプリセット
                </label>
                <select
                  value={selectedPreset}
                  onChange={(e) => setSelectedPreset(e.target.value as SubtitlePlatform)}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                >
                  {availablePresets.map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.name} - {preset.maxCharsPerLine}文字/行, {preset.maxCPS} CPS</option>
                  ))}
                </select>
              </div>

              {/* 現在のプリセット詳細 */}
              {currentPreset && (
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.5rem' }}>{currentPreset.name}</h4>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{currentPreset.description}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '10px' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>文字数/行:</span> {currentPreset.maxCharsPerLine}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>CPS:</span> {currentPreset.maxCPS}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>表示時間:</span> {currentPreset.minDuration}s-{currentPreset.maxDuration}s</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>FPS:</span> {currentPreset.defaultFps}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>最大行数:</span> {currentPreset.maxLines}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>句読点:</span> {currentPreset.usePunctuation ? 'あり' : 'なし'}</div>
                  </div>
                  {currentPreset.notes && (
                    <p style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '0.5rem' }}>{currentPreset.notes}</p>
                  )}
                </div>
              )}

              {/* 改行パターン */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>改行パターン</label>
                <select
                  value={selectedLineBreakPattern}
                  onChange={(e) => setSelectedLineBreakPattern(e.target.value as LineBreakPatternType)}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                >
                  {availableLineBreakPatterns.map(pattern => (
                    <option key={pattern.id} value={pattern.id}>{pattern.name} - {pattern.description}</option>
                  ))}
                </select>
              </div>

              {/* セグメント分割パターン */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>セグメント分割</label>
                <select
                  value={selectedSegmentPattern}
                  onChange={(e) => setSelectedSegmentPattern(e.target.value as SegmentSplitPatternType)}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '12px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                >
                  {Object.values(SEGMENT_SPLIT_PATTERNS).map(pattern => (
                    <option key={pattern.id} value={pattern.id}>{pattern.name} - {pattern.description}</option>
                  ))}
                </select>
              </div>

              {/* タイミング警告（簡易版） */}
              {timingValidation && timingValidation.totalViolations > 0 && (
                <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', marginTop: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '14px' }}>⚠️</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444' }}>
                      タイミング警告: {timingValidation.totalViolations}件
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {timingValidation.errors > 0 && <span style={{ color: '#ef4444' }}>エラー: {timingValidation.errors}件</span>}
                    {timingValidation.errors > 0 && timingValidation.warnings > 0 && <span> • </span>}
                    {timingValidation.warnings > 0 && <span style={{ color: '#f59e0b' }}>警告: {timingValidation.warnings}件</span>}
                  </div>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    表示時間: {timingValidation.statistics.avgDuration.toFixed(2)}秒 • CPS: {timingValidation.statistics.avgCPS.toFixed(1)}
                  </p>
                </div>
              )}

              {/* 字幕校正 */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 600 }}>字幕校正</h4>
                  <button
                    onClick={handleSubtitleProofread}
                    disabled={isProofreading || subtitles.length === 0 || !apiKeys.gemini}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '11px',
                      backgroundColor: isProofreading ? 'var(--bg-subtle)' : 'var(--accent)',
                      color: isProofreading ? 'var(--text-muted)' : 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isProofreading || subtitles.length === 0 || !apiKeys.gemini ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {isProofreading ? '校正中...' : '字幕を校正する'}
                  </button>
                </div>
                {!apiKeys.gemini && (
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Gemini APIキーが必要です</p>
                )}
                {proofreadIssues.length > 0 && (
                  <div style={{ padding: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '0.5rem', color: '#f59e0b' }}>
                      校正結果: {proofreadIssues.length}件の問題
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '10px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      {proofreadIssues.filter(i => i.type === 'linebreak').length > 0 && (
                        <span>↵ 改行: {proofreadIssues.filter(i => i.type === 'linebreak').length}件</span>
                      )}
                      {proofreadIssues.filter(i => i.type === 'cutpoint').length > 0 && (
                        <span>✂ カット点: {proofreadIssues.filter(i => i.type === 'cutpoint').length}件</span>
                      )}
                      {proofreadIssues.filter(i => i.type === 'properNoun').length > 0 && (
                        <span>📝 固有名詞: {proofreadIssues.filter(i => i.type === 'properNoun').length}件</span>
                      )}
                    </div>
                    <p style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                      翻訳ワークスペースのセリフ一覧でアイコンをご確認ください
                    </p>
                  </div>
                )}
                {proofreadIssues.length === 0 && !isProofreading && subtitles.length > 0 && proofreadIssues !== undefined && (
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>「字幕を校正する」で改行・カット点・固有名詞を一括検証します</p>
                )}
              </div>
            </div>
          )}

          {/* 翻訳ワークスペース（分割ビュー） */}
          {activeSection === 'workspace' && (
            <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 300px)', minHeight: '600px' }}>
              {/* 左パネル */}
              <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
                {/* キャラクター一覧 */}
                <div className="card" style={{ padding: '0.75rem', flexShrink: 0 }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.5rem' }}>キャラクター ({characters.length})</h3>
                  <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {characters.length === 0 ? (
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>キャラクターがありません</p>
                    ) : (
                      characters.map(char => (
                        <div key={char.id} style={{ padding: '0.5rem', marginBottom: '0.25rem', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '11px' }}>
                          <div style={{ fontWeight: 500 }}>{char.name}</div>
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{char.speechStyle}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* セリフ一覧 */}
                <div className="card" style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.5rem' }}>セリフ ({subtitles.length})</h3>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {subtitles.length === 0 ? (
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                        SRTまたは音声をインポートしてください
                      </p>
                    ) : (
                      subtitles.map((sub) => {
                        const duration = sub.endTime - sub.startTime
                        const text = sub.translatedText || sub.text
                        const cps = text.length / duration
                        const hasWarning = duration < currentPreset.minDuration || duration > currentPreset.maxDuration || cps > currentPreset.maxCPS
                        const subIssues = proofreadIssues.filter(i => i.subtitleIndex === sub.index)
                        const hasLinebreak = subIssues.some(i => i.type === 'linebreak')
                        const hasCutpoint = subIssues.some(i => i.type === 'cutpoint')
                        const hasNounIssue = subIssues.some(i => i.type === 'properNoun')
                        const issueTooltip = subIssues.map(i => `[${i.type}] ${i.message}`).join('\n')

                        return (
                          <div
                            key={sub.index}
                            onClick={() => setSelectedSubtitleIndex(sub.index)}
                            title={issueTooltip || undefined}
                            style={{
                              padding: '0.5rem',
                              marginBottom: '0.25rem',
                              backgroundColor: selectedSubtitleIndex === sub.index ? 'var(--accent)' : subIssues.some(i => i.severity === 'error') ? 'rgba(239,68,68,0.07)' : subIssues.length > 0 ? 'rgba(245,158,11,0.07)' : 'var(--bg-subtle)',
                              color: selectedSubtitleIndex === sub.index ? 'white' : 'var(--text)',
                              borderRadius: '4px',
                              fontSize: '10px',
                              cursor: 'pointer',
                              border: selectedSubtitleIndex === sub.index ? '2px solid var(--accent)' : subIssues.some(i => i.severity === 'error') ? '1px solid rgba(239,68,68,0.4)' : subIssues.length > 0 ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontFamily: 'monospace' }}>#{sub.index}</span>
                              <span>{formatTimestampSRT(sub.startTime)}</span>
                              {hasWarning && <span style={{ fontSize: '9px' }}>⚠️</span>}
                              {hasLinebreak && <span style={{ fontSize: '9px' }} title="改行位置に問題があります">↵</span>}
                              {hasCutpoint && <span style={{ fontSize: '9px' }} title="カット点に問題があります">✂</span>}
                              {hasNounIssue && <span style={{ fontSize: '9px' }} title="固有名詞に問題があります">📝</span>}
                              {sub.characterName && (
                                <span style={{ padding: '0.125rem 0.25rem', fontSize: '9px', backgroundColor: selectedSubtitleIndex === sub.index ? 'rgba(255,255,255,0.3)' : 'var(--accent)', color: selectedSubtitleIndex === sub.index ? 'white' : 'white', borderRadius: '3px' }}>
                                  {sub.characterName}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {text}
                            </div>
                            {subIssues.length > 0 && (
                              <div style={{ marginTop: '0.25rem', fontSize: '9px', color: selectedSubtitleIndex === sub.index ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', lineHeight: 1.4 }}>
                                {subIssues.slice(0, 2).map((issue, i) => (
                                  <div key={i}>{issue.message}{issue.suggestion ? ` → ${issue.suggestion.replace(/\n/g, ' / ')}` : ''}</div>
                                ))}
                                {subIssues.length > 2 && <div>他{subIssues.length - 2}件...</div>}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* 話者マッピング */}
                <div className="card" style={{ padding: '0.75rem', flexShrink: 0 }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.5rem' }}>話者マッピング</h3>
                  <SpeakerMapping
                    subtitles={subtitles}
                    characters={characters}
                    onMappingComplete={(updatedSubtitles) => setSubtitles(updatedSubtitles)}
                  />
                </div>
              </div>

              {/* 右パネル */}
              <div style={{ width: '60%', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
                {/* 翻訳エディタ */}
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <TranslationEditor
                    subtitles={subtitles}
                    characters={characters}
                    movieSettings={movieSettings}
                    apiKeys={apiKeys}
                    aiPreferences={aiPreferences}
                    onSubtitlesChange={setSubtitles}
                  />
                </div>

                {/* 固有名詞参照 */}
                <div className="card" style={{ padding: '0.75rem', flexShrink: 0, maxHeight: '150px', overflowY: 'auto' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.5rem' }}>固有名詞 ({properNouns.filter(n => n.approved).length}/{properNouns.length})</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {properNouns.filter(n => n.approved).map(noun => (
                      <span key={noun.id} style={{ padding: '0.25rem 0.5rem', fontSize: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px' }}>
                        {noun.term}{noun.reading && ` (${noun.reading})`}
                      </span>
                    ))}
                  </div>
                  {properNouns.filter(n => !n.approved).length > 0 && (
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>未承認 ({properNouns.filter(n => !n.approved).length})</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {properNouns.filter(n => !n.approved).slice(0, 5).map(noun => (
                          <span key={noun.id} style={{ padding: '0.125rem 0.375rem', fontSize: '9px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '3px', color: 'var(--text-muted)' }}>
                            {noun.term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}
