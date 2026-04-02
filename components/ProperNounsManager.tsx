'use client'

import { useState, useEffect, useRef } from 'react'
import { DictionaryEntry, Dictionary } from '@/lib/types'
import { storage } from '@/lib/utils'

interface ProperNounsManagerProps {
  refreshKey?: number
}

export default function ProperNounsManager({ refreshKey }: ProperNounsManagerProps) {
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([])
  const [selectedDictionary, setSelectedDictionary] = useState<string>('')
  const [entries, setEntries] = useState<DictionaryEntry[]>([])

  // 新規辞書フォーム
  const [showNewDictionary, setShowNewDictionary] = useState(false)
  const [newDictionaryName, setNewDictionaryName] = useState('')
  const [newDictionaryDescription, setNewDictionaryDescription] = useState('')

  // 新規エントリフォーム
  const [newTerm, setNewTerm] = useState('')
  const [newReading, setNewReading] = useState('')

  // 編集モード
  const [editingEntry, setEditingEntry] = useState<DictionaryEntry | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  const termInputRef = useRef<HTMLInputElement>(null)
  const readingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadFromLocalStorage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    if (selectedDictionary) {
      loadEntries(selectedDictionary)
    }
  }, [selectedDictionary])

  const loadFromLocalStorage = () => {
    const stored = storage.getDictionaries()
    if (stored.length > 0) {
      setDictionaries(stored)
      setSelectedDictionary(stored[0].id)
    } else {
      // デフォルトプロジェクトを作成
      const defaultDict: Dictionary = {
        id: 'default',
        name: 'デフォルトプロジェクト',
        description: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setDictionaries([defaultDict])
      storage.setDictionaries([defaultDict])
      setSelectedDictionary('default')
    }
  }

  const loadEntries = (dictionaryId: string) => {
    const stored = storage.getDictionaryEntries(dictionaryId)
    setEntries(stored)
  }

  const saveDictionaries = (dicts: Dictionary[]) => {
    setDictionaries(dicts)
    storage.setDictionaries(dicts)
  }

  const saveEntries = (dictionaryId: string, newEntries: DictionaryEntry[]) => {
    setEntries(newEntries)
    storage.setDictionaryEntries(dictionaryId, newEntries)
  }

  const createDictionary = () => {
    if (!newDictionaryName.trim()) return

    const newDict: Dictionary = {
      id: `dict_${Date.now()}`,
      name: newDictionaryName.trim(),
      description: newDictionaryDescription.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const updated = [...dictionaries, newDict]
    saveDictionaries(updated)
    setSelectedDictionary(newDict.id)

    // モーダルを閉じる
    setShowNewDictionary(false)
    setNewDictionaryName('')
    setNewDictionaryDescription('')
  }

  const updateDictionaryContext = (description: string) => {
    const updated = dictionaries.map(d =>
      d.id === selectedDictionary
        ? { ...d, description, updated_at: new Date().toISOString() }
        : d
    )
    saveDictionaries(updated)
  }

  const deleteDictionary = (dictId: string) => {
    if (dictionaries.length === 1) {
      alert('最後の辞書は削除できません')
      return
    }

    const updated = dictionaries.filter(d => d.id !== dictId)
    saveDictionaries(updated)

    // 削除した辞書のエントリも削除
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`dictionary_entries_${dictId}`)
    }

    if (selectedDictionary === dictId) {
      setSelectedDictionary(updated[0].id)
    }
  }

  const addEntry = () => {
    if (!selectedDictionary) return
    if (!newTerm.trim() && !newReading.trim()) {
      termInputRef.current?.focus()
      return
    }

    const entry: DictionaryEntry = {
      id: `entry_${Date.now()}`,
      term: newTerm.trim(),
      reading: newReading.trim(),
      dictionaryId: selectedDictionary,
    }

    const updated = [...entries, entry]
    saveEntries(selectedDictionary, updated)

    setNewTerm('')
    setNewReading('')
    termInputRef.current?.focus()
  }

  const updateEntry = (entry: DictionaryEntry) => {
    if (!selectedDictionary) return

    const updated = entries.map(e => e.id === entry.id ? entry : e)
    saveEntries(selectedDictionary, updated)
    setEditingEntry(null)
  }

  const deleteEntry = (entryId: string) => {
    if (!selectedDictionary) return

    const updated = entries.filter(e => e.id !== entryId)
    saveEntries(selectedDictionary, updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent, field: 'term' | 'reading') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'term' && newTerm.trim()) {
        readingInputRef.current?.focus()
      } else if (field === 'reading') {
        addEntry()
      }
    }
  }

  const exportDictionary = () => {
    if (!selectedDictionary) return

    const dict = dictionaries.find(d => d.id === selectedDictionary)
    const exportText = entries
      .map((entry) => `${entry.term},${entry.reading}`)
      .join('\n')

    const blob = new Blob([exportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${dict?.name || 'dictionary'}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const importEntries = (text: string) => {
    if (!selectedDictionary || !text.trim()) return

    const lines = text.trim().split('\n')
    const newEntries: DictionaryEntry[] = []

    lines.forEach(line => {
      const [term, reading] = line.split(',').map(s => s.trim())
      if (term) {
        newEntries.push({
          id: `entry_${Date.now()}_${Math.random()}`,
          term,
          reading: reading || '',
          dictionaryId: selectedDictionary,
        })
      }
    })

    const updated = [...entries, ...newEntries]
    saveEntries(selectedDictionary, updated)
  }

  const filteredEntries = entries.filter(entry =>
    !searchQuery ||
    entry.term.includes(searchQuery) ||
    entry.reading.includes(searchQuery)
  )

  const currentDict = dictionaries.find(d => d.id === selectedDictionary)

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--accent)' }}>
        📚 固有名詞プロジェクト
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        プロジェクトごとに固有名詞辞書を作成し、固有名詞とその読み方を登録します
      </p>

      {/* 辞書選択・管理 */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem', backgroundColor: 'rgba(250, 204, 21, 0.05)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={selectedDictionary}
            onChange={(e) => setSelectedDictionary(e.target.value)}
            className="select"
            style={{ flex: 1, fontSize: '13px' }}
          >
            {dictionaries.map((dict) => (
              <option key={dict.id} value={dict.id}>
                {dict.name} ({storage.getDictionaryEntries(dict.id).length}件)
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNewDictionary(true)}
            className="btn-primary"
            style={{ padding: '0.5rem 0.75rem', fontSize: '12px', whiteSpace: 'nowrap' }}
          >
            ＋ 新規プロジェクト
          </button>
          {dictionaries.length > 1 && (
            <button
              onClick={() => {
                if (confirm(`「${currentDict?.name}」を削除しますか？`)) {
                  deleteDictionary(selectedDictionary)
                }
              }}
              className="btn"
              style={{ padding: '0.5rem 0.75rem', fontSize: '12px', color: '#dc2626' }}
            >
              削除
            </button>
          )}
        </div>
      </div>

      {/* 新規辞書作成モーダル */}
      {showNewDictionary && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>
          <div className="card" style={{ maxWidth: '32rem', width: '100%' }}>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>新しいプロジェクトを作成</h3>
                <button
                  onClick={() => {
                    setShowNewDictionary(false)
                    setNewDictionaryName('')
                    setNewDictionaryDescription('')
                  }}
                  className="btn"
                  style={{ padding: '0.25rem 0.5rem' }}
                >
                  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
                    プロジェクト名 <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={newDictionaryName}
                    onChange={(e) => setNewDictionaryName(e.target.value)}
                    className="input"
                    placeholder="例: プロジェクトA、映画タイトル、キャラクター名"
                    style={{ fontSize: '13px' }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDictionaryName.trim()) {
                        e.preventDefault()
                        createDictionary()
                      }
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '0.5rem' }}>
                    🤖 AI校正用コンテキスト（オプション）
                  </label>
                  <textarea
                    value={newDictionaryDescription}
                    onChange={(e) => setNewDictionaryDescription(e.target.value)}
                    className="textarea"
                    rows={6}
                    placeholder="例: SF映画「スターライト」の字幕プロジェクト。主人公は宇宙飛行士のアレックス・ハリソン。舞台は2156年の火星コロニー。専門用語や宇宙関連の表現が多く含まれます。"
                    style={{ fontSize: '12px', lineHeight: 1.6 }}
                  />
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    校正時にAIに渡されます。プロジェクトの背景、登場人物、設定などを記述してください。
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={createDictionary}
                    disabled={!newDictionaryName.trim()}
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.75rem', fontSize: '13px', fontWeight: 600 }}
                  >
                    作成
                  </button>
                  <button
                    onClick={() => {
                      setShowNewDictionary(false)
                      setNewDictionaryName('')
                      setNewDictionaryDescription('')
                    }}
                    className="btn"
                    style={{ flex: 1, padding: '0.75rem', fontSize: '13px' }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDictionary && (
        <>
          {/* 辞書のコンテキスト */}
          {currentDict && (
            <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: 'var(--accent)', backgroundColor: 'rgba(250, 204, 21, 0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '0.25rem' }}>
                    🤖 AI校正用コンテキスト
                  </label>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    このコンテキストは校正時にAIに渡され、文脈に応じた適切な校正を行うために使用されます。プロジェクトの背景、登場人物、設定などを記述してください。
                  </p>
                </div>
              </div>
              <textarea
                value={currentDict.description || ''}
                onChange={(e) => updateDictionaryContext(e.target.value)}
                onBlur={(e) => updateDictionaryContext(e.target.value)}
                className="textarea"
                rows={4}
                placeholder="例: SF映画「スターライト」の字幕。主人公は宇宙飛行士のアレックス・ハリソン。舞台は2156年の火星コロニー。専門用語や宇宙関連の表現が多く含まれます。"
                style={{ fontSize: '12px', lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(20, 20, 20, 0.3)', borderRadius: '4px' }}>
                <svg style={{ width: '14px', height: '14px', color: 'var(--accent)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <strong>ヒント:</strong> 詳細なコンテキストを記述することで、AIがより正確に固有名詞を認識し、文脈に応じた適切な校正を行えます
                </p>
              </div>
            </div>
          )}

          {/* クイック登録フォーム */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
              固有名詞を登録
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                ref={termInputRef}
                type="text"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'term')}
                className="input"
                placeholder="固有名詞（例: 山田太郎）"
                style={{ flex: 1, fontSize: '13px' }}
              />
              <span style={{ fontSize: '18px', color: 'var(--accent)', fontWeight: 700 }}>→</span>
              <input
                ref={readingInputRef}
                type="text"
                value={newReading}
                onChange={(e) => setNewReading(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'reading')}
                className="input"
                placeholder="読み方（例: やまだたろう）"
                style={{ flex: 1, fontSize: '13px' }}
              />
              <button
                onClick={addEntry}
                className="btn-primary"
                style={{ padding: '0.625rem 1.25rem', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                追加
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              💡 固有名詞を入力 → Enter → 読み方を入力 → Enter で登録
            </p>
          </div>

          {/* 検索・アクション */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              placeholder="検索..."
              style={{ flex: 1, fontSize: '12px' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {entries.length}件
            </span>
            {entries.length > 0 && (
              <button
                onClick={exportDictionary}
                className="btn"
                style={{ padding: '0.5rem 0.75rem', fontSize: '11px' }}
              >
                エクスポート
              </button>
            )}
          </div>

          {/* エントリ一覧 */}
          {filteredEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '24rem', overflowY: 'auto' }}>
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="card"
                  style={{
                    padding: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    backgroundColor: editingEntry?.id === entry.id ? 'rgba(250, 204, 21, 0.1)' : undefined,
                  }}
                >
                  {editingEntry?.id === entry.id ? (
                    <>
                      <input
                        type="text"
                        value={editingEntry.term}
                        onChange={(e) => setEditingEntry({ ...editingEntry, term: e.target.value })}
                        className="input"
                        style={{ flex: 1, fontSize: '13px' }}
                        autoFocus
                      />
                      <span style={{ fontSize: '14px', color: 'var(--accent)' }}>→</span>
                      <input
                        type="text"
                        value={editingEntry.reading}
                        onChange={(e) => setEditingEntry({ ...editingEntry, reading: e.target.value })}
                        className="input"
                        style={{ flex: 1, fontSize: '13px' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateEntry(editingEntry)
                          } else if (e.key === 'Escape') {
                            setEditingEntry(null)
                          }
                        }}
                      />
                      <button
                        onClick={() => updateEntry(editingEntry)}
                        className="btn-primary"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '11px' }}
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingEntry(null)}
                        className="btn"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '11px' }}
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{entry.term}</span>
                        <span style={{ fontSize: '13px', color: 'var(--accent)' }}>→</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{entry.reading}</span>
                      </div>
                      <button
                        onClick={() => setEditingEntry(entry)}
                        className="btn"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '11px' }}
                      >
                        編集
                      </button>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="btn"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '11px', color: '#dc2626' }}
                      >
                        削除
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {searchQuery ? '該当する固有名詞がありません' : '固有名詞を登録してください'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
