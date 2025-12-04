'use client'

import { useState, useEffect } from 'react'
import { Character, SpeechStyleType, FirstPersonPronoun, SecondPersonPronoun } from '@/lib/types'

interface CharacterManagerProps {
  projectId: string
  onCharacterSelect?: (character: Character | null) => void
  selectedCharacterId?: string | null
}

// 口調タイプの表示名
const SPEECH_STYLE_LABELS: Record<SpeechStyleType, string> = {
  polite: '敬語',
  casual: 'タメ口',
  rough: '粗野',
  formal: 'フォーマル',
  childish: '幼児言葉',
  elderly: '老人風',
  archaic: '古風・時代劇',
  dialect: '方言',
  robot: 'ロボット・AI',
  noble: '貴族風',
  military: '軍人風',
  custom: 'カスタム'
}

// 一人称の選択肢
const FIRST_PERSON_OPTIONS: { value: FirstPersonPronoun | string; label: string }[] = [
  { value: '私', label: '私' },
  { value: 'わたし', label: 'わたし' },
  { value: 'あたし', label: 'あたし' },
  { value: 'わたくし', label: 'わたくし' },
  { value: '僕', label: '僕' },
  { value: 'ぼく', label: 'ぼく' },
  { value: '俺', label: '俺' },
  { value: 'おれ', label: 'おれ' },
  { value: 'オレ', label: 'オレ' },
  { value: '自分', label: '自分' },
  { value: 'わし', label: 'わし' },
  { value: '拙者', label: '拙者' },
  { value: '余', label: '余' },
  { value: '我', label: '我' },
  { value: 'あたい', label: 'あたい' },
  { value: 'うち', label: 'うち' },
  { value: 'おいら', label: 'おいら' },
  { value: 'custom', label: 'カスタム入力' }
]

// 二人称の選択肢
const SECOND_PERSON_OPTIONS: { value: SecondPersonPronoun | string; label: string }[] = [
  { value: 'あなた', label: 'あなた' },
  { value: '君', label: '君' },
  { value: 'きみ', label: 'きみ' },
  { value: 'お前', label: 'お前' },
  { value: 'おまえ', label: 'おまえ' },
  { value: '貴様', label: '貴様' },
  { value: 'てめえ', label: 'てめえ' },
  { value: 'あんた', label: 'あんた' },
  { value: 'そなた', label: 'そなた' },
  { value: 'お主', label: 'お主' },
  { value: '貴公', label: '貴公' },
  { value: 'custom', label: 'カスタム入力' }
]

export default function CharacterManager({ projectId, onCharacterSelect, selectedCharacterId }: CharacterManagerProps) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  
  // フォームの状態
  const [formData, setFormData] = useState<Partial<Character>>({
    name: '',
    nameReading: '',
    gender: 'unknown',
    ageGroup: 'adult',
    speechStyle: 'casual',
    firstPerson: '私',
    secondPerson: 'あなた',
    sentenceEndings: [],
    characterTraits: '',
    sampleDialogues: []
  })
  const [customFirstPerson, setCustomFirstPerson] = useState('')
  const [customSecondPerson, setCustomSecondPerson] = useState('')
  const [newSentenceEnding, setNewSentenceEnding] = useState('')
  const [newSampleDialogue, setNewSampleDialogue] = useState('')

  // キャラクター一覧を取得
  const fetchCharacters = async () => {
    if (!projectId) return
    
    setIsLoading(true)
    try {
      const response = await fetch(`/api/characters?projectId=${projectId}`)
      const data = await response.json()
      if (data.success) {
        setCharacters(data.characters)
      } else {
        setError(data.error || 'キャラクターの取得に失敗しました')
      }
    } catch (err) {
      setError('キャラクターの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCharacters()
  }, [projectId])

  // フォームをリセット
  const resetForm = () => {
    setFormData({
      name: '',
      nameReading: '',
      gender: 'unknown',
      ageGroup: 'adult',
      speechStyle: 'casual',
      firstPerson: '私',
      secondPerson: 'あなた',
      sentenceEndings: [],
      characterTraits: '',
      sampleDialogues: []
    })
    setCustomFirstPerson('')
    setCustomSecondPerson('')
    setNewSentenceEnding('')
    setNewSampleDialogue('')
    setEditingCharacter(null)
  }

  // キャラクターを保存
  const handleSave = async () => {
    if (!formData.name?.trim()) {
      setError('キャラクター名を入力してください')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const characterData = {
        ...formData,
        projectId,
        firstPerson: formData.firstPerson === 'custom' ? customFirstPerson : formData.firstPerson,
        secondPerson: formData.secondPerson === 'custom' ? customSecondPerson : formData.secondPerson
      }

      const url = editingCharacter ? '/api/characters' : '/api/characters'
      const method = editingCharacter ? 'PUT' : 'POST'
      const body = editingCharacter 
        ? { ...characterData, id: editingCharacter.id }
        : characterData

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()
      if (data.success) {
        await fetchCharacters()
        setShowForm(false)
        resetForm()
      } else {
        setError(data.error || '保存に失敗しました')
      }
    } catch (err) {
      setError('保存に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  // キャラクターを削除
  const handleDelete = async (id: string) => {
    if (!confirm('このキャラクターを削除しますか？')) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/characters?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        await fetchCharacters()
        if (selectedCharacterId === id) {
          onCharacterSelect?.(null)
        }
      } else {
        setError(data.error || '削除に失敗しました')
      }
    } catch (err) {
      setError('削除に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  // 編集モードを開始
  const handleEdit = (character: Character) => {
    setEditingCharacter(character)
    setFormData({
      name: character.name,
      nameReading: character.nameReading,
      gender: character.gender,
      ageGroup: character.ageGroup,
      speechStyle: character.speechStyle,
      firstPerson: character.firstPerson,
      secondPerson: character.secondPerson,
      sentenceEndings: character.sentenceEndings || [],
      characterTraits: character.characterTraits,
      sampleDialogues: character.sampleDialogues || []
    })
    
    // カスタム一人称/二人称の処理
    if (!FIRST_PERSON_OPTIONS.find(opt => opt.value === character.firstPerson)) {
      setFormData(prev => ({ ...prev, firstPerson: 'custom' }))
      setCustomFirstPerson(character.firstPerson)
    }
    if (!SECOND_PERSON_OPTIONS.find(opt => opt.value === character.secondPerson)) {
      setFormData(prev => ({ ...prev, secondPerson: 'custom' }))
      setCustomSecondPerson(character.secondPerson)
    }
    
    setShowForm(true)
  }

  // 語尾を追加
  const addSentenceEnding = () => {
    if (newSentenceEnding.trim()) {
      setFormData(prev => ({
        ...prev,
        sentenceEndings: [...(prev.sentenceEndings || []), newSentenceEnding.trim()]
      }))
      setNewSentenceEnding('')
    }
  }

  // サンプルセリフを追加
  const addSampleDialogue = () => {
    if (newSampleDialogue.trim()) {
      setFormData(prev => ({
        ...prev,
        sampleDialogues: [...(prev.sampleDialogues || []), newSampleDialogue.trim()]
      }))
      setNewSampleDialogue('')
    }
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          🎭 キャラクター管理
        </h3>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="btn"
          style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}
        >
          {showForm ? '✕ 閉じる' : '＋ 追加'}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: '11px', color: '#dc2626', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px', marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}

      {/* キャラクター登録/編集フォーム */}
      {showForm && (
        <div style={{ 
          padding: '1rem', 
          backgroundColor: 'var(--bg-subtle)', 
          borderRadius: '8px', 
          marginBottom: '1rem',
          border: '1px solid var(--border)'
        }}>
          <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
            {editingCharacter ? '✏️ キャラクター編集' : '✨ 新規キャラクター'}
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {/* 名前 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  キャラクター名 *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="input"
                  style={{ fontSize: '12px' }}
                  placeholder="例: 田中太郎"
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  ふりがな
                </label>
                <input
                  type="text"
                  value={formData.nameReading || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, nameReading: e.target.value }))}
                  className="input"
                  style={{ fontSize: '12px' }}
                  placeholder="例: たなかたろう"
                />
              </div>
            </div>

            {/* 性別・年齢層 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  性別
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value as any }))}
                  className="input"
                  style={{ fontSize: '12px' }}
                >
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                  <option value="other">その他</option>
                  <option value="unknown">不明</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  年齢層
                </label>
                <select
                  value={formData.ageGroup}
                  onChange={(e) => setFormData(prev => ({ ...prev, ageGroup: e.target.value as any }))}
                  className="input"
                  style={{ fontSize: '12px' }}
                >
                  <option value="child">子供</option>
                  <option value="teen">10代</option>
                  <option value="young_adult">若者</option>
                  <option value="adult">大人</option>
                  <option value="middle_aged">中年</option>
                  <option value="elderly">高齢</option>
                </select>
              </div>
            </div>

            {/* 口調タイプ */}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                口調タイプ
              </label>
              <select
                value={formData.speechStyle}
                onChange={(e) => setFormData(prev => ({ ...prev, speechStyle: e.target.value as SpeechStyleType }))}
                className="input"
                style={{ fontSize: '12px' }}
              >
                {Object.entries(SPEECH_STYLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* 一人称・二人称 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  一人称
                </label>
                <select
                  value={formData.firstPerson}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstPerson: e.target.value }))}
                  className="input"
                  style={{ fontSize: '12px' }}
                >
                  {FIRST_PERSON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {formData.firstPerson === 'custom' && (
                  <input
                    type="text"
                    value={customFirstPerson}
                    onChange={(e) => setCustomFirstPerson(e.target.value)}
                    className="input"
                    style={{ fontSize: '12px', marginTop: '0.25rem' }}
                    placeholder="カスタム一人称"
                  />
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  二人称
                </label>
                <select
                  value={formData.secondPerson}
                  onChange={(e) => setFormData(prev => ({ ...prev, secondPerson: e.target.value }))}
                  className="input"
                  style={{ fontSize: '12px' }}
                >
                  {SECOND_PERSON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {formData.secondPerson === 'custom' && (
                  <input
                    type="text"
                    value={customSecondPerson}
                    onChange={(e) => setCustomSecondPerson(e.target.value)}
                    className="input"
                    style={{ fontSize: '12px', marginTop: '0.25rem' }}
                    placeholder="カスタム二人称"
                  />
                )}
              </div>
            </div>

            {/* 特徴的な語尾 */}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                特徴的な語尾
              </label>
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={newSentenceEnding}
                  onChange={(e) => setNewSentenceEnding(e.target.value)}
                  className="input"
                  style={{ fontSize: '12px', flex: 1 }}
                  placeholder="例: 〜だぜ、〜ですわ"
                  onKeyPress={(e) => e.key === 'Enter' && addSentenceEnding()}
                />
                <button onClick={addSentenceEnding} className="btn" style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}>
                  追加
                </button>
              </div>
              {formData.sentenceEndings && formData.sentenceEndings.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {formData.sentenceEndings.map((ending, idx) => (
                    <span
                      key={idx}
                      className="badge"
                      style={{ fontSize: '10px', cursor: 'pointer' }}
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        sentenceEndings: prev.sentenceEndings?.filter((_, i) => i !== idx)
                      }))}
                      title="クリックで削除"
                    >
                      {ending} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* キャラクターの特徴 */}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                キャラクターの特徴
              </label>
              <textarea
                value={formData.characterTraits || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, characterTraits: e.target.value }))}
                className="textarea"
                rows={2}
                style={{ fontSize: '12px' }}
                placeholder="例: 熱血漢で正義感が強い。江戸っ子気質で曲がったことが嫌い。"
              />
            </div>

            {/* サンプルセリフ */}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                サンプルセリフ（翻訳の参考用）
              </label>
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={newSampleDialogue}
                  onChange={(e) => setNewSampleDialogue(e.target.value)}
                  className="input"
                  style={{ fontSize: '12px', flex: 1 }}
                  placeholder="このキャラクターらしいセリフを入力"
                  onKeyPress={(e) => e.key === 'Enter' && addSampleDialogue()}
                />
                <button onClick={addSampleDialogue} className="btn" style={{ padding: '0.375rem 0.75rem', fontSize: '11px' }}>
                  追加
                </button>
              </div>
              {formData.sampleDialogues && formData.sampleDialogues.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {formData.sampleDialogues.map((dialogue, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: '11px',
                        padding: '0.375rem 0.5rem',
                        backgroundColor: 'var(--bg)',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ color: 'var(--text)' }}>「{dialogue}」</span>
                      <button
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          sampleDialogues: prev.sampleDialogues?.filter((_, i) => i !== idx)
                        }))}
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
              )}
            </div>

            {/* 保存ボタン */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="btn-primary"
                style={{ flex: 1, padding: '0.625rem', fontSize: '12px' }}
              >
                {isLoading ? '保存中...' : (editingCharacter ? '更新' : '登録')}
              </button>
              <button
                onClick={() => { setShowForm(false); resetForm() }}
                className="btn"
                style={{ padding: '0.625rem 1rem', fontSize: '12px' }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* キャラクター一覧 */}
      {isLoading && !showForm ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
          読み込み中...
        </p>
      ) : characters.length === 0 ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
          キャラクターが登録されていません
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
          {characters.map(character => (
            <div
              key={character.id}
              className="card"
              style={{
                padding: '0.75rem',
                cursor: 'pointer',
                borderColor: selectedCharacterId === character.id ? 'var(--accent)' : 'var(--border)',
                backgroundColor: selectedCharacterId === character.id ? 'rgba(250, 204, 21, 0.1)' : 'transparent'
              }}
              onClick={() => onCharacterSelect?.(selectedCharacterId === character.id ? null : character)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: character.color || 'var(--accent)'
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                  {character.name}
                </span>
                <span className="badge" style={{ fontSize: '9px' }}>
                  {SPEECH_STYLE_LABELS[character.speechStyle]}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(character) }}
                  className="btn"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '10px' }}
                >
                  編集
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(character.id) }}
                  className="btn"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '10px', color: '#dc2626' }}
                >
                  削除
                </button>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>一人称: {character.firstPerson}</span>
                <span style={{ marginLeft: '0.75rem' }}>二人称: {character.secondPerson}</span>
                {character.sentenceEndings && character.sentenceEndings.length > 0 && (
                  <span style={{ marginLeft: '0.75rem' }}>語尾: {character.sentenceEndings.slice(0, 2).join(', ')}{character.sentenceEndings.length > 2 ? '...' : ''}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

