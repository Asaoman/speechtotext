'use client'

import { useMemo, useEffect, useRef } from 'react'
import { DetectedNoun } from '@/lib/types'

interface Segment {
  text: string
  noun: DetectedNoun | null
  nounOccIdx?: number
}

function buildSegments(text: string, terms: DetectedNoun[]): Segment[] {
  if (!terms.length) return [{ text, noun: null }]

  const ranges: { start: number; end: number; noun: DetectedNoun }[] = []
  const lowerText = text.toLowerCase()

  for (const noun of terms) {
    const lowerTerm = noun.term.toLowerCase()
    if (!lowerTerm) continue
    let pos = 0
    while ((pos = lowerText.indexOf(lowerTerm, pos)) !== -1) {
      ranges.push({ start: pos, end: pos + noun.term.length, noun })
      pos += noun.term.length
    }
  }

  ranges.sort((a, b) => a.start - b.start)
  const merged = ranges.filter((r, i) => i === 0 || r.start >= ranges[i - 1].end)

  const result: Segment[] = []
  let cursor = 0
  const nounOccCounts = new Map<string, number>()
  for (const r of merged) {
    if (cursor < r.start) result.push({ text: text.slice(cursor, r.start), noun: null })
    const key = r.noun.term.toLowerCase()
    const idx = nounOccCounts.get(key) ?? 0
    nounOccCounts.set(key, idx + 1)
    result.push({ text: text.slice(r.start, r.end), noun: r.noun, nounOccIdx: idx })
    cursor = r.end
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor), noun: null })
  return result
}

function getHighlightStyle(confidence: number): React.CSSProperties {
  if (confidence < 0.6) {
    return { background: 'rgba(239, 68, 68, 0.28)', borderBottom: '2px solid #ef4444', color: 'inherit' }
  }
  if (confidence < 0.75) {
    return { background: 'rgba(245, 158, 11, 0.32)', borderBottom: '2px solid #f59e0b', color: 'inherit' }
  }
  return { background: 'rgba(250, 204, 21, 0.38)', borderBottom: '2px solid #facc15', color: 'inherit' }
}

const CATEGORY_LABELS: Record<string, string> = {
  person: '人名', place: '地名', organization: '組織',
  work: '作品', technical: '専門用語', other: 'その他',
}

interface HighlightedTranscriptionTextProps {
  text: string
  highlightTerms?: DetectedNoun[]
  onClickTerm?: (noun: DetectedNoun) => void
  activeNoun?: DetectedNoun | null
  activeOccurrenceIndex?: number
  onOccurrenceCountChange?: (count: number) => void
}

export default function HighlightedTranscriptionText({
  text,
  highlightTerms = [],
  onClickTerm,
  activeNoun,
  activeOccurrenceIndex = 0,
  onOccurrenceCountChange,
}: HighlightedTranscriptionTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const segments = useMemo(() => buildSegments(text, highlightTerms), [text, highlightTerms])

  const activeNounKey = activeNoun?.term.toLowerCase()

  const occurrenceCount = useMemo(() => {
    if (!activeNounKey) return 0
    return segments.filter(
      (s) => s.noun && s.noun.term.toLowerCase() === activeNounKey && s.nounOccIdx !== undefined
    ).length
  }, [segments, activeNounKey])

  useEffect(() => {
    onOccurrenceCountChange?.(occurrenceCount)
  }, [occurrenceCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeNounKey || !containerRef.current) return
    const el = containerRef.current.querySelector(`[data-noun-occ="${activeOccurrenceIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeNounKey, activeOccurrenceIndex])

  return (
    <div
      ref={containerRef}
      className="textarea"
      style={{
        whiteSpace: 'pre-wrap',
        lineHeight: 1.75,
        minHeight: '200px',
        maxHeight: '360px',
        overflowY: 'auto',
        cursor: 'text',
        userSelect: 'text',
      }}
    >
      {segments.map((seg, i) =>
        seg.noun ? (() => {
          const isActiveNoun = activeNounKey && seg.noun.term.toLowerCase() === activeNounKey
          const isCurrentOcc = isActiveNoun && seg.nounOccIdx === activeOccurrenceIndex
          return (
            <span
              key={i}
              onClick={() => onClickTerm?.(seg.noun!)}
              title={
                seg.noun.term !== seg.text
                  ? `${CATEGORY_LABELS[seg.noun.category] ?? seg.noun.category} — 信頼度: ${Math.round(seg.noun.confidence * 100)}%\n原文: 「${seg.text}」\nクリックで辞書に追加`
                  : `${CATEGORY_LABELS[seg.noun.category] ?? seg.noun.category} — 信頼度: ${Math.round(seg.noun.confidence * 100)}%\nクリックで辞書に追加`
              }
              data-noun-occ={isActiveNoun ? seg.nounOccIdx : undefined}
              style={{
                ...getHighlightStyle(seg.noun.confidence),
                borderRadius: '3px',
                padding: '0 2px',
                cursor: onClickTerm ? 'pointer' : 'text',
                ...(isCurrentOcc ? {
                  outline: '2px solid var(--accent)',
                  outlineOffset: '1px',
                  position: 'relative',
                  zIndex: 1,
                } : {}),
              }}
            >
              {seg.noun.term !== seg.text ? seg.noun.term : seg.text}
            </span>
          )
        })() : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  )
}
