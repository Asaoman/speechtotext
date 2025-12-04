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
  SegmentSplitPatternType
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
import SubtitleTimingValidator from './SubtitleTimingValidator'
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
  const [activeSection, setActiveSection] = useState<'settings' | 'format' | 'characters' | 'dialogues' | 'proper-nouns' | 'speaker-mapping' | 'editor' | 'validation'>('settings')
  const [includeSpeakerTags, setIncludeSpeakerTags] = useState(false)
  
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

  // localStorageからのデータ復元
  useEffect(() => {
    if (typeof window === 'undefined') return
    
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
  }, [selectedProjectId])

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
          apiKey: apiKeys.gemini
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
        
        setAnalysisStep('完了')
        setAnalysisProgress(100)
      } else if (data.error) {
        setError(data.error)
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
          currentValue: duration,
          expectedValue: preset.minDuration
        })
      }

      if (duration > preset.maxDuration) {
        violations.push({
          subtitleIndex: sub.index,
          type: 'max_duration',
          severity: 'warning',
          message: `表示時間が長すぎます: ${duration.toFixed(2)}s > ${preset.maxDuration}s`,
          currentValue: duration,
          expectedValue: preset.maxDuration
        })
      }

      if (cps > preset.maxCPS) {
        violations.push({
          subtitleIndex: sub.index,
          type: 'reading_speed',
          severity: 'warning',
          message: `読み取り速度が速すぎます: ${cps.toFixed(1)} CPS > ${preset.maxCPS} CPS`,
          currentValue: cps,
          expectedValue: preset.maxCPS
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
            currentValue: line.length,
            expectedValue: preset.maxCharsPerLine
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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            映画字幕翻訳
          </h2>

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
              onClick={() => {
                const name = prompt('プロジェクト名を入力:')
                if (name) {
                  setNewProjectName(name)
                  // 次のレンダリングで handleCreateProject を呼び出す
                  setTimeout(() => handleCreateProject(), 0)
                }
              }}
              className="btn-secondary"
              style={{ padding: '0.375rem 0.5rem', fontSize: '11px' }}
            >
              + 新規
            </button>
          </div>

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
        <button onClick={() => setActiveSection('format')} style={tabStyle(activeSection === 'format')}>フォーマット</button>
        <button onClick={() => setActiveSection('characters')} style={tabStyle(activeSection === 'characters')}>キャラクター ({characters.length})</button>
        <button onClick={() => setActiveSection('dialogues')} style={tabStyle(activeSection === 'dialogues')}>セリフ ({subtitles.length})</button>
        <button onClick={() => setActiveSection('proper-nouns')} style={tabStyle(activeSection === 'proper-nouns')}>固有名詞 ({properNouns.length})</button>
        <button onClick={() => setActiveSection('speaker-mapping')} style={tabStyle(activeSection === 'speaker-mapping')}>話者マッピング</button>
        <button onClick={() => setActiveSection('editor')} style={tabStyle(activeSection === 'editor')}>翻訳エディタ</button>
        <button onClick={() => setActiveSection('validation')} style={tabStyle(activeSection === 'validation')}>
          タイミング検証 {timingValidation && !timingValidation.isValid && <span style={{ color: '#ef4444' }}>({timingValidation.totalViolations})</span>}
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
              <div>
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
            </div>
          )}

          {/* キャラクター管理 */}
          {activeSection === 'characters' && (
            <CharacterManager
              projectId={selectedProjectId}
              onCharacterSelect={(char) => {}}
            />
          )}

          {/* セリフ一覧 */}
          {activeSection === 'dialogues' && (
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '1rem' }}>セリフ一覧 ({subtitles.length})</h3>
              
              {subtitles.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                  SRTまたは音声をインポートしてください
                </p>
              ) : (
                <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                  {subtitles.map((sub) => (
                    <div key={sub.index} style={{ padding: '0.75rem', marginBottom: '0.5rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{sub.index}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatTimestampSRT(sub.startTime)}</span>
                        {sub.characterName && (
                          <span style={{ padding: '0.125rem 0.375rem', fontSize: '10px', backgroundColor: 'var(--accent)', color: 'white', borderRadius: '10px' }}>
                            {sub.characterName}
                          </span>
                        )}
                        {sub.isTranslated && <span style={{ fontSize: '9px', color: '#10b981', marginLeft: 'auto' }}>翻訳済</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '0.25rem' }}>{sub.originalText || sub.text}</div>
                      {sub.translatedText && (
                        <div style={{ fontSize: '12px', color: 'var(--accent)', paddingTop: '0.25rem', borderTopWidth: '1px', borderTopStyle: 'dashed', borderTopColor: 'var(--border)' }}>
                          {sub.translatedText}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 固有名詞 */}
          {activeSection === 'proper-nouns' && (
            <ProperNounExtractor
              projectId={selectedProjectId}
              apiKeys={apiKeys}
              existingNouns={properNouns}
              scriptText={scriptText}
              subtitleText={subtitles.map(s => s.text).join('\n')}
              onNounsExtracted={(nouns) => setProperNouns(nouns.map((n, i) => ({ ...n, id: `noun_${i}` })))}
              onNounApproved={(noun) => {
                setProperNouns(prev => prev.map(n => n.id === noun.id ? { ...n, approved: true } : n))
              }}
              onNounRemoved={(id) => {
                setProperNouns(prev => prev.filter(n => n.id !== id))
              }}
            />
          )}

          {/* 話者マッピング */}
          {activeSection === 'speaker-mapping' && (
            <SpeakerMapping
              subtitles={subtitles}
              characters={characters}
              onMappingComplete={(updatedSubtitles) => setSubtitles(updatedSubtitles)}
            />
          )}

          {/* 翻訳エディタ */}
          {activeSection === 'editor' && (
            <TranslationEditor
              subtitles={subtitles}
              characters={characters}
              movieSettings={movieSettings}
              apiKeys={apiKeys}
              aiPreferences={aiPreferences}
              onSubtitlesChange={setSubtitles}
            />
          )}

          {/* タイミング検証 */}
          {activeSection === 'validation' && (
            <SubtitleTimingValidator
              validation={timingValidation}
              language={movieSettings?.targetLanguage === 'en' ? 'en' : 'ja'}
              onJumpToSubtitle={(index) => {
                setActiveSection('editor')
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
