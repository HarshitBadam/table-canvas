import { useRef, useState } from 'react'
import type { WorkBook } from 'xlsx'
import { useProjectStore } from '@/state/projectStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { holdsWriteLease } from '@/state/document/documentLease'
import { useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import { checkFileSize, checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { discardPendingImport, fileExtension, isDataFile } from '@/persistence/import-export/import/importLifecycle'
import { discardFiles, getTableCount } from '@/persistence/import-export/import/importUtils'
import { cancelCanvasImportBatch } from '@/state/runtime/canvasImportBatchStore'
import { importSingleCsv, importSingleExcelFile } from '@/persistence/import-export/import/importSingleFileFlow'
import { importSelectedItems, prepareMultiFileSelection } from '@/persistence/import-export/import/importSelectionFlow'
import type { ParsedTableData } from '@/engine/parsing/fileParsers'

interface PendingImportBase {
  id: string
  label: string
  tableName: string
  rowCount: number
  selected: boolean
  sourceKey: string
}

export type PendingImportItem =
  | (PendingImportBase & {
      kind: 'csv'
      file: File
      tableData: ParsedTableData
    })
  | (PendingImportBase & {
      kind: 'sheet'
      sourceFileName: string
      sheetName: string
      workbook: WorkBook
      buffer: ArrayBuffer
    })

export type SelectionMode = 'sheets' | 'tables'

export function useImportOrchestrator() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAppAuth()
  const { importProject, persistProjectNow } = useApp()
  const { canEdit } = useWorkspaceLease()

  const [isImporting, setIsImporting] = useState(false)
  const [selectionModalOpen, setSelectionModalOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('sheets')
  const [pendingItems, setPendingItems] = useState<PendingImportItem[]>([])
  const [importError, setImportError] = useState<string | null>(null)

  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const tier: Tier = user?.tier ?? 'guest'
  const requireRemoteWhenOnline = tier !== 'guest'

  const showViolation = (v: LimitExceeded) => {
    setUpgradeViolation(v)
    setUpgradeOpen(true)
  }

  const requireImportOwnership = () => {
    if (holdsWriteLease()) return
    throw new Error('Editing moved to another tab during import. Return to this tab and try again.')
  }

  const clearSelectionState = () => {
    setPendingItems([])
    setSelectionMode('sheets')
  }

  const handleSelectionModalOpenChange = (open: boolean) => {
    setSelectionModalOpen(open)
    if (!open) clearSelectionState()
  }

  const handleClick = () => fileInputRef.current?.click()

  const openSelectionModal = (items: PendingImportItem[], mode: SelectionMode) => {
    setPendingItems(items)
    setSelectionMode(mode)
    setSelectionModalOpen(true)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    if (files.length > 1) {
      if (!files.every(isDataFile)) {
        setImportError('To import multiple files at once, select only CSV or Excel files.')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      setIsImporting(true)
      setImportError(null)
      await prepareMultiFileSelection({ tier, showViolation }, files, openSelectionModal, setImportError)
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const file = files[0]
    const extension = fileExtension(file.name)

    if (extension === 'json' || extension === 'zip') {
      setIsImporting(true)
      setImportError(null)
      try {
        const { parseImportFile } = await import('@/persistence/import-export/import/exportImport')
        const parsed = await parseImportFile(file)
        await importProject({
          name: parsed.name,
          nodes: parsed.nodes,
          edges: parsed.edges,
          patches: parsed.patches,
          reports: parsed.reports,
        })
      } catch (error: unknown) {
        console.error('Project import error:', error)
        const limitError =
          typeof error === 'object' && error !== null && 'code' in error
            && error.code === 'limit'
        if (limitError) return
        const message = error instanceof Error ? error.message : 'Unknown error'
        setImportError(`Failed to import project: ${message}`)
      } finally {
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      return
    }

    const sizeCheck = checkFileSize(file.size, tier)
    if (!sizeCheck.ok) {
      showViolation(sizeCheck)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const tableCheck = checkTableCount(getTableCount(useProjectStore.getState().nodes), tier)
    if (!tableCheck.ok) {
      showViolation(tableCheck)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsImporting(true)
    setImportError(null)
    const projectId = useProjectStore.getState().projectId
    const uploadedFileIds: string[] = []
    const pendingImportRef: {
      current: { tableId: string; generation: number; focusBatchId: string } | null
    } = { current: null }

    const singleFileCtx = {
      tier,
      requireRemoteWhenOnline,
      showViolation,
      requireImportOwnership,
      persistProjectNow,
      setIsImporting,
      openSelectionModal,
    }

    try {
      if (extension === 'csv') {
        await importSingleCsv(singleFileCtx, file, projectId, uploadedFileIds, () => setIsImporting(false))
      } else if (extension === 'xlsx' || extension === 'xls') {
        await importSingleExcelFile(singleFileCtx, file, projectId, uploadedFileIds, pendingImportRef)
      } else {
        setImportError('Unsupported file type. Please use a CSV, Excel, or TableCanvas project file.')
      }
    } catch (error: unknown) {
      if (pendingImportRef.current) {
        discardPendingImport(pendingImportRef.current.tableId)
        cancelCanvasImportBatch(pendingImportRef.current.focusBatchId)
      }
      await discardFiles(uploadedFileIds)
      console.error('Import error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setImportError(`Failed to import file: ${message}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImportSelectedItems = async () => {
    const selectedItems = pendingItems.filter((item) => item.selected)
    if (selectedItems.length === 0) return

    setIsImporting(true)
    setImportError(null)
    try {
      await importSelectedItems(
        {
          tier,
          requireRemoteWhenOnline,
          showViolation,
          requireImportOwnership,
          persistProjectNow,
          setSelectionModalOpen,
          clearSelectionState,
        },
        selectedItems,
        selectionMode,
        setImportError,
      )
    } finally {
      setIsImporting(false)
    }
  }

  const toggleItem = (index: number) => {
    setPendingItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    )
  }

  return {
    fileInputRef,
    canEdit,
    isImporting,
    importError,
    selectionModalOpen,
    selectionMode,
    pendingItems,
    upgradeViolation,
    upgradeOpen,
    setUpgradeOpen,
    handleClick,
    handleFileSelect,
    handleSelectionModalOpenChange,
    handleImportSelectedItems,
    toggleItem,
  }
}
