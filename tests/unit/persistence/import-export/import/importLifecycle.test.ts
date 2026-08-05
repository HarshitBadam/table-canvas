import { beforeEach, describe, expect, it } from 'vitest'

import { resetStore } from '@/engine/integrationTestUtils'
import { reservePendingImport } from '@/persistence/import-export/import/importLifecycle'
import { useProjectStore } from '@/state/projectStore'
import {
  beginCanvasImportBatch,
  completeCanvasImportBatch,
  resetCanvasImportBatches,
} from '@/state/runtime/canvasImportBatchStore'

describe('import lifecycle history', () => {
  beforeEach(() => {
    resetStore()
    resetCanvasImportBatches()
  })

  it('reserves a multi-table batch under one snapshot without blocking persistence', () => {
    const projectId = useProjectStore.getState().projectId
    const focusBatchId = beginCanvasImportBatch(projectId)
    useProjectStore.getState().saveSnapshot('Import 2 tables')

    reservePendingImport(
      { name: 'first.csv' },
      { focusBatchId, recordHistory: false },
    )
    reservePendingImport(
      { name: 'second.csv' },
      { focusBatchId, recordHistory: false },
    )

    expect(useProjectStore.getState().history.past).toHaveLength(1)
    expect(useProjectStore.getState().history.transaction).toBeFalsy()
    expect(Object.values(useProjectStore.getState().nodes)).toHaveLength(2)

    completeCanvasImportBatch(focusBatchId)
    useProjectStore.getState().undo()

    expect(Object.values(useProjectStore.getState().nodes)).toHaveLength(0)
    expect(useProjectStore.getState().canUndo()).toBe(false)
  })
})
