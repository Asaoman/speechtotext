'use client'

interface ProgressBarProps {
  current: number
  total: number
  label?: string
}

export default function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div style={{ width: '100%', padding: '1rem' }}>
      {label && (
        <div style={{
          fontSize: '12px',
          fontWeight: 500,
          marginBottom: '0.5rem',
          color: 'var(--text)'
        }}>
          {label}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <div style={{
          flex: 1,
          height: '8px',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            height: '100%',
            width: `${percentage}%`,
            backgroundColor: 'var(--accent)',
            transition: 'width 0.3s ease',
            borderRadius: '4px'
          }} />
        </div>

        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          minWidth: '60px',
          textAlign: 'right'
        }}>
          {current} / {total}
        </div>
      </div>

      <div style={{
        fontSize: '10px',
        color: 'var(--text-muted)',
        marginTop: '0.25rem',
        textAlign: 'center'
      }}>
        {percentage}%
      </div>
    </div>
  )
}
