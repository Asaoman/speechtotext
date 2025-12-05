'use client'

import React, { useMemo } from 'react'
import { 
  SubtitleTimingValidation, 
  TimingViolation, 
  TimingViolationType,
  ValidationSeverity,
  LanguageTimingConfig 
} from '@/lib/types'

interface SubtitleTimingValidatorProps {
  validation: SubtitleTimingValidation | null
  timingConfig?: LanguageTimingConfig
  language: 'en' | 'ja'
  onJumpToSubtitle?: (index: number) => void
  onAutoFix?: (violations: TimingViolation[]) => void
  showStatistics?: boolean
}

// 違反タイプのラベルと説明
const VIOLATION_LABELS: Record<TimingViolationType, { label: string; description: string }> = {
  min_duration: { 
    label: '最小表示時間', 
    description: '字幕の表示時間が短すぎます' 
  },
  max_duration: { 
    label: '最大表示時間', 
    description: '字幕の表示時間が長すぎます' 
  },
  reading_speed: { 
    label: '読み取り速度', 
    description: '文字数に対して表示時間が短く、読み取りが困難です' 
  },
  forbidden_gap: { 
    label: '禁止ギャップ', 
    description: '3-11フレームのギャップは視覚的に不快です（2フレームまたは12フレーム以上が推奨）' 
  },
  char_limit: { 
    label: '文字数超過', 
    description: '1行あたりの文字数が多すぎます' 
  },
  overlap: { 
    label: '時間重複', 
    description: '字幕の表示時間が重複しています' 
  },
  negative_duration: { 
    label: '無効な時間', 
    description: '終了時刻が開始時刻より前です' 
  },
}

// 重大度に応じたスタイル
const SEVERITY_STYLES: Record<ValidationSeverity, { bg: string; border: string; icon: string }> = {
  error: { 
    bg: 'rgba(239, 68, 68, 0.1)', 
    border: 'rgb(239, 68, 68)', 
    icon: '❌' 
  },
  warning: { 
    bg: 'rgba(245, 158, 11, 0.1)', 
    border: 'rgb(245, 158, 11)', 
    icon: '⚠️' 
  },
  info: { 
    bg: 'rgba(59, 130, 246, 0.1)', 
    border: 'rgb(59, 130, 246)', 
    icon: 'ℹ️' 
  },
}

export default function SubtitleTimingValidator({
  validation,
  timingConfig,
  language,
  onJumpToSubtitle,
  onAutoFix,
  showStatistics = true,
}: SubtitleTimingValidatorProps) {
  // 違反をタイプ別にグループ化
  const groupedViolations = useMemo(() => {
    if (!validation) return {}
    
    const groups: Record<TimingViolationType, TimingViolation[]> = {} as any
    
    for (const violation of validation.violations) {
      if (!groups[violation.type]) {
        groups[violation.type] = []
      }
      groups[violation.type].push(violation)
    }
    
    return groups
  }, [validation])

  // 自動修正可能な違反の数
  const autoFixableCount = useMemo(() => {
    if (!validation) return 0
    return validation.violations.filter(v => v.autoFixable).length
  }, [validation])

  if (!validation) {
    return (
      <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          バリデーション結果がありません
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '1rem' }}>
      {/* ヘッダー */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)'
      }}>
        <div>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {validation.isValid ? '✅' : '⚠️'} タイミングバリデーション
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {language === 'ja' ? '日本語' : '英語'}字幕 • {validation.statistics.totalSubtitles}件の字幕
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {validation.errors > 0 && (
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: 'rgb(239, 68, 68)',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {validation.errors} エラー
            </span>
          )}
          {validation.warnings > 0 && (
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              color: 'rgb(245, 158, 11)',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {validation.warnings} 警告
            </span>
          )}
          {validation.isValid && (
            <span style={{ 
              padding: '0.25rem 0.5rem', 
              borderRadius: '4px', 
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              color: 'rgb(34, 197, 94)',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              合格
            </span>
          )}
        </div>
      </div>

      {/* 統計情報 */}
      {showStatistics && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '0.75rem',
          marginBottom: '1rem',
          padding: '0.75rem',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '8px'
        }}>
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>平均表示時間</p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {validation.statistics.avgDuration.toFixed(2)}秒
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>平均CPS</p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {validation.statistics.avgCPS.toFixed(1)} 文字/秒
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>平均ギャップ</p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {(validation.statistics.avgGap * 1000).toFixed(0)}ms
            </p>
          </div>
        </div>
      )}

      {/* タイミング設定表示 */}
      {timingConfig && (
        <div style={{ 
          marginBottom: '1rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '6px',
          fontSize: '0.75rem'
        }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>適用ルール:</p>
          <p style={{ color: 'var(--text)' }}>
            表示時間: {timingConfig.minDuration}〜{timingConfig.maxDuration}秒 • 
            最大{timingConfig.maxCPS} CPS • 
            ギャップ≥{timingConfig.minGapFrames}f • 
            1行{timingConfig.maxCharsPerLine}文字
          </p>
        </div>
      )}

      {/* 自動修正ボタン */}
      {autoFixableCount > 0 && onAutoFix && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => onAutoFix(validation.violations.filter(v => v.autoFixable))}
            className="btn-primary"
            style={{ width: '100%', fontSize: '0.875rem' }}
          >
            🔧 {autoFixableCount}件の問題を自動修正
          </button>
        </div>
      )}

      {/* 違反リスト */}
      {validation.totalViolations === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '2rem',
          color: 'rgb(34, 197, 94)'
        }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</p>
          <p style={{ fontSize: '0.875rem' }}>すべてのタイミングルールに適合しています</p>
        </div>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {Object.entries(groupedViolations).map(([type, violations]) => {
            const violationType = type as TimingViolationType
            const { label, description } = VIOLATION_LABELS[violationType]
            const violationList = violations as TimingViolation[]
            
            return (
              <div key={type} style={{ marginBottom: '1rem' }}>
                <h4 style={{ 
                  fontSize: '0.875rem', 
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {SEVERITY_STYLES[violationList[0]?.severity || 'warning'].icon} {label}
                  <span style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: 400,
                    color: 'var(--text-muted)' 
                  }}>
                    ({violationList.length}件)
                  </span>
                </h4>
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--text-muted)',
                  marginBottom: '0.5rem'
                }}>
                  {description}
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {violationList.slice(0, 10).map((violation, idx) => {
                    const style = SEVERITY_STYLES[violation.severity]
                    
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: style.bg,
                          borderLeft: `3px solid ${style.border}`,
                          borderRadius: '0 4px 4px 0',
                          fontSize: '0.8rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 500 }}>字幕 #{violation.subtitleIndex}</span>
                          {violation.details && (
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                              {typeof violation.details.actual === 'number' 
                                ? violation.details.actual.toFixed(2)
                                : violation.details.actual}
                              {violation.details.unit === 'seconds' ? '秒' : 
                                violation.details.unit === 'frames' ? 'f' : 
                                violation.details.unit === 'cps' ? ' CPS' : '文字'} 
                              {' '}(基準: {typeof violation.details.expected === 'number'
                                ? violation.details.expected
                                : violation.details.expected}
                              {violation.details.unit === 'seconds' ? '秒' : 
                                violation.details.unit === 'frames' ? 'f' : 
                                violation.details.unit === 'cps' ? ' CPS' : '文字'})
                            </span>
                          )}
                          {!violation.details && (
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                              {violation.message}
                            </span>
                          )}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {violation.autoFixable && (
                            <span style={{ 
                              fontSize: '0.65rem', 
                              color: 'rgb(34, 197, 94)',
                              padding: '0.125rem 0.375rem',
                              backgroundColor: 'rgba(34, 197, 94, 0.1)',
                              borderRadius: '3px'
                            }}>
                              自動修正可
                            </span>
                          )}
                          {onJumpToSubtitle && (
                            <button
                              onClick={() => onJumpToSubtitle(violation.subtitleIndex)}
                              style={{
                                padding: '0.125rem 0.375rem',
                                fontSize: '0.7rem',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)'
                              }}
                            >
                              表示
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  
                  {violationList.length > 10 && (
                    <p style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--text-muted)',
                      padding: '0.5rem',
                      textAlign: 'center'
                    }}>
                      他 {violationList.length - 10}件...
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

