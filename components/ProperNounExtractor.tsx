'use client'

import { useState, useRef, useCallback } from 'react'
import { 
  ExtractedProperNoun, 
  ProperNounCategory,
  ProperNounExtractionResult,
  ApiKeys,
  AIPreferences
} from '@/lib/types'

interface ProperNounExtractorProps {
  projectId: string
  apiKeys: ApiKeys
  aiPreferences?: AIPreferences
  existingNouns: ExtractedProperNoun[]
  scriptText?: string  // 脚本テキスト（MovieSubtitleTabから渡される）
  subtitleText?: string  // 字幕テキスト（MovieSubtitleTabから渡される）
  onNounsExtracted: (nouns: ExtractedProperNoun[]) => void
  onNounApproved: (noun: ExtractedProperNoun) => void
  onNounRemoved: (nounId: string) => void
}

// カテゴリのラベルと色
const CATEGORY_CONFIG: Record<ProperNounCategory, { label: string; color: string }> = {
  person: { label: '人名', color: '#3b82f6' },
  place: { label: '地名', color: '#10b981' },
  organization: { label: '組織名', color: '#f59e0b' },
  work: { label: '作品名', color: '#8b5cf6' },
  technical: { label: '専門用語', color: '#ec4899' },
  other: { label: 'その他', color: '#6b7280' },
}

export default function ProperNounExtractor({
  projectId,
  apiKeys,
  aiPreferences,
  existingNouns,
  scriptText,
  subtitleText,
  onNounsExtracted,
  onNounApproved,
  onNounRemoved,
}: ProperNounExtractorProps) {
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ProperNounCategory | 'all'>('all')
  const [showApprovedOnly, setShowApprovedOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [language, setLanguage] = useState<'en' | 'ja'>('ja')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 渡されたテキストから抽出
  const extractFromProvidedText = async (sourceType: 'script' | 'srt', text: string) => {
    if (!apiKeys.gemini) {
      setError('Gemini APIキーが設定されていません。設定画面でAPIキーを入力してください。')
      return
    }

    setIsExtracting(true)
    setError('')
    setExtractProgress(`Gemini AIで固有名詞を抽出中...`)

    try {
      const response = await fetch('/api/extract-proper-nouns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceType,
          language,
          existingTerms: existingNouns.map(n => n.term),
        }),
      })

      if (!response.ok) {
        throw new Error('抽出リクエストに失敗しました')
      }

      const result: ProperNounExtractionResult = await response.json()

      if (result.success && result.nouns.length > 0) {
        onNounsExtracted(result.nouns)
        setExtractProgress(`${result.nouns.length}件の固有名詞を抽出しました`)
      } else if (result.nouns.length === 0) {
        setExtractProgress('新しい固有名詞は見つかりませんでした')
      } else {
        throw new Error(result.error || '抽出に失敗しました')
      }
    } catch (err: any) {
      setError(err.message || '固有名詞の抽出に失敗しました')
    } finally {
      setIsExtracting(false)
    }
  }

  // ファイルを読み込んで抽出
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!apiKeys.gemini) {
      setError('Gemini APIキーが設定されていません。設定画面でAPIキーを入力してください。')
      return
    }

    setIsExtracting(true)
    setError('')
    setExtractProgress(`ファイルを読み込み中: ${file.name}`)

    try {
      const text = await file.text()
      
      // ファイルタイプを判定
      let sourceType: 'script' | 'srt' | 'transcription' = 'script'
      if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
        sourceType = 'srt'
      } else if (file.name.endsWith('.json')) {
        sourceType = 'transcription'
      }

      setExtractProgress(`Gemini AIで固有名詞を抽出中...`)

      const response = await fetch('/api/extract-proper-nouns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceType,
          language,
          existingNouns,
          apiKey: apiKeys.gemini,
          geminiModelLight: aiPreferences?.geminiModelLight,
        }),
      })

      const result: ProperNounExtractionResult = await response.json()

      if (!result.success) {
        throw new Error(result.error || '抽出に失敗しました')
      }

      setExtractProgress(
        `抽出完了: ${result.totalFound}件検出, ${result.newCount}件を新規追加, ${result.duplicateCount}件は既存と重複`
      )

      // 新規抽出された固有名詞を追加
      if (result.nouns.length > 0) {
        const nounsWithSource = result.nouns.map(noun => ({
          ...noun,
          sourceFile: file.name,
        }))
        onNounsExtracted(nounsWithSource)
      }

      // 3秒後にメッセージをクリア
      setTimeout(() => setExtractProgress(''), 5000)
    } catch (err: any) {
      console.error('Extraction error:', err)
      setError(err.message || '固有名詞抽出に失敗しました')
    } finally {
      setIsExtracting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [apiKeys.gemini, language, existingNouns, onNounsExtracted])

  // フィルタリング
  const filteredNouns = (existingNouns || []).filter(noun => {
    if (selectedCategory !== 'all' && noun.category !== selectedCategory) return false
    if (showApprovedOnly && !noun.approved) return false
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      return noun.term?.toLowerCase().includes(search) ||
             noun.reading?.toLowerCase().includes(search) ||
             (noun.variants || []).some(v => v.toLowerCase().includes(search))
    }
    return true
  })

  // 統計情報
  const stats = {
    total: existingNouns.length,
    approved: existingNouns.filter(n => n.approved).length,
    byCategory: Object.keys(CATEGORY_CONFIG).reduce((acc, cat) => {
      acc[cat as ProperNounCategory] = existingNouns.filter(n => n.category === cat).length
      return acc
    }, {} as Record<ProperNounCategory, number>),
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <h3 style={{ 
        fontSize: '14px', 
        fontWeight: 600, 
        color: 'var(--text)',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        📚 固有名詞抽出・管理
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 400, 
          color: 'var(--text-muted)' 
        }}>
          ({stats.approved}/{stats.total} 承認済)
        </span>
      </h3>

      {/* ファイルアップロード */}
      <div style={{ 
        padding: '0.75rem',
        backgroundColor: 'rgba(139, 92, 246, 0.05)',
        borderRadius: '8px',
        marginBottom: '1rem',
        border: '1px solid rgba(139, 92, 246, 0.2)'
      }}>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '0.5rem', 
          alignItems: 'center',
          marginBottom: '0.5rem'
        }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".txt,.srt,.vtt,.json,.docx"
            style={{ display: 'none' }}
            disabled={isExtracting}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn"
            style={{ padding: '0.5rem 1rem', fontSize: '11px' }}
            disabled={isExtracting || !apiKeys.gemini}
          >
            {isExtracting ? '🔄 抽出中...' : '📄 ファイルから抽出'}
          </button>
          
          {scriptText && (
            <button
              onClick={() => extractFromProvidedText('script', scriptText)}
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '11px' }}
              disabled={isExtracting || !apiKeys.gemini}
            >
              📜 脚本から抽出
            </button>
          )}
          
          {subtitleText && (
            <button
              onClick={() => extractFromProvidedText('srt', subtitleText)}
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '11px' }}
              disabled={isExtracting || !apiKeys.gemini}
            >
              🎬 字幕から抽出
            </button>
          )}
          
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'en' | 'ja')}
            className="input"
            style={{ fontSize: '11px', padding: '0.375rem', width: '80px' }}
            disabled={isExtracting}
          >
            <option value="ja">日本語</option>
            <option value="en">英語</option>
          </select>

          {!apiKeys.gemini && (
            <span style={{ fontSize: '10px', color: '#dc2626' }}>
              ※ Gemini APIキーが必要です
            </span>
          )}
        </div>

        {/* インポート済みデータの表示 */}
        {(scriptText || subtitleText) && (
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            marginTop: '0.5rem',
            flexWrap: 'wrap'
          }}>
            {scriptText && (
              <span style={{ 
                fontSize: '10px', 
                padding: '0.25rem 0.5rem',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                color: 'rgb(34, 197, 94)',
                borderRadius: '4px'
              }}>
                📜 脚本読込済 ({scriptText.length.toLocaleString()}文字)
              </span>
            )}
            {subtitleText && (
              <span style={{ 
                fontSize: '10px', 
                padding: '0.25rem 0.5rem',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: 'rgb(59, 130, 246)',
                borderRadius: '4px'
              }}>
                🎬 字幕読込済 ({subtitleText.length.toLocaleString()}文字)
              </span>
            )}
          </div>
        )}

        <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
          対応形式: 脚本(.txt)、字幕(.srt, .vtt)、書き起こし結果(.json)
        </p>

        {extractProgress && (
          <p style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '0.5rem', marginBottom: 0 }}>
            {extractProgress}
          </p>
        )}
      </div>

      {error && (
        <p style={{ 
          fontSize: '11px', 
          color: '#dc2626', 
          padding: '0.5rem', 
          backgroundColor: '#fef2f2', 
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {error}
        </p>
      )}

      {/* フィルター・検索 */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '0.5rem', 
        marginBottom: '1rem',
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="検索..."
          className="input"
          style={{ flex: 1, minWidth: '120px', fontSize: '11px', padding: '0.375rem 0.5rem' }}
        />
        
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as ProperNounCategory | 'all')}
          className="input"
          style={{ fontSize: '11px', padding: '0.375rem', width: '100px' }}
        >
          <option value="all">全カテゴリ</option>
          {Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label} ({stats.byCategory[key as ProperNounCategory] || 0})
            </option>
          ))}
        </select>

        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.25rem', 
          fontSize: '10px', 
          color: 'var(--text-muted)' 
        }}>
          <input
            type="checkbox"
            checked={showApprovedOnly}
            onChange={(e) => setShowApprovedOnly(e.target.checked)}
          />
          承認済のみ
        </label>
      </div>

      {/* カテゴリ別バッジ */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '0.375rem', 
        marginBottom: '1rem' 
      }}>
        {Object.entries(CATEGORY_CONFIG).map(([key, { label, color }]) => {
          const count = stats.byCategory[key as ProperNounCategory] || 0
          if (count === 0) return null
          return (
            <span
              key={key}
              style={{
                padding: '0.125rem 0.5rem',
                fontSize: '10px',
                backgroundColor: `${color}20`,
                color: color,
                borderRadius: '10px',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedCategory(key as ProperNounCategory)}
            >
              {label}: {count}
            </span>
          )
        })}
      </div>

      {/* 固有名詞リスト */}
      <div style={{ 
        maxHeight: '400px', 
        overflowY: 'auto',
        border: '1px solid var(--border)',
        borderRadius: '6px'
      }}>
        {filteredNouns.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            {existingNouns.length === 0 
              ? 'ファイルをアップロードして固有名詞を抽出してください'
              : 'フィルター条件に一致する固有名詞がありません'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>用語</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600, width: '70px' }}>カテゴリ</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600, width: '80px' }}>読み</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, width: '50px' }}>信頼度</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, width: '80px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredNouns.map((noun) => {
                const catConfig = CATEGORY_CONFIG[noun.category]
                return (
                  <tr 
                    key={noun.id}
                    style={{ 
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: noun.approved ? 'rgba(34, 197, 94, 0.05)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 500 }}>{noun.term}</div>
                      {noun.variants.length > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          別表記: {noun.variants.join(', ')}
                        </div>
                      )}
                      {noun.context && (
                        <div style={{ 
                          fontSize: '9px', 
                          color: 'var(--text-muted)',
                          marginTop: '0.25rem',
                          fontStyle: 'italic'
                        }}>
                          "{noun.context}"
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        fontSize: '9px',
                        backgroundColor: `${catConfig.color}20`,
                        color: catConfig.color,
                        borderRadius: '3px',
                      }}>
                        {catConfig.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                      {noun.reading || '-'}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <span style={{
                        color: noun.confidence >= 0.8 ? '#10b981' : 
                               noun.confidence >= 0.5 ? '#f59e0b' : '#ef4444'
                      }}>
                        {Math.round(noun.confidence * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => onNounApproved({ ...noun, approved: !noun.approved })}
                          style={{
                            padding: '0.125rem 0.375rem',
                            fontSize: '10px',
                            backgroundColor: noun.approved ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                            color: noun.approved ? '#10b981' : 'var(--text-muted)',
                            border: `1px solid ${noun.approved ? '#10b981' : 'var(--border)'}`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                          title={noun.approved ? '承認取り消し' : '承認'}
                        >
                          {noun.approved ? '✓' : '○'}
                        </button>
                        <button
                          onClick={() => onNounRemoved(noun.id)}
                          style={{
                            padding: '0.125rem 0.375rem',
                            fontSize: '10px',
                            backgroundColor: 'transparent',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 一括操作 */}
      {existingNouns.length > 0 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border)'
        }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {filteredNouns.length}件表示中 / 全{existingNouns.length}件
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                const unApproved = existingNouns.filter(n => !n.approved && n.confidence >= 0.8)
                unApproved.forEach(n => onNounApproved({ ...n, approved: true }))
              }}
              className="btn"
              style={{ padding: '0.375rem 0.75rem', fontSize: '10px' }}
            >
              高信頼度を一括承認
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

