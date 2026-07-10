import { useState, useCallback, useRef, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useApp } from '@/state/AppContext'
import { parseImportFile, saveAllReports } from '@/persistence/db'
import { importProjectWithSync, saveProjectWithSync } from '@/persistence/syncService'
import { exportAndDownloadProject } from '@/persistence/exportService'
import { useReportStore } from '@/report/reportStore'

export interface ProjectExportState {
  isExporting: boolean
  isImporting: boolean
  exportProgress: string
  exportError: string | null
  exportDropdownOpen: boolean
  dropdownRef: React.RefObject<HTMLDivElement>
  importInputRef: React.RefObject<HTMLInputElement>
  handleExport: () => Promise<void>
  handleImportClick: () => void
  handleImportFile: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  setExportDropdownOpen: (open: boolean) => void
}

export function useProjectExport(onImportComplete: () => void): ProjectExportState {
  const projectId = useProjectStore((state) => state.projectId)
  const projectName = useProjectStore((state) => state.projectName)
  const { loadProject } = useApp()

  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string>('')
  const [exportError, setExportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null!)
  const dropdownRef = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false)
      }
    }

    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [exportDropdownOpen])

  useEffect(() => {
    if (exportError) {
      const timer = setTimeout(() => setExportError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [exportError])

  const handleExport = useCallback(async () => {
    if (!projectId) return

    setIsExporting(true)
    setExportDropdownOpen(false)
    setExportError(null)
    setExportProgress('Starting export...')

    try {
      const project = useProjectStore.getState()
      await saveProjectWithSync(
        projectId,
        project.projectName,
        project.nodes,
        project.edges,
        project.patches,
      )
      await useReportStore.getState().flushSaves()
      await exportAndDownloadProject(projectId, projectName || 'project', {
        includeExcel: true,
        onProgress: (message) => setExportProgress(message),
      })
      setExportProgress('')
    } catch (err) {
      console.error('[Export] Failed:', err)
      setExportError(err instanceof Error ? err.message : 'Export failed')
      setExportProgress('')
    } finally {
      setIsExporting(false)
    }
  }, [projectId, projectName])

  const handleImportClick = useCallback(() => {
    setExportDropdownOpen(false)
    importInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    event.target.value = ''
    setIsImporting(true)
    setExportError(null)

    try {
      const parsedData = await parseImportFile(file)
      const importedProject = await importProjectWithSync({
        name: parsedData.name,
        nodes: parsedData.nodes,
        edges: parsedData.edges,
        patches: parsedData.patches,
      })
      if (parsedData.reports.length > 0) {
        await saveAllReports(Object.fromEntries(
          parsedData.reports.map((report) => [
            report.id,
            { ...report, projectId: importedProject.id, schemaVersion: 1 },
          ]),
        ))
      }
      await loadProject(importedProject.id)
      onImportComplete()
    } catch (err) {
      console.error('[Import] Failed:', err)
      setExportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }, [loadProject, onImportComplete])

  return {
    isExporting,
    isImporting,
    exportProgress,
    exportError,
    exportDropdownOpen,
    dropdownRef,
    importInputRef,
    handleExport,
    handleImportClick,
    handleImportFile,
    setExportDropdownOpen,
  }
}
