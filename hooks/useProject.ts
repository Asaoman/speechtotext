'use client'

import { useState, useEffect } from 'react'
import { storage } from '@/lib/utils'

interface Project {
  id: string
  name: string
  customContext: string
  created_at: string
  updated_at: string
}

export function useProject() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [customContext, setCustomContext] = useState('')
  const [showNewProjectInput, setShowNewProjectInput] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  // プロジェクト読み込み
  useEffect(() => {
    loadProjects()
  }, [])

  // コンテキスト自動保存（500ms debounce）
  useEffect(() => {
    if (selectedProjectId && customContext !== undefined) {
      const timeoutId = setTimeout(() => {
        handleSaveProjectContext()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [customContext, selectedProjectId])

  const loadProjects = () => {
    const loadedProjects = storage.getProjects()
    setProjects(loadedProjects)

    // 現在のプロジェクトIDを取得
    const currentId = storage.getCurrentProjectId()
    if (currentId && loadedProjects.find((p: Project) => p.id === currentId)) {
      setSelectedProjectId(currentId)
      loadProjectContext(currentId)
    } else if (loadedProjects.length > 0) {
      // 最初のプロジェクトを選択
      setSelectedProjectId(loadedProjects[0].id)
      storage.setCurrentProjectId(loadedProjects[0].id)
      loadProjectContext(loadedProjects[0].id)
    }
  }

  const loadProjectContext = (projectId: string) => {
    const project = storage.getProject(projectId)
    if (project) {
      setCustomContext(project.customContext || '')
    }
  }

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId)
    storage.setCurrentProjectId(projectId)
    loadProjectContext(projectId)
  }

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return

    const newProject: Project = {
      id: `project_${Date.now()}`,
      name: newProjectName.trim(),
      customContext: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    storage.saveProject(newProject)

    // 辞書も同じIDで作成（互換性のため）
    const dicts = storage.getDictionaries()
    const newDict = {
      id: newProject.id,
      name: newProject.name,
      created_at: newProject.created_at,
      updated_at: newProject.updated_at,
    }
    storage.setDictionaries([...dicts, newDict])

    setNewProjectName('')
    setShowNewProjectInput(false)
    loadProjects()
    handleProjectSelect(newProject.id)
  }

  const handleSaveProjectContext = () => {
    if (!selectedProjectId) return

    const project = storage.getProject(selectedProjectId)
    if (project) {
      const updatedProject = {
        ...project,
        customContext: customContext,
        updated_at: new Date().toISOString(),
      }
      storage.saveProject(updatedProject)
    }
  }

  return {
    projects,
    selectedProjectId,
    customContext,
    showNewProjectInput,
    newProjectName,
    setCustomContext,
    setShowNewProjectInput,
    setNewProjectName,
    handleProjectSelect,
    handleCreateProject,
    loadProjects,
  }
}
