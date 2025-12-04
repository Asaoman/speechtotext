'use client'

import { useState, useEffect } from 'react'
import { MovieSettings as MovieSettingsType, MovieGenre, EraSetting, TargetAudience, TranslationStyle } from '@/lib/types'

interface MovieSettingsProps {
  projectId: string
  settings: MovieSettingsType | null
  onSettingsChange: (settings: MovieSettingsType) => void
}

// ジャンル表示名
const GENRE_LABELS: Record<MovieGenre, string> = {
  action: 'アクション',
  comedy: 'コメディ',
  drama: 'ドラマ',
  horror: 'ホラー',
  romance: 'ロマンス',
  'sci-fi': 'SF',
  fantasy: 'ファンタジー',
  thriller: 'スリラー',
  documentary: 'ドキュメンタリー',
  animation: 'アニメーション',
  musical: 'ミュージカル',
  western: '西部劇',
  crime: '犯罪',
  mystery: 'ミステリー',
  war: '戦争',
  historical: '歴史'
}

// 時代設定表示名
const ERA_LABELS: Record<EraSetting, string> = {
  ancient: '古代',
  medieval: '中世',
  edo: '江戸時代',
  meiji: '明治〜大正',
  showa_early: '昭和初期',
  showa_late: '昭和後期',
  modern: '現代',
  near_future: '近未来',
  far_future: '遠未来',
  fantasy: 'ファンタジー世界',
  custom: 'カスタム'
}

// ターゲット視聴者表示名
const AUDIENCE_LABELS: Record<TargetAudience, string> = {
  all_ages: '全年齢',
  children: '子供向け',
  teens: '青少年向け',
  young_adult: 'ヤングアダルト',
  adult: '成人向け',
  mature: 'R指定'
}

// 翻訳スタイル表示名
const STYLE_LABELS: Record<TranslationStyle, string> = {
  subtitle: '字幕翻訳調（簡潔）',
  natural: '自然な会話調',
  literary: '文学的',
  localized: 'ローカライズ重視',
  faithful: '原文忠実'
}

// デフォルト設定
const getDefaultSettings = (projectId: string): MovieSettingsType => ({
  id: `movie_${Date.now()}`,
  projectId,
  title: '',
  originalLanguage: 'en',
  targetLanguage: 'ja',
  genres: [],
  eraSetting: 'modern',
  targetAudience: 'all_ages',
  translationStyle: 'natural',
  toneDescription: '',
  specialInstructions: '',
  glossary: {}
})

export default function MovieSettings({ projectId, settings, onSettingsChange }: MovieSettingsProps) {
  const [localSettings, setLocalSettings] = useState<MovieSettingsType>(
    settings || getDefaultSettings(projectId)
  )
  const [showGlossary, setShowGlossary] = useState(false)
  const [newGlossaryTerm, setNewGlossaryTerm] = useState('')
  const [newGlossaryTranslation, setNewGlossaryTranslation] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings)
    } else {
      setLocalSettings(getDefaultSettings(projectId))
    }
  }, [settings, projectId])

  const handleChange = (field: keyof MovieSettingsType, value: any) => {
    const updated = { ...localSettings, [field]: value, updated_at: new Date().toISOString() }
    setLocalSettings(updated)
    onSettingsChange(updated)
  }

  const toggleGenre = (genre: MovieGenre) => {
    const currentGenres = localSettings.genres || []
    const newGenres = currentGenres.includes(genre)
      ? currentGenres.filter(g => g !== genre)
      : [...currentGenres, genre]
    handleChange('genres', newGenres)
  }

  const addGlossaryEntry = () => {
    if (newGlossaryTerm.trim() && newGlossaryTranslation.trim()) {
      const newGlossary = {
        ...localSettings.glossary,
        [newGlossaryTerm.trim()]: newGlossaryTranslation.trim()
      }
      handleChange('glossary', newGlossary)
      setNewGlossaryTerm('')
      setNewGlossaryTranslation('')
    }
  }

  const removeGlossaryEntry = (term: string) => {
    const newGlossary = { ...localSettings.glossary }
    delete newGlossary[term]
    handleChange('glossary', newGlossary)
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: isExpanded ? '1rem' : 0,
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          🎬 作品設定
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 作品タイトル */}
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              作品タイトル
            </label>
            <input
              type="text"
              value={localSettings.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="input"
              style={{ fontSize: '12px' }}
              placeholder="例: The Matrix / マトリックス"
            />
          </div>

          {/* 言語設定 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                原語
              </label>
              <select
                value={localSettings.originalLanguage}
                onChange={(e) => handleChange('originalLanguage', e.target.value)}
                className="input"
                style={{ fontSize: '12px' }}
              >
                <option value="en">英語</option>
                <option value="ja">日本語</option>
                <option value="other">その他</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                翻訳先
              </label>
              <select
                value={localSettings.targetLanguage}
                onChange={(e) => handleChange('targetLanguage', e.target.value as 'en' | 'ja')}
                className="input"
                style={{ fontSize: '12px' }}
              >
                <option value="ja">日本語</option>
                <option value="en">英語</option>
              </select>
            </div>
          </div>

          {/* ジャンル選択 */}
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
              ジャンル（複数選択可）
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {(Object.keys(GENRE_LABELS) as MovieGenre[]).map(genre => (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className={localSettings.genres?.includes(genre) ? 'btn-primary' : 'btn'}
                  style={{ 
                    padding: '0.25rem 0.5rem', 
                    fontSize: '10px',
                    opacity: localSettings.genres?.includes(genre) ? 1 : 0.7
                  }}
                >
                  {GENRE_LABELS[genre]}
                </button>
              ))}
            </div>
          </div>

          {/* 時代設定 */}
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              時代設定
            </label>
            <select
              value={localSettings.eraSetting}
              onChange={(e) => handleChange('eraSetting', e.target.value)}
              className="input"
              style={{ fontSize: '12px' }}
            >
              {(Object.keys(ERA_LABELS) as EraSetting[]).map(era => (
                <option key={era} value={era}>{ERA_LABELS[era]}</option>
              ))}
            </select>
          </div>

          {/* ターゲット視聴者・翻訳スタイル */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                ターゲット視聴者
              </label>
              <select
                value={localSettings.targetAudience}
                onChange={(e) => handleChange('targetAudience', e.target.value)}
                className="input"
                style={{ fontSize: '12px' }}
              >
                {(Object.keys(AUDIENCE_LABELS) as TargetAudience[]).map(audience => (
                  <option key={audience} value={audience}>{AUDIENCE_LABELS[audience]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                翻訳スタイル
              </label>
              <select
                value={localSettings.translationStyle}
                onChange={(e) => handleChange('translationStyle', e.target.value)}
                className="input"
                style={{ fontSize: '12px' }}
              >
                {(Object.keys(STYLE_LABELS) as TranslationStyle[]).map(style => (
                  <option key={style} value={style}>{STYLE_LABELS[style]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* トーン説明 */}
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              作品のトーン・雰囲気
            </label>
            <textarea
              value={localSettings.toneDescription}
              onChange={(e) => handleChange('toneDescription', e.target.value)}
              className="textarea"
              rows={2}
              style={{ fontSize: '12px' }}
              placeholder="例: ダークでシリアスな雰囲気。時折ブラックユーモアが混じる。"
            />
          </div>

          {/* 特別な翻訳指示 */}
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              特別な翻訳指示
            </label>
            <textarea
              value={localSettings.specialInstructions}
              onChange={(e) => handleChange('specialInstructions', e.target.value)}
              className="textarea"
              rows={2}
              style={{ fontSize: '12px' }}
              placeholder="例: 主人公の名前「Neo」はカタカナ「ネオ」で統一。専門用語は原語のままルビを付ける。"
            />
          </div>

          {/* 用語集 */}
          <div>
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '0.5rem'
              }}
            >
              <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                用語集（原語 → 訳語）
              </label>
              <button
                onClick={() => setShowGlossary(!showGlossary)}
                className="btn"
                style={{ padding: '0.25rem 0.5rem', fontSize: '10px' }}
              >
                {showGlossary ? '閉じる' : `${Object.keys(localSettings.glossary || {}).length}件 編集`}
              </button>
            </div>

            {showGlossary && (
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: 'var(--bg-subtle)', 
                borderRadius: '4px',
                border: '1px solid var(--border)'
              }}>
                {/* 新規追加 */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    value={newGlossaryTerm}
                    onChange={(e) => setNewGlossaryTerm(e.target.value)}
                    className="input"
                    style={{ fontSize: '11px', flex: 1 }}
                    placeholder="原語"
                  />
                  <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>→</span>
                  <input
                    type="text"
                    value={newGlossaryTranslation}
                    onChange={(e) => setNewGlossaryTranslation(e.target.value)}
                    className="input"
                    style={{ fontSize: '11px', flex: 1 }}
                    placeholder="訳語"
                    onKeyPress={(e) => e.key === 'Enter' && addGlossaryEntry()}
                  />
                  <button
                    onClick={addGlossaryEntry}
                    className="btn"
                    style={{ padding: '0.375rem 0.5rem', fontSize: '10px' }}
                  >
                    追加
                  </button>
                </div>

                {/* 登録済み用語 */}
                {Object.keys(localSettings.glossary || {}).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {Object.entries(localSettings.glossary || {}).map(([term, translation]) => (
                      <div
                        key={term}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.5rem',
                          backgroundColor: 'var(--bg)',
                          borderRadius: '4px',
                          fontSize: '11px'
                        }}
                      >
                        <span style={{ flex: 1, color: 'var(--text)' }}>{term}</span>
                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                        <span style={{ flex: 1, color: 'var(--accent)' }}>{translation}</span>
                        <button
                          onClick={() => removeGlossaryEntry(term)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            cursor: 'pointer', 
                            color: 'var(--text-muted)',
                            fontSize: '10px'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>
                    用語が登録されていません
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 設定サマリー */}
          <div style={{ 
            padding: '0.75rem', 
            backgroundColor: 'rgba(250, 204, 21, 0.1)', 
            borderRadius: '4px',
            border: '1px solid var(--accent)'
          }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.5rem' }}>
              📋 設定サマリー
            </p>
            <p style={{ fontSize: '10px', color: 'var(--text)', lineHeight: 1.6 }}>
              {localSettings.originalLanguage === 'en' ? '英語' : '日本語'} → {localSettings.targetLanguage === 'ja' ? '日本語' : '英語'}
              {localSettings.genres && localSettings.genres.length > 0 && (
                <> · {localSettings.genres.map(g => GENRE_LABELS[g]).join('/')}</>
              )}
              {localSettings.eraSetting && (
                <> · {ERA_LABELS[localSettings.eraSetting]}</>
              )}
              <> · {STYLE_LABELS[localSettings.translationStyle]}</>
              {Object.keys(localSettings.glossary || {}).length > 0 && (
                <> · 用語集 {Object.keys(localSettings.glossary || {}).length}件</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

