import { useState, useCallback, useRef, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useApp } from '@/state/AppContext'
import { saveProjectWithSync } from '@/persistence/syncService'
import { useReportStore } from '@/report/reportStore'
import { getStorageScope } from '@/persistence/storageScope'
import { markProjectExported } from '@/layout/projectActivity'

export interface ProjectExportState {
  isExporting: boolean
  isImporting: boolean
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
  const { importProject } = useApp()

  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null!)
  const dropdownRef = useRef<HTMLDivElement>(null!)
  /*
   * Re-entry is blocked here rather than by disabling the trigger. The trigger
   * only opens a menu holding two independent actions, so disabling it withheld
   * import while an export ran and left a dimmed control with no way to discover
   * why. A ref is also the only reliable guard: `setIsExporting` does not take
   * effect until the next render, so two fast clicks can both get past a check
   * on the state value.
   */
  const exportInFlight = useRef(false)
  const importInFlight = useRef(false)

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
    if (!projectId || exportInFlight.current) return

    exportInFlight.current = true
    setIsExporting(true)
    setExportDropdownOpen(false)
    setExportError(null)

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
      const { exportAndDownloadProject } = await import('@/persistence/exportService')
      await exportAndDownloadProject(projectId, projectName || 'project', {
        includeExcel: true,
      })
      // The exported file now carries this project's current state, so nothing
      // in it is exclusive to this browser anymore.
      markProjectExported(getStorageScope(), projectId)
    } catch (err) {
      console.error('[Export] Failed:', err)
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      exportInFlight.current = false
      setIsExporting(false)
    }
  }, [projectId, projectName])

  const handleImportClick = useCallback(() => {
    setExportDropdownOpen(false)
    if (importInFlight.current) return
    importInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Cleared unconditionally so re-picking the same file still fires a change.
    event.target.value = ''
    if (importInFlight.current) return

    importInFlight.current = true
    setIsImporting(true)
    setExportError(null)

    try {
      const { parseImportFile } = await import('@/persistence/exportImport')
      const parsedData = await parseImportFile(file)
      await importProject({
        name: parsedData.name,
        nodes: parsedData.nodes,
        edges: parsedData.edges,
        patches: parsedData.patches,
        reports: parsedData.reports,
      })
      onImportComplete()
    } catch (err) {
      console.error('[Import] Failed:', err)
      setExportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      importInFlight.current = false
      setIsImporting(false)
    }
  }, [importProject, onImportComplete])

  return {
    isExporting,
    isImporting,
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
