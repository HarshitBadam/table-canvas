import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { generateId } from '@/lib/utils'
import type { ProjectStoreState } from './stores/types'
import { createNodesSlice } from './stores/nodesSlice'
import { createEdgesSlice } from './stores/edgesSlice'
import { createPatchesSlice } from './stores/patchesSlice'
import { createHistorySlice } from './stores/historySlice'
import { createSelectionSlice } from './stores/selectionSlice'

export const useProjectStore = create<ProjectStoreState>()(
  immer((...args) => ({
    projectId: generateId(),
    projectName: 'Untitled Project',
    ...createNodesSlice(...args),
    ...createEdgesSlice(...args),
    ...createPatchesSlice(...args),
    ...createHistorySlice(...args),
    ...createSelectionSlice(...args),
  }))
)

export type { ProjectStoreState } from './stores/types'
