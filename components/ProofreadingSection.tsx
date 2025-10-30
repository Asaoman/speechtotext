'use client'

import { useState, useEffect } from 'react'
import { ApiKeys, ProofreadingResult, AIPreferences, TranscriptionResult } from '@/lib/types'
import { downloadFile, generateTimestamp } from '@/lib/utils'
import ProperNounsModalMinimal from './ProperNounsModalMinimal'
import ProjectSelectorCard from './common/ProjectSelectorCard'
import FileUploadSection from './common/FileUploadSection'
import { useProject } from '@/hooks/useProject'

interface ProofreadingSectionProps {
  transcriptionResult?: TranscriptionResult | null
  apiKeys: ApiKeys
  aiPreferences: AIPreferences
  proofreadingResult: ProofreadingResult | null
  setProofreadingResult: (result: ProofreadingResult | null) => void
  navigatedFromTranscription?: boolean
}

export default function ProofreadingSection({
  transcriptionResult,
  apiKeys,
  aiPreferences,
  proofreadingResult,
  setProofreadingResult,
  navigatedFromTranscription = false,
}: ProofreadingSectionProps) {
  // 設定から取得した値を使用（変更不可）
  const service = aiPreferences.defaultService
  const model = service === 'openai'
    ? aiPreferences.openaiModel
    : service === 'claude'
    ? aiPreferences.claudeModel
    : aiPreferences.geminiModel
  const includeProperNouns = true  // 常に固有名詞を参照

  const [language, setLanguage] = useState<'ja' | 'en'>('ja')
  const [isProofreading, setIsProofreading] = useState(false)
  const [error, setError] = useState('')
  const [leftTab, setLeftTab] = useState<'original' | 'result'>('original')
  const [originalText, setOriginalText] = useState(transcriptionResult?.text || '')
  const [fileUploadError, setFileUploadError] = useState('')
  const [showProperNounsModal, setShowProperNounsModal] = useState(false)

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

  // ファイルアップロード処理（FileUploadSectionから呼ばれる）
  const handleFileLoaded = (text: string, fileName: string) => {
    setOriginalText(text)
  }

  const handleProofread = async () => {
    const apiKey = service === 'openai' ? apiKeys.openai : service === 'claude' ? apiKeys.claude : apiKeys.gemini
    if (!apiKey) {
      setError(`${service === 'openai' ? 'OpenAI' : service === 'claude' ? 'Claude' : 'Google Gemini'} APIキーが設定されていません`)
      return
    }

    if (!originalText.trim()) {
      setError('校正するテキストを入力してください')
      return
    }

    setIsProofreading(true)
    setError('')

    try {
      // 校正タブではsegmentsやwordsを渡さず、純粋なテキスト校正のみを行う
      const response = await fetch('/api/proofread', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: originalText,
          service,
          model,
          language,
          includeProperNouns,
          customContext: customContext.trim(),
          apiKey,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '校正に失敗しました')
      }

      const result = await response.json()
      setProofreadingResult(result)
      setLeftTab('result')
    } catch (err: any) {
      setError(err.message || '校正中にエラーが発生しました')
    } finally {
      setIsProofreading(false)
    }
  }

  const canProofread = service === 'openai' ? apiKeys.openai : service === 'claude' ? apiKeys.claude : apiKeys.gemini

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* テキスト */}
      <div className="card" style={{ padding: '1rem' }}>
        {/* タブ */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <button
            onClick={() => setLeftTab('original')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '11px',
              fontWeight: 600,
              borderBottom: leftTab === 'original' ? '2px solid var(--accent)' : 'none',
              color: leftTab === 'original' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            元の文章
          </button>
          <button
            onClick={() => setLeftTab('result')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '11px',
              fontWeight: 600,
              borderBottom: leftTab === 'result' ? '2px solid var(--accent)' : 'none',
              color: leftTab === 'result' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            校正結果
          </button>
        </div>

        {leftTab === 'original' && (
          <div>
            <FileUploadSection
              onFileLoaded={handleFileLoaded}
              onError={setFileUploadError}
              acceptedFormats={['.srt', '.txt', '.md']}
              isOpen={!navigatedFromTranscription}
            />
            <textarea
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              className="textarea"
              rows={18}
              placeholder="テキストを入力"
              style={{ fontSize: '12px' }}
            />
          </div>
        )}

        {leftTab === 'result' && (
          <div>
            {proofreadingResult && proofreadingResult.success ? (
              <>
                <textarea
                  value={proofreadingResult.corrected_text}
                  readOnly
                  className="textarea"
                  rows={18}
                  style={{ fontSize: '12px', marginBottom: '0.75rem' }}
                />
                <button
                  onClick={() => downloadFile(proofreadingResult.corrected_text, `corrected_${generateTimestamp()}.txt`, 'text/plain')}
                  className="btn"
                  style={{ width: '100%', padding: '0.625rem', fontSize: '11px' }}
                >
                  📥 ダウンロード
                </button>
              </>
            ) : (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
                校正結果なし
              </p>
            )}
          </div>
        )}
      </div>

      {/* 言語 */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}
          className="select"
          style={{ fontSize: '11px', marginBottom: '0.5rem' }}
        >
          <option value="ja">🇯🇵 日本語</option>
          <option value="en">🇺🇸 English</option>
        </select>
        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
          {service === 'openai' ? 'OpenAI' : service === 'claude' ? 'Claude' : 'Gemini'} · {model}
        </p>
      </div>

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

      {/* エラー */}
      {(!canProofread || error) && (
        <p style={{ fontSize: '10px', color: '#dc2626', marginBottom: '0.75rem', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px' }}>
          {!canProofread ? 'APIキー未設定' : error}
        </p>
      )}

      <button
        onClick={handleProofread}
        disabled={!canProofread || isProofreading || !originalText.trim()}
        className="btn-primary"
        style={{ width: '100%', padding: '0.75rem', fontSize: '12px' }}
      >
        {isProofreading ? '校正中...' : '校正'}
      </button>

      {proofreadingResult && proofreadingResult.success && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {proofreadingResult.changes && proofreadingResult.changes.length > 0 && (
            <details className="card" style={{ overflow: 'hidden' }} open>
              <summary style={{ cursor: 'pointer', padding: '0.5rem 0.75rem', fontSize: '11px', fontWeight: 600 }}>
                修正 ({proofreadingResult.changes.length})
              </summary>
              <div style={{ padding: '0.75rem', maxHeight: '20rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {proofreadingResult.changes.map((change, index) => (
                  <div key={index} className="card" style={{ padding: '0.5rem' }}>
                    <p style={{ fontSize: '10px', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
                      {index + 1}. {change.type}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <div className="card" style={{ padding: '0.5rem', fontSize: '11px', borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.05)' }}>
                        {change.original}
                      </div>
                      <div className="card" style={{ padding: '0.5rem', fontSize: '11px', borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.05)' }}>
                        {change.corrected}
                      </div>
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{change.reason}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {proofreadingResult.suggestions && proofreadingResult.suggestions.length > 0 && (
            <details className="card" style={{ overflow: 'hidden' }}>
              <summary style={{ cursor: 'pointer', padding: '0.5rem 0.75rem', fontSize: '11px', fontWeight: 600 }}>
                提案 ({proofreadingResult.suggestions.length})
              </summary>
              <div style={{ padding: '0.75rem' }}>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {proofreadingResult.suggestions.map((suggestion, index) => (
                    <li key={index} style={{ display: 'flex', gap: '0.5rem', fontSize: '11px' }}>
                      <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                        {index + 1}.
                      </span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
        </div>
      )}

      {/* 固有名詞管理モーダル（ミニマル版） */}
      {showProperNounsModal && (
        <ProperNounsModalMinimal
          onClose={() => setShowProperNounsModal(false)}
          selectedProjectId={selectedProjectId}
        />
      )}
    </div>
  )
}
