'use client'

import { useState, useEffect } from 'react'
import { ApiKeys, ProofreadingResult, AIPreferences, TranscriptionResult } from '@/lib/types'
import { downloadFile, generateTimestamp, splitTextIntoChunks } from '@/lib/utils'
import ProperNounsModalMinimal from './ProperNounsModalMinimal'
import ProjectSelectorCard from './common/ProjectSelectorCard'
import FileUploadSection from './common/FileUploadSection'
import ProgressBar from './common/ProgressBar'
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
    : (aiPreferences.geminiModelTranslate || aiPreferences.geminiModel)
  const includeProperNouns = true  // 常に固有名詞を参照

  const [language, setLanguage] = useState<'ja' | 'en'>('ja')
  const [isProofreading, setIsProofreading] = useState(false)
  const [error, setError] = useState('')
  const [leftTab, setLeftTab] = useState<'original' | 'result'>('original')
  const [originalText, setOriginalText] = useState(transcriptionResult?.text || '')
  const [fileUploadError, setFileUploadError] = useState('')
  const [showProperNounsModal, setShowProperNounsModal] = useState(false)

  // チャンク処理用の進捗管理
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 })
  const [isChunkedProcessing, setIsChunkedProcessing] = useState(false)

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

  // フォールバック通知用state
  const [fallbackInfo, setFallbackInfo] = useState<{ used: boolean; originalModel?: string; actualModel?: string; reason?: string } | null>(null)

  // 単一チャンクの校正処理
  const proofreadSingleChunk = async (text: string): Promise<{ correctedText: string; fallback?: { used: boolean; originalModel?: string; actualModel?: string; reason?: string } }> => {
    const apiKey = service === 'openai' ? apiKeys.openai : service === 'claude' ? apiKeys.claude : apiKeys.gemini

    const response = await fetch('/api/proofread', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        service,
        model,
        language,
        includeProperNouns,
        customContext: customContext.trim(),
        apiKey,
      }),
    })

    if (!response.ok) {
      // レスポンスがJSONでない場合（HTMLエラーページなど）を処理
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json()
        // クォータ制限エラーの場合、より詳細なメッセージを表示
        const errorMessage = errorData.error || '校正に失敗しました'
        if (errorMessage.includes('クォータ') || errorMessage.includes('quota') || errorMessage.includes('429')) {
          throw new Error(`${errorMessage}\n\n💡 ヒント: 設定画面で🆓無料モデル（Gemini 2.0 Flash）に切り替えてみてください。`)
        }
        throw new Error(errorMessage)
      } else {
        // HTMLエラーページの場合
        const responseText = await response.text()
        if (responseText.includes('Request Entity Too Large') || responseText.includes('413')) {
          throw new Error('チャンクが大きすぎます')
        }
        throw new Error(`校正に失敗しました (HTTP ${response.status})`)
      }
    }

    const result = await response.json()
    
    // フォールバック情報があれば返す
    if (result.fallbackUsed) {
      return {
        correctedText: result.corrected_text || text,
        fallback: {
          used: true,
          originalModel: result.originalModel,
          actualModel: result.model,
          reason: result.fallbackReason,
        }
      }
    }
    
    return { correctedText: result.corrected_text || text }
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
    setFallbackInfo(null)
    setIsChunkedProcessing(false)

    try {
      // 追加ペイロードを定義
      const additionalPayload = {
        service,
        model,
        language,
        includeProperNouns,
        customContext: customContext.trim(),
        apiKey,
      }

      // テキストをチャンクに分割
      const chunks = splitTextIntoChunks(originalText, 3.5 * 1024 * 1024, additionalPayload)

      console.log(`テキストを${chunks.length}個のチャンクに分割しました`)

      // チャンクが1つだけの場合は通常処理
      if (chunks.length === 1) {
        const result = await proofreadSingleChunk(originalText)
        
        // フォールバック情報があれば保存
        if (result.fallback?.used) {
          setFallbackInfo(result.fallback)
        }
        
        setProofreadingResult({
          success: true,
          corrected_text: result.correctedText,
          changes: [],
          suggestions: [],
          service,
          model: result.fallback?.actualModel || model,
          fallbackUsed: result.fallback?.used,
          originalModel: result.fallback?.originalModel,
          fallbackReason: result.fallback?.reason,
        })
        setLeftTab('result')
      } else {
        // 複数チャンクの場合はチャンク処理
        setIsChunkedProcessing(true)
        setProcessingProgress({ current: 0, total: chunks.length })

        const correctedChunks: string[] = []
        let lastFallback: typeof fallbackInfo = null

        for (let i = 0; i < chunks.length; i++) {
          setProcessingProgress({ current: i + 1, total: chunks.length })

          const result = await proofreadSingleChunk(chunks[i].text)
          correctedChunks.push(result.correctedText)
          
          // フォールバック情報を記録
          if (result.fallback?.used) {
            lastFallback = result.fallback
          }

          // 少し待機（APIレート制限対策）
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }

        // フォールバック情報があれば保存
        if (lastFallback) {
          setFallbackInfo(lastFallback)
        }

        // チャンクを結合
        const finalText = correctedChunks.join('\n\n')

        setProofreadingResult({
          success: true,
          corrected_text: finalText,
          changes: [],
          suggestions: [],
          service,
          model: lastFallback?.actualModel || model,
          fallbackUsed: lastFallback?.used,
          originalModel: lastFallback?.originalModel,
          fallbackReason: lastFallback?.reason,
        })
        setLeftTab('result')
        setIsChunkedProcessing(false)
      }
    } catch (err: any) {
      setError(err.message || '校正中にエラーが発生しました')
      setIsChunkedProcessing(false)
    } finally {
      setIsProofreading(false)
      setProcessingProgress({ current: 0, total: 0 })
    }
  }

  const canProofread = service === 'openai' ? apiKeys.openai : service === 'claude' ? apiKeys.claude : apiKeys.gemini

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* テキスト */}
      <div className="card" style={{ padding: '1rem' }}>
        {/* タブ */}
        <div style={{ display: 'flex', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', marginBottom: '1rem' }}>
          <button
            onClick={() => setLeftTab('original')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '11px',
              fontWeight: 600,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: leftTab === 'original' ? '2px solid var(--accent)' : '2px solid transparent',
              color: leftTab === 'original' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
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
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: leftTab === 'result' ? '2px solid var(--accent)' : '2px solid transparent',
              color: leftTab === 'result' ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
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
                {/* フォールバック使用時のインジケーター */}
                {proofreadingResult.fallbackUsed && (
                  <div style={{ 
                    fontSize: '10px', 
                    padding: '0.5rem 0.75rem', 
                    backgroundColor: 'rgba(34, 197, 94, 0.1)', 
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span style={{ color: 'rgb(34, 197, 94)' }}>✓</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {proofreadingResult.originalModel} の代わりに {proofreadingResult.model} で校正
                    </span>
                  </div>
                )}
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

      {/* フォールバック通知 */}
      {fallbackInfo?.used && (
        <div style={{ 
          fontSize: '11px', 
          padding: '0.75rem', 
          backgroundColor: 'rgba(34, 197, 94, 0.1)', 
          borderRadius: '6px',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          marginBottom: '0.5rem'
        }}>
          <p style={{ fontWeight: 600, color: 'rgb(34, 197, 94)', marginBottom: '0.25rem' }}>
            ✓ 別モデルで校正完了
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {fallbackInfo.originalModel} → {fallbackInfo.actualModel}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '0.25rem' }}>
            {fallbackInfo.reason || 'クォータ制限のため自動的に別モデルを使用しました'}
          </p>
        </div>
      )}

      {/* エラー */}
      {(!canProofread || error) && (
        <div style={{ 
          fontSize: '10px', 
          color: '#dc2626', 
          marginBottom: '0.75rem', 
          padding: '0.75rem', 
          backgroundColor: '#fef2f2', 
          borderRadius: '6px',
          border: '1px solid rgba(220, 38, 38, 0.2)',
          whiteSpace: 'pre-wrap'
        }}>
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            {!canProofread ? '⚠️ APIキー未設定' : '❌ エラー'}
          </p>
          <p>{!canProofread ? `${service === 'openai' ? 'OpenAI' : service === 'claude' ? 'Claude' : 'Google Gemini'} APIキーを設定してください` : error}</p>
        </div>
      )}

      {/* 進捗バー（チャンク処理中のみ表示） */}
      {isChunkedProcessing && processingProgress.total > 0 && (
        <div className="card" style={{ padding: '0' }}>
          <ProgressBar
            current={processingProgress.current}
            total={processingProgress.total}
            label="大きなテキストを分割処理中..."
          />
        </div>
      )}

      <button
        onClick={handleProofread}
        disabled={!canProofread || isProofreading || !originalText.trim()}
        className="btn-primary"
        style={{ width: '100%', padding: '0.75rem', fontSize: '12px' }}
      >
        {isProofreading ? (isChunkedProcessing ? `校正中 (${processingProgress.current}/${processingProgress.total})...` : '校正中...') : '校正'}
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
