'use client'

import { AIPreferences } from '@/lib/types'

interface ProjectSelectorCardProps {
  projects: any[]
  selectedProjectId: string
  customContext: string
  showNewProjectInput: boolean
  newProjectName: string
  aiPreferences: AIPreferences
  onProjectSelect: (id: string) => void
  onContextChange: (context: string) => void
  onCreateProject: () => void
  onToggleNewProjectInput: () => void
  onNewProjectNameChange: (name: string) => void
  onCancelNewProject: () => void
  showProperNounsButton?: boolean
  onOpenProperNouns?: () => void
}

export default function ProjectSelectorCard({
  projects,
  selectedProjectId,
  customContext,
  showNewProjectInput,
  newProjectName,
  aiPreferences,
  onProjectSelect,
  onContextChange,
  onCreateProject,
  onToggleNewProjectInput,
  onNewProjectNameChange,
  onCancelNewProject,
  showProperNounsButton = true,
  onOpenProperNouns,
}: ProjectSelectorCardProps) {
  const service = aiPreferences.defaultService
  const model = service === 'openai'
    ? aiPreferences.openaiModel
    : service === 'claude'
    ? aiPreferences.claudeModel
    : (aiPreferences.geminiModelTranslate || aiPreferences.geminiModel)

  return (
    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <p style={{ fontSize: '11px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
        プロジェクト設定
      </p>

      {/* プロジェクト選択 */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={selectedProjectId}
            onChange={(e) => onProjectSelect(e.target.value)}
            className="select"
            style={{ fontSize: '12px', flex: 1 }}
          >
            {projects.length === 0 ? (
              <option value="">プロジェクトなし</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </select>
          <button
            onClick={onToggleNewProjectInput}
            className="btn"
            style={{ padding: '0.5rem 0.75rem', fontSize: '12px' }}
          >
            +
          </button>
        </div>

        {/* 新規プロジェクト作成 */}
        {showNewProjectInput && (
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => onNewProjectNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateProject()
                else if (e.key === 'Escape') onCancelNewProject()
              }}
              className="input"
              placeholder="プロジェクト名"
              style={{ fontSize: '12px', flex: 1 }}
              autoFocus
            />
            <button
              onClick={onCreateProject}
              disabled={!newProjectName.trim()}
              className="btn-primary"
              style={{ padding: '0.5rem 0.75rem', fontSize: '12px' }}
            >
              作成
            </button>
            <button
              onClick={onCancelNewProject}
              className="btn"
              style={{ padding: '0.5rem 0.75rem', fontSize: '12px' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* コンテキスト */}
      <p style={{ fontSize: '10px', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
        AI指示用コンテキスト
      </p>
      <textarea
        value={customContext}
        onChange={(e) => onContextChange(e.target.value)}
        className="textarea"
        rows={3}
        placeholder="任意の指示を入力"
        style={{ fontSize: '12px', marginBottom: '0.75rem' }}
      />

      {/* 固有名詞辞書 */}
      {showProperNounsButton && onOpenProperNouns && (
        <button
          onClick={onOpenProperNouns}
          className="btn"
          style={{ width: '100%', padding: '0.625rem', fontSize: '12px' }}
        >
          📚 固有名詞辞書
        </button>
      )}
    </div>
  )
}
