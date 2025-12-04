'use client'

import { useState, useCallback, useEffect } from 'react'
import FileUpload from '@/components/FileUpload'
import SettingsModal from '@/components/SettingsModal'
import TranscriptionResult from '@/components/TranscriptionResult'
import ProofreadingSection from '@/components/ProofreadingSection'
import ProperNounsManager from '@/components/ProperNounsManager'
import SubtitleGenerator from '@/components/SubtitleGenerator'
import MovieSubtitleTab from '@/components/MovieSubtitleTab'
import HistorySidebar from '@/components/HistorySidebar'
import { TranscriptionResult as TranscriptionResultType, ProofreadingResult, ApiKeys, SubtitleSettings, AIPreferences } from '@/lib/types'
import { storage } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'

export default function Home() {
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'transcription' | 'proofreading' | 'subtitle-generation' | 'movie-subtitle'>('transcription')
  const [showSettings, setShowSettings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
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
  const [proofreadingResult, setProofreadingResult] = useState<ProofreadingResult | null>(null)
  const [proofreadingMeta, setProofreadingMeta] = useState<any>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [subtitleContent, setSubtitleContent] = useState<{ srt: string; vtt: string } | null>(null)
  const [navigatedFromTranscription, setNavigatedFromTranscription] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(storage.getCurrentProjectId())
  const [movieProjectIdToLoad, setMovieProjectIdToLoad] = useState<string | null>(null)

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

  const handleTranscriptionComplete = (result: TranscriptionResultType, fileName?: string, service?: string) => {
    console.log('Setting transcription result in parent:', result)
    setTranscriptionResult(result)
    setTranscriptionMeta({ fileName, service, isNew: true })
  }

  // 履歴から書き起こしをロード
  const handleLoadTranscription = useCallback((data: TranscriptionResultType, meta?: any) => {
    setTranscriptionResult(data)
    setTranscriptionMeta(meta)
    setActiveTab('transcription')
    setShowHistory(false)
  }, [])

  // 履歴から校正結果をロード
  const handleLoadProofreading = useCallback((data: ProofreadingResult, meta?: any) => {
    setProofreadingResult(data)
    setProofreadingMeta(meta)
    setActiveTab('proofreading')
    setShowHistory(false)
  }, [])

  // 履歴から字幕をロード
  const handleLoadSubtitles = useCallback((data: any) => {
    // SubtitleGeneratorに渡すためのデータ形式に変換
    if (data.srtContent) {
      setSubtitleContent({ srt: data.srtContent, vtt: data.vttContent || '' })
    }
    setActiveTab('subtitle-generation')
    setShowHistory(false)
  }, [])

  // 履歴から映画字幕プロジェクトをロード
  const handleLoadMovieProject = useCallback((projectId: string) => {
    setMovieProjectIdToLoad(projectId)
    setActiveTab('movie-subtitle')
    setShowHistory(false)
  }, [])

  const handleStartProofreading = () => {
    if (transcriptionResult) {
      setNavigatedFromTranscription(true)
      setActiveTab('proofreading')
    }
  }

  const handleStartSubtitleGeneration = () => {
    if (transcriptionResult) {
      setNavigatedFromTranscription(true)
      setActiveTab('subtitle-generation')
    }
  }

  const handleTabClick = (tab: 'transcription' | 'proofreading' | 'subtitle-generation' | 'movie-subtitle') => {
    setNavigatedFromTranscription(false)
    setActiveTab(tab)
  }

  const handleSubtitleGenerated = (srt: string, vtt: string) => {
    setSubtitleContent({ srt, vtt })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--bg)' }}>
      {/* 履歴サイドバー */}
      <HistorySidebar
        isOpen={showHistory}
        onToggle={() => setShowHistory(!showHistory)}
        onLoadTranscription={handleLoadTranscription}
        onLoadProofreading={handleLoadProofreading}
        onLoadSubtitles={handleLoadSubtitles}
        onLoadMovieProject={handleLoadMovieProject}
        currentProjectId={currentProjectId}
      />

      <div style={{ width: '100%', maxWidth: '700px', padding: '0 1.5rem', marginLeft: showHistory ? '320px' : '0', transition: 'margin-left 0.3s' }}>
        <header style={{ padding: '1.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.5px' }}>
            <span style={{ color: 'var(--accent)' }}>SPEECH</span> TO TEXT
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="btn"
              style={{ padding: '0.5rem', minWidth: 'auto', fontSize: '16px' }}
              title="履歴を表示"
            >
              📂
            </button>
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
            onClick={() => handleTabClick('proofreading')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '13px',
              fontWeight: 600,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'proofreading' ? '3px solid var(--accent)' : '3px solid transparent',
              color: activeTab === 'proofreading' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            ✏️ 校正
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

              {transcriptionResult && (
                <div className="animate-fade-in">
                  <TranscriptionResult
                    result={transcriptionResult}
                    onStartProofreading={handleStartProofreading}
                    onStartSubtitleGeneration={handleStartSubtitleGeneration}
                  />
                </div>
              )}
            </>
          )}

          {/* 校正タブ */}
          {activeTab === 'proofreading' && (
            <div className="animate-fade-in">
              <ProofreadingSection
                transcriptionResult={transcriptionResult}
                apiKeys={apiKeys}
                aiPreferences={aiPreferences}
                proofreadingResult={proofreadingResult}
                setProofreadingResult={setProofreadingResult}
                navigatedFromTranscription={navigatedFromTranscription}
              />
            </div>
          )}

          {/* 字幕生成タブ */}
          {activeTab === 'subtitle-generation' && (
            <div className="animate-fade-in">
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
