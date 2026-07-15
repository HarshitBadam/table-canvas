import type { StateCreator } from 'zustand'
import type { ChartNode } from '@/types'
import { generateId } from '@/lib/utils'
import type { ProjectStoreState, NodesSliceState } from './types'

type SetFn = Parameters<StateCreator<ProjectStoreState, [['zustand/immer', never]], [], NodesSliceState>>[0]
type GetFn = Parameters<StateCreator<ProjectStoreState, [['zustand/immer', never]], [], NodesSliceState>>[1]

export function createChartOps(set: SetFn, get: GetFn) {
  return {
    addChart: (params: Parameters<NodesSliceState['addChart']>[0]): string => {
      const state = get()
      if (!state.getTableNode(params.plan.sourceTableId)) {
        throw new Error('Chart source table not found')
      }

      state.saveSnapshot(`Create chart ${params.name}`)
      const id = generateId()
      const edgeId = generateId()
      const now = new Date().toISOString()
      const chart: ChartNode = {
        id,
        kind: 'chart',
        name: params.name,
        ui: { position: params.position },
        plan: params.plan,
        createdAt: now,
        updatedAt: now,
      }

      // Persist the chart and its source reference as one workflow mutation.
      set((draft) => {
        draft.nodes[id] = chart
        draft.edges[edgeId] = {
          id: edgeId,
          fromNodeId: params.plan.sourceTableId,
          toNodeId: id,
          transformType: 'reference',
        }
      })

      return id
    },
  }
}
