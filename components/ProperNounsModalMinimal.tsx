'use client'

import { useState, useEffect } from 'react'
import { storage } from '@/lib/utils'

interface ProperNounsModalMinimalProps {
  onClose: () => void
  selectedProjectId: string | null
}

interface TableNewRowProps {
  onAdd: (term: string, reading: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>, currentTerm: string, currentReading: string) => void
  disabled: boolean
}

function TableNewRow({ onAdd, onPaste, disabled }: TableNewRowProps) {
  const [newTerm, setNewTerm] = useState('')
  const [newReading, setNewReading] = useState('')

  const handleAdd = () => {
    if (newTerm.trim()) {
      onAdd(newTerm, newReading)
      setNewTerm('')
      setNewReading('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'term' | 'reading') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'term' && newTerm.trim()) {
        handleAdd()
      } else if (field === 'reading') {
        handleAdd()
      }
    } else if (e.key === 'Tab' && field === 'reading' && !e.shiftKey) {
      // Tabキーで次の行へ（自動追加）
      if (newTerm.trim()) {
        e.preventDefault()
        handleAdd()
      }
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr auto',
        gap: '0.5rem',
        alignItems: 'center',
        borderTop: '2px dashed var(--border)',
        paddingTop: '0.5rem'
      }}
    >
      <input
        type="text"
        value={newTerm}
        onChange={(e) => setNewTerm(e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, 'term')}
        onPaste={(e) => onPaste(e, newTerm, newReading)}
        disabled={disabled}
        className="input"
        style={{ fontSize: '12px', padding: '0.5rem', backgroundColor: 'var(--bg-subtle)' }}
        placeholder="新規追加..."
      />
      <input
        type="text"
        value={newReading}
        onChange={(e) => setNewReading(e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, 'reading')}
        disabled={disabled}
        className="input"
        style={{ fontSize: '12px', padding: '0.5rem', backgroundColor: 'var(--bg-subtle)' }}
        placeholder="読み方"
      />
      <div style={{ width: '32px' }}></div>
    </div>
  )
}

/**
 * ProperNounsModalMinimal Component
 *
 * A minimal modal component for displaying and adding proper nouns.
 * Used consistently across both proofreading and subtitle generation tabs.
 *
 * Features:
 * - Displays proper nouns for the currently selected project
 * - Add new proper noun functionality
 * - Delete functionality
 * - Automatically syncs with project selection
 */
export default function ProperNounsModalMinimal({ onClose, selectedProjectId }: ProperNounsModalMinimalProps) {
  const [entries, setEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedProjectId) {
      loadEntries()
    } else {
      setEntries([])
    }
  }, [selectedProjectId])

  const loadEntries = () => {
    if (selectedProjectId) {
      const loadedEntries = storage.getDictionaryEntries(selectedProjectId)
      setEntries(loadedEntries)
    }
  }

  const handleCellChange = (id: string, field: 'term' | 'reading', value: string) => {
    // ローカルステートのみ更新（まだ保存しない）
    setEntries(prevEntries =>
      prevEntries.map(e => e.id === id ? { ...e, [field]: value } : e)
    )
  }

  const handleDeleteEntry = (entryId: string) => {
    // ローカルステートのみ更新（まだ保存しない）
    setEntries(prevEntries => prevEntries.filter(e => e.id !== entryId))
  }

  const handleSave = () => {
    if (!selectedProjectId) return
    // 変更を保存
    storage.setDictionaryEntries(selectedProjectId, entries)
    window.dispatchEvent(new Event('storage'))
    onClose()
  }

  const handleCancel = () => {
    // 変更を破棄してモーダルを閉じる
    onClose()
  }

  const handleAddEntry = (term: string, reading: string) => {
    if (!term.trim() || !selectedProjectId) return

    const newEntry = {
      id: `entry_${Date.now()}`,
      term: term.trim(),
      reading: reading.trim(),
      dictionaryId: selectedProjectId,
    }

    // ローカルステートのみ更新（まだ保存しない）
    setEntries(prevEntries => [...prevEntries, newEntry])
  }

  // ペースト処理
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, currentTerm: string, currentReading: string) => {
    if (!selectedProjectId) return

    const pastedText = e.clipboardData.getData('text')

    // 複数行のペーストを検出
    if (pastedText.includes('\n')) {
      e.preventDefault()

      const lines = pastedText.split('\n').filter(line => line.trim())
      const newEntries: any[] = []

      for (const line of lines) {
        // タブ区切り、カンマ区切り、スペース区切りに対応
        let parts: string[]
        if (line.includes('\t')) {
          parts = line.split('\t')
        } else if (line.includes(',')) {
          parts = line.split(',')
        } else if (line.includes('、')) {
          parts = line.split('、')
        } else {
          parts = line.split(/\s+/)
        }

        const term = parts[0]?.trim() || ''
        const reading = parts[1]?.trim() || ''

        if (term) {
          newEntries.push({
            id: `entry_${Date.now()}_${newEntries.length}`,
            term,
            reading,
            dictionaryId: selectedProjectId,
          })
        }
      }

      if (newEntries.length > 0) {
        // ローカルステートのみ更新（まだ保存しない）
        setEntries(prevEntries => [...prevEntries, ...newEntries])
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel()
        }
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '450px',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '1.5rem',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
            📚 固有名詞辞書
          </h2>
          <button
            onClick={handleCancel}
            className="btn"
            style={{ padding: '0.5rem', minWidth: 'auto' }}
          >
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* プロジェクト未選択の警告 */}
        {!selectedProjectId && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: '#fbbf24', backgroundColor: '#fffbeb' }}>
            <div style={{ fontSize: '12px', color: '#92400e', textAlign: 'center' }}>
              ⚠️ プロジェクトを選択してください
            </div>
          </div>
        )}

        {/* テーブル形式の辞書編集 */}
        {selectedProjectId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              💡 エクセルから2列をコピーして貼り付けると一括追加できます
            </p>

            {/* テーブルヘッダー */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto',
                gap: '0.5rem',
                padding: '0.5rem',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)'
              }}
            >
              <div>用語</div>
              <div>読み方</div>
              <div style={{ width: '32px' }}></div>
            </div>

            {/* テーブル本体 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
              {/* 既存のエントリ */}
              {entries.map((entry: any) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr auto',
                    gap: '0.5rem',
                    alignItems: 'center'
                  }}
                >
                  <input
                    type="text"
                    value={entry.term}
                    onChange={(e) => handleCellChange(entry.id, 'term', e.target.value)}
                    className="input"
                    style={{ fontSize: '12px', padding: '0.5rem' }}
                    placeholder="用語"
                  />
                  <input
                    type="text"
                    value={entry.reading || ''}
                    onChange={(e) => handleCellChange(entry.id, 'reading', e.target.value)}
                    className="input"
                    style={{ fontSize: '12px', padding: '0.5rem' }}
                    placeholder="読み方"
                  />
                  <button
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="btn"
                    style={{ padding: '0.5rem', minWidth: 'auto', fontSize: '11px' }}
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* 新規追加行 */}
              <TableNewRow
                onAdd={handleAddEntry}
                onPaste={handlePaste}
                disabled={!selectedProjectId}
              />
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              📋 登録済み: {entries.length}件
            </div>
          </div>
        )}

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
          💡 辞書はプロジェクト設定で選択したプロジェクトに紐づきます
        </p>

        {/* 登録・キャンセルボタン */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            onClick={handleCancel}
            className="btn"
            style={{ flex: 1, padding: '0.75rem', fontSize: '13px', fontWeight: 600 }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedProjectId}
            className="btn-primary"
            style={{ flex: 1, padding: '0.75rem', fontSize: '13px', fontWeight: 600 }}
          >
            登録
          </button>
        </div>
      </div>
    </div>
  )
}
