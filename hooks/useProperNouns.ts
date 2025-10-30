'use client'

import { useState, useEffect } from 'react'
import { DictionaryEntry } from '@/lib/types'
import { storage } from '@/lib/utils'

export function useProperNouns(dictionaryId: string) {
  const [entries, setEntries] = useState<DictionaryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (dictionaryId) {
      loadEntries(dictionaryId)
    }
  }, [dictionaryId])

  const loadEntries = (dictId: string) => {
    const stored = storage.getDictionaryEntries(dictId)
    setEntries(stored)
  }

  const addEntry = (term: string, reading: string) => {
    if (!dictionaryId) return null

    const entry: DictionaryEntry = {
      id: `entry_${Date.now()}`,
      term: term.trim(),
      reading: reading.trim(),
      dictionaryId: dictionaryId,
    }

    const updated = [...entries, entry]
    saveEntries(dictionaryId, updated)
    return entry
  }

  const updateEntry = (entry: DictionaryEntry) => {
    if (!dictionaryId) return

    const updated = entries.map(e => e.id === entry.id ? entry : e)
    saveEntries(dictionaryId, updated)
  }

  const deleteEntry = (entryId: string) => {
    if (!dictionaryId) return

    const updated = entries.filter(e => e.id !== entryId)
    saveEntries(dictionaryId, updated)
  }

  const saveEntries = (dictId: string, newEntries: DictionaryEntry[]) => {
    setEntries(newEntries)
    storage.setDictionaryEntries(dictId, newEntries)
  }

  const exportEntries = () => {
    if (!dictionaryId) return ''

    return entries
      .map((entry) => `${entry.term},${entry.reading}`)
      .join('\n')
  }

  const importEntries = (text: string) => {
    if (!dictionaryId || !text.trim()) return

    const lines = text.trim().split('\n')
    const newEntries: DictionaryEntry[] = []

    lines.forEach(line => {
      const [term, reading] = line.split(',').map(s => s.trim())
      if (term) {
        newEntries.push({
          id: `entry_${Date.now()}_${Math.random()}`,
          term,
          reading: reading || '',
          dictionaryId: dictionaryId,
        })
      }
    })

    const updated = [...entries, ...newEntries]
    saveEntries(dictionaryId, updated)
  }

  const filteredEntries = entries.filter(entry =>
    !searchQuery ||
    entry.term.includes(searchQuery) ||
    entry.reading.includes(searchQuery)
  )

  return {
    entries,
    filteredEntries,
    searchQuery,
    setSearchQuery,
    addEntry,
    updateEntry,
    deleteEntry,
    exportEntries,
    importEntries,
    loadEntries,
  }
}
