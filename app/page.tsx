'use client'

import { useState } from 'react'
import FileUpload from '@/components/FileUpload'
import SettingsModal from '@/components/SettingsModal'
import TranscriptionResult from '@/components/TranscriptionResult'
import ProofreadingSection from '@/components/ProofreadingSection'
import ProperNounsManager from '@/components/ProperNounsManager'
import SubtitleGenerator from '@/components/SubtitleGenerator'
import { TranscriptionResult as TranscriptionResultType, ProofreadingResult, ApiKeys, SubtitleSettings, AIPreferences } from '@/lib/types'
import { storage } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'

export default function Home() {
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'transcription' | 'proofreading' | 'subtitle-generation'>('transcription')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKeys>(storage.getApiKeys())
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(storage.getSubtitleSettings())
  const [aiPreferences, setAIPreferences] = useState<AIPreferences>(storage.getAIPreferences())
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResultType | null>(null)
  const [proofreadingResult, setProofreadingResult] = useState<ProofreadingResult | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [subtitleContent, setSubtitleContent] = useState<{ srt: string; vtt: string } | null>(null)
  const [navigatedFromTranscription, setNavigatedFromTranscription] = useState(false)

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

  const handleTranscriptionComplete = (result: TranscriptionResultType) => {
    console.log('Setting transcription result in parent:', result)
    setTranscriptionResult(result)
  }

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

  const handleTabClick = (tab: 'transcription' | 'proofreading' | 'subtitle-generation') => {
    setNavigatedFromTranscription(false)
    setActiveTab(tab)
  }

  const handleSubtitleGenerated = (srt: string, vtt: string) => {
    setSubtitleContent({ srt, vtt })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '700px', padding: '0 1.5rem' }}>
        <header style={{ padding: '1.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
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
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem', gap: '0.5rem' }}>
          <button
            onClick={() => handleTabClick('transcription')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '13px',
              fontWeight: 600,
              borderBottom: activeTab === 'transcription' ? '3px solid var(--accent)' : 'none',
              color: activeTab === 'transcription' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
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
              borderBottom: activeTab === 'proofreading' ? '3px solid var(--accent)' : 'none',
              color: activeTab === 'proofreading' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
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
              borderBottom: activeTab === 'subtitle-generation' ? '3px solid var(--accent)' : 'none',
              color: activeTab === 'subtitle-generation' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            🎬 字幕生成
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
