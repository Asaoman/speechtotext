'use client'

import { useState } from 'react'
import { ApiKeys, SubtitleSettings, AIPreferences } from '@/lib/types'
import { DEFAULT_SUBTITLE_SETTINGS, DEFAULT_AI_PREFERENCES } from '@/lib/utils'

// モデル情報（料金含む）
const OPENAI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', price: '$0.15/$0.60 per 1M tokens', recommended: true, description: '最もコスパが良い' },
  { value: 'gpt-4o', label: 'GPT-4o', price: '$2.50/$10.00 per 1M tokens', recommended: false, description: '高性能バランス型' },
  { value: 'gpt-5', label: 'GPT-5', price: '高額（詳細未公開）', recommended: false, description: '最新・最高性能' },
  { value: 'o1-preview', label: 'o1-preview', price: '$15.00/$60.00 per 1M tokens', recommended: false, description: '推論特化・高額' },
  { value: 'o1-mini', label: 'o1-mini', price: '$3.00/$12.00 per 1M tokens', recommended: false, description: '推論特化・高速' },
]

const CLAUDE_MODELS = [
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', price: '$3.00/$15.00 per 1M tokens', recommended: true, description: 'バランス型・推奨' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (Sonnet 4.5)', price: '$3.00/$15.00 per 1M tokens', recommended: false, description: '最新・高性能' },
  { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (旧)', price: '$3.00/$15.00 per 1M tokens', recommended: false, description: '旧バージョン' },
]

const GEMINI_MODELS = [
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', price: '$0.075/$0.30 per 1M tokens', recommended: true, description: '最安・最もコスパが良い' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', price: '$1.25/$5.00 per 1M tokens', recommended: false, description: '高性能・中価格' },
  { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Experimental', price: '実験版（料金変動あり）', recommended: false, description: '最新・実験版' },
  { value: 'gemini-exp-1206', label: 'Gemini Experimental 1206', price: '実験版（料金変動あり）', recommended: false, description: '実験版' },
]

interface SettingsModalProps {
  apiKeys: ApiKeys
  subtitleSettings: SubtitleSettings
  aiPreferences: AIPreferences
  onSaveApiKeys: (keys: ApiKeys) => void
  onSaveSubtitleSettings: (settings: SubtitleSettings) => void
  onSaveAIPreferences: (prefs: AIPreferences) => void
  onClose: () => void
}

export default function SettingsModal({ apiKeys, subtitleSettings, aiPreferences, onSaveApiKeys, onSaveSubtitleSettings, onSaveAIPreferences, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'subtitle'>('api')

  // API Keys state
  const [elevenlabsKey, setElevenlabsKey] = useState(apiKeys.elevenlabs || '')
  const [openaiKey, setOpenaiKey] = useState(apiKeys.openai || '')
  const [claudeKey, setClaudeKey] = useState(apiKeys.claude || '')
  const [geminiKey, setGeminiKey] = useState(apiKeys.gemini || '')

  // AI Preferences state
  const [defaultService, setDefaultService] = useState<'openai' | 'claude' | 'gemini'>(aiPreferences.defaultService)
  const [openaiModel, setOpenaiModel] = useState(aiPreferences.openaiModel)
  const [claudeModel, setClaudeModel] = useState(aiPreferences.claudeModel)
  const [geminiModel, setGeminiModel] = useState(aiPreferences.geminiModel)

  // Subtitle Settings state
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'ja'>(subtitleSettings.currentLanguage)
  const [enSettings, setEnSettings] = useState(subtitleSettings.en)
  const [jaSettings, setJaSettings] = useState(subtitleSettings.ja)

  const handleSaveApiKeys = () => {
    onSaveApiKeys({
      elevenlabs: elevenlabsKey,
      openai: openaiKey,
      claude: claudeKey,
      gemini: geminiKey,
    })
  }

  const handleSaveSubtitleSettings = () => {
    onSaveSubtitleSettings({
      currentLanguage,
      en: enSettings,
      ja: jaSettings,
      lineBreakService: aiPreferences.defaultService === 'openai' ? 'chatgpt' : aiPreferences.defaultService,
    })
  }

  const handleSaveAIPreferences = () => {
    onSaveAIPreferences({
      defaultService,
      openaiModel,
      claudeModel,
      geminiModel,
    })
  }

  const handleSaveAll = () => {
    handleSaveApiKeys()
    handleSaveSubtitleSettings()
    handleSaveAIPreferences()
    onClose()
  }

  return (
    <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>
      <div className="card" style={{ maxWidth: '50rem', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>設定</h2>
            <button
              onClick={onClose}
              className="btn"
              style={{ padding: '0.25rem 0.5rem' }}
            >
              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* タブ */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setActiveTab('api')}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '13px',
                fontWeight: 600,
                borderBottom: activeTab === 'api' ? '2px solid var(--accent)' : 'none',
                color: activeTab === 'api' ? 'var(--accent)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              APIキー
            </button>
            <button
              onClick={() => setActiveTab('subtitle')}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '13px',
                fontWeight: 600,
                borderBottom: activeTab === 'subtitle' ? '2px solid var(--accent)' : 'none',
                color: activeTab === 'subtitle' ? 'var(--accent)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              字幕設定
            </button>
          </div>

          {/* APIキータブ */}
          {activeTab === 'api' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.75rem' }}>文字起こし用API</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="card" style={{ padding: '1rem' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                      OpenAI Whisper APIキー
                    </label>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      className="input"
                      placeholder="sk-..."
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      OpenAI Whisper APIキーを入力してください
                    </p>
                  </div>

                  <div className="card" style={{ padding: '1rem' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                      ElevenLabs Scribe APIキー
                    </label>
                    <input
                      type="password"
                      value={elevenlabsKey}
                      onChange={(e) => setElevenlabsKey(e.target.value)}
                      className="input"
                      placeholder="ElevenLabs APIキー"
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      ElevenLabs ScribeのAPIキーを入力してください
                    </p>
                  </div>
                </div>
              </div>

              <hr style={{ borderColor: 'var(--border)' }} />

              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '1rem' }}>校正・AI機能用API</h3>

                {/* デフォルトAIサービス選択 */}
                <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', backgroundColor: 'rgba(250, 204, 21, 0.08)', borderColor: 'var(--accent)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.75rem' }}>
                    デフォルトAIサービス
                  </label>
                  <select
                    value={defaultService}
                    onChange={(e) => setDefaultService(e.target.value as 'openai' | 'claude' | 'gemini')}
                    className="select"
                    style={{ fontSize: '12px' }}
                  >
                    <option value="gemini">Google Gemini（最もコスパが良い）</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                  </select>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    校正機能と字幕の改行最適化でデフォルトで使用するAIサービスを選択してください
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Google Gemini */}
                  <div className="card" style={{
                    padding: '0.75rem',
                    borderColor: defaultService === 'gemini' ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: defaultService === 'gemini' ? 'rgba(250, 204, 21, 0.08)' : 'transparent'
                  }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                      Google Gemini APIキー {defaultService === 'gemini' && <span style={{ fontSize: '9px', color: 'var(--accent)' }}>（デフォルト）</span>}
                    </label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="input"
                      placeholder="AI..."
                      style={{ marginBottom: '0.5rem', fontSize: '11px' }}
                    />
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="select"
                      style={{ fontSize: '11px' }}
                    >
                      {GEMINI_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label} {model.recommended ? '（推奨）' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* OpenAI */}
                  <div className="card" style={{
                    padding: '0.75rem',
                    borderColor: defaultService === 'openai' ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: defaultService === 'openai' ? 'rgba(250, 204, 21, 0.08)' : 'transparent'
                  }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                      OpenAI APIキー {defaultService === 'openai' && <span style={{ fontSize: '9px', color: 'var(--accent)' }}>（デフォルト）</span>}
                    </label>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      className="input"
                      placeholder="sk-..."
                      style={{ marginBottom: '0.5rem', fontSize: '11px' }}
                    />
                    <select
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      className="select"
                      style={{ fontSize: '11px' }}
                    >
                      {OPENAI_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label} {model.recommended ? '（推奨）' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Claude */}
                  <div className="card" style={{
                    padding: '0.75rem',
                    borderColor: defaultService === 'claude' ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: defaultService === 'claude' ? 'rgba(250, 204, 21, 0.08)' : 'transparent'
                  }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                      Claude APIキー {defaultService === 'claude' && <span style={{ fontSize: '9px', color: 'var(--accent)' }}>（デフォルト）</span>}
                    </label>
                    <input
                      type="password"
                      value={claudeKey}
                      onChange={(e) => setClaudeKey(e.target.value)}
                      className="input"
                      placeholder="sk-ant-..."
                      style={{ marginBottom: '0.5rem', fontSize: '11px' }}
                    />
                    <select
                      value={claudeModel}
                      onChange={(e) => setClaudeModel(e.target.value)}
                      className="select"
                      style={{ fontSize: '11px' }}
                    >
                      {CLAUDE_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label} {model.recommended ? '（推奨）' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 字幕設定タブ */}
          {activeTab === 'subtitle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '1rem', color: 'var(--accent)' }}>字幕生成設定</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  映画フォーマットに最適化された字幕を生成します。ガイドラインに基づくデフォルト値が設定されています。
                </p>

                {/* 現在の言語選択 */}
                <div className="card" style={{ padding: '1rem', marginBottom: '1rem', backgroundColor: 'rgba(250, 204, 21, 0.08)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                    現在の字幕生成言語
                  </label>
                  <select
                    value={currentLanguage}
                    onChange={(e) => setCurrentLanguage(e.target.value as 'en' | 'ja')}
                    className="select"
                  >
                    <option value="en">🇺🇸 English</option>
                    <option value="ja">🇯🇵 日本語</option>
                  </select>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    字幕生成時にこの言語設定が使用されます。両方の設定を保存できます。
                  </p>
                </div>

                {/* 英語設定 */}
                <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: currentLanguage === 'en' ? 'var(--accent)' : 'var(--border)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1rem', color: currentLanguage === 'en' ? 'var(--accent)' : 'var(--text)' }}>
                    🇺🇸 English（英語字幕設定）
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                        最大文字数/行: <span style={{ color: 'var(--accent)' }}>{enSettings.maxCharsPerLine}</span>
                      </label>
                      <input
                        type="range"
                        value={enSettings.maxCharsPerLine}
                        onChange={(e) => setEnSettings({ ...enSettings, maxCharsPerLine: parseInt(e.target.value) })}
                        min="20"
                        max="60"
                        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        <span>20</span>
                        <span>推奨: 42</span>
                        <span>60</span>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                        最大行数
                      </label>
                      <select
                        value={enSettings.maxLines}
                        onChange={(e) => setEnSettings({ ...enSettings, maxLines: parseInt(e.target.value) })}
                        className="select"
                        style={{ fontSize: '12px' }}
                      >
                        <option value="1">1行</option>
                        <option value="2">2行（推奨）</option>
                        <option value="3">3行</option>
                      </select>
                    </div>
                  </div>

                  <div className="card" style={{ padding: '0.75rem', marginTop: '0.75rem', backgroundColor: 'rgba(20, 20, 20, 0.3)' }}>
                    <p style={{ fontSize: '10px', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--accent)' }}>📋 Netflix/BBC 業界標準</p>
                    <ul style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.6, marginLeft: '1.25rem', marginTop: '0.25rem' }}>
                      <li><strong>最大42文字/行</strong>（1行のみの場合は最大37文字推奨）</li>
                      <li><strong>最大2行</strong>（画面占有率: 20%以下）</li>
                      <li><strong>読み取り速度: 20 CPS</strong>（大人向け）/ 17 CPS（子供向け）</li>
                      <li><strong>最小表示時間:</strong> 0.833秒（20フレーム@24fps）</li>
                      <li><strong>最大表示時間:</strong> 7秒</li>
                      <li><strong>最小間隔:</strong> 2フレーム（0.083秒@24fps）</li>
                      <li><strong>改行ルール:</strong> 句読点の後 / 接続詞・前置詞の前 / 冠詞の後は避ける</li>
                      <li><strong>形状:</strong> 下辺が長いピラミッド型が理想（Top: 短い / Bottom: 長い）</li>
                    </ul>
                  </div>
                </div>

                {/* 日本語設定 */}
                <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: currentLanguage === 'ja' ? 'var(--accent)' : 'var(--border)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1rem', color: currentLanguage === 'ja' ? 'var(--accent)' : 'var(--text)' }}>
                    🇯🇵 日本語（日本語字幕設定）
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                        最大文字数/行: <span style={{ color: 'var(--accent)' }}>{jaSettings.maxCharsPerLine}</span>
                      </label>
                      <input
                        type="range"
                        value={jaSettings.maxCharsPerLine}
                        onChange={(e) => setJaSettings({ ...jaSettings, maxCharsPerLine: parseInt(e.target.value) })}
                        min="5"
                        max="20"
                        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        <span>5</span>
                        <span>推奨: 13</span>
                        <span>20</span>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                        最大行数
                      </label>
                      <select
                        value={jaSettings.maxLines}
                        onChange={(e) => setJaSettings({ ...jaSettings, maxLines: parseInt(e.target.value) })}
                        className="select"
                        style={{ fontSize: '12px' }}
                      >
                        <option value="1">1行</option>
                        <option value="2">2行（推奨）</option>
                        <option value="3">3行</option>
                      </select>
                    </div>
                  </div>

                  <div className="card" style={{ padding: '0.75rem', marginTop: '0.75rem', backgroundColor: 'rgba(20, 20, 20, 0.3)' }}>
                    <p style={{ fontSize: '10px', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--accent)' }}>📋 日本語字幕業界標準</p>
                    <ul style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.6, marginLeft: '1.25rem', marginTop: '0.25rem' }}>
                      <li><strong>最大13文字/行</strong>（全角文字基準）</li>
                      <li><strong>最大2行</strong>（標準）</li>
                      <li><strong>読み取り速度: 4文字/秒</strong>（全角文字）</li>
                      <li><strong>最小表示時間:</strong> 1秒</li>
                      <li><strong>最大表示時間:</strong> 7秒</li>
                      <li><strong>改行ルール:</strong> 文節で区切る / 助詞（は、が、を、に、へ等）から始めない</li>
                      <li><strong>形状:</strong> 意味のまとまりを優先 / 読みやすさ重視</li>
                      <li><strong>句読点:</strong> 「。」「、」の適切な使用 / 必要に応じて改行</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              onClick={handleSaveAll}
              className="btn-primary"
              style={{ flex: 1, padding: '0.75rem', fontSize: '13px', fontWeight: 700 }}
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="btn"
              style={{ flex: 1, padding: '0.75rem', fontSize: '13px' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
