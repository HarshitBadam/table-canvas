import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from 'reactflow'

import { CANVAS_FIT_VIEW_OPTIONS, CanvasFitView } from '@/canvas/CanvasFitView'
import { updateNodeCacheInfo, useTableRuntimeStore } from '@/state/tableRuntimeStore'

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => true),
  nodesInitialized: true,
  updateNodeInternals: vi.fn(),
}))

vi.mock('reactflow', () => ({
  useNodesInitialized: () => flow.nodesInitialized,
  useReactFlow: () => ({ fitView: flow.fitView }),
  useUpdateNodeInternals: () => flow.updateNodeInternals,
}))

function tableNode(id: string, columns = 1): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      schema: {
        columns: Array.from({ length: columns }, (_, index) => ({
          id: `column-${index}`,
          name: `Column ${index}`,
          type: 'string',
        })),
        rowCount: 1,
      },
    },
  }
}

describe('CanvasFitView', () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    flow.fitView.mockReset().mockReturnValue(true)
    flow.updateNodeInternals.mockReset()
    flow.nodesInitialized = true
    useTableRuntimeStore.getState().resetRuntime()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  it('waits for import completion before fitting the measured graph', () => {
    const existing = tableNode('existing')
    const imported = tableNode('imported')
    const view = render(
      <CanvasFitView nodes={[existing]} projectId="project" selectedNodeId="existing" />,
    )
    act(() => frames.shift()?.(0))
    flow.fitView.mockClear()
    flow.updateNodeInternals.mockClear()

    act(() => {
      updateNodeCacheInfo('imported', { phase: 'reading' })
      view.rerender(
        <CanvasFitView
          nodes={[existing, imported]}
          projectId="project"
          selectedNodeId="imported"
        />,
      )
    })

    expect(flow.updateNodeInternals).not.toHaveBeenCalled()
    expect(flow.fitView).not.toHaveBeenCalled()

    act(() => updateNodeCacheInfo('imported', { phase: 'ready' }))
    expect(flow.updateNodeInternals).toHaveBeenCalledWith(['imported'])
    expect(flow.fitView).not.toHaveBeenCalled()

    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledOnce()
    expect(flow.fitView).toHaveBeenCalledWith(CANVAS_FIT_VIEW_OPTIONS)
  })

  it('retains the pending import until React Flow accepts the fit', () => {
    const existing = tableNode('existing')
    const imported = tableNode('imported')
    updateNodeCacheInfo('imported', { phase: 'reading' })
    const view = render(
      <CanvasFitView nodes={[existing]} projectId="project" selectedNodeId="existing" />,
    )
    act(() => frames.shift()?.(0))
    flow.fitView.mockClear()
    flow.updateNodeInternals.mockClear()

    view.rerender(
      <CanvasFitView
        nodes={[existing, imported]}
        projectId="project"
        selectedNodeId="imported"
      />,
    )
    flow.fitView.mockReturnValueOnce(false).mockReturnValueOnce(true)
    act(() => updateNodeCacheInfo('imported', { phase: 'ready' }))

    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledTimes(1)
    expect(flow.updateNodeInternals).toHaveBeenCalledTimes(2)

    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledTimes(2)
    expect(flow.fitView).toHaveBeenLastCalledWith(CANVAS_FIT_VIEW_OPTIONS)
  })
})
