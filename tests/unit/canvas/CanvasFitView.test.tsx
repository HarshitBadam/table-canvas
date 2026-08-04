import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from 'reactflow'

import { CanvasFitView } from '@/canvas/CanvasFitView'
import {
  CANVAS_FIT_VIEW_OPTIONS,
  shouldFitViewOnMount,
} from '@/canvas/canvasFitViewOptions'
import {
  beginCanvasImportBatch,
  completeCanvasImportBatch,
  registerCanvasImportNode,
  resetCanvasImportBatches,
  useCanvasImportBatchStore,
} from '@/state/runtime/canvasImportBatchStore'

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => true),
  nodesInitialized: true,
  setCenter: vi.fn(),
  updateNodeInternals: vi.fn(),
  viewportInitialized: true,
}))

vi.mock('reactflow', () => ({
  useNodesInitialized: () => flow.nodesInitialized,
  useReactFlow: () => ({
    fitView: flow.fitView,
    setCenter: flow.setCenter,
    viewportInitialized: flow.viewportInitialized,
  }),
  useUpdateNodeInternals: () => flow.updateNodeInternals,
}))

function tableNode(id: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
  }
}

describe('CanvasFitView', () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    flow.fitView.mockReset().mockReturnValue(true)
    flow.setCenter.mockReset()
    flow.updateNodeInternals.mockReset()
    flow.nodesInitialized = true
    flow.viewportInitialized = true
    resetCanvasImportBatches()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  it('fits as soon as a second imported node appears while still loading', () => {
    const existing = tableNode('existing')
    const imported = tableNode('imported')
    const view = render(<CanvasFitView nodes={[existing]} projectId="project" />)
    flow.fitView.mockClear()
    flow.updateNodeInternals.mockClear()
    frames = []

    const batchId = beginCanvasImportBatch('project')
    registerCanvasImportNode(batchId, imported.id)
    act(() => {
      view.rerender(<CanvasFitView nodes={[existing, imported]} projectId="project" />)
    })

    expect(flow.updateNodeInternals).toHaveBeenCalledWith(['imported'])
    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledOnce()
    expect(flow.fitView).toHaveBeenCalledWith(CANVAS_FIT_VIEW_OPTIONS)
  })

  it('retries a progressive fit until React Flow accepts measured bounds', () => {
    const existing = tableNode('existing')
    const imported = tableNode('imported')
    const view = render(<CanvasFitView nodes={[existing]} projectId="project" />)
    flow.fitView.mockClear()
    frames = []

    const batchId = beginCanvasImportBatch('project')
    registerCanvasImportNode(batchId, imported.id)
    flow.fitView.mockReturnValueOnce(false).mockReturnValueOnce(true)
    act(() => {
      view.rerender(<CanvasFitView nodes={[existing, imported]} projectId="project" />)
    })

    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledTimes(1)
    expect(useCanvasImportBatchStore.getState().activeBatches[batchId]).toBeTruthy()

    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledTimes(2)
  })

  it('fits after each newly appearing table in a multi-table import', () => {
    const existing = tableNode('existing')
    const firstImport = tableNode('first-import')
    const secondImport = tableNode('second-import')
    const batchId = beginCanvasImportBatch('project')
    registerCanvasImportNode(batchId, firstImport.id)
    const view = render(
      <CanvasFitView nodes={[existing]} projectId="project" />,
    )

    act(() => {
      view.rerender(
        <CanvasFitView nodes={[existing, firstImport]} projectId="project" />,
      )
    })
    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledTimes(1)
    flow.fitView.mockClear()
    flow.updateNodeInternals.mockClear()
    frames = []

    act(() => {
      registerCanvasImportNode(batchId, secondImport.id)
      view.rerender(
        <CanvasFitView
          nodes={[existing, firstImport, secondImport]}
          projectId="project"
        />,
      )
    })

    expect(flow.updateNodeInternals).toHaveBeenCalledWith(['second-import'])
    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledOnce()
    expect(flow.fitView).toHaveBeenCalledWith(CANVAS_FIT_VIEW_OPTIONS)
  })

  it('refits when undo/redo restores multiple tables at once', () => {
    const first = tableNode('first')
    const second = tableNode('second')
    const third = tableNode('third')
    const view = render(
      <CanvasFitView nodes={[first, second, third]} projectId="project" />,
    )
    expect(flow.fitView).not.toHaveBeenCalled()

    act(() => {
      view.rerender(<CanvasFitView nodes={[]} projectId="project" />)
    })
    expect(flow.setCenter).toHaveBeenCalledWith(270, 190, {
      zoom: 1,
      duration: 0,
    })
    flow.fitView.mockClear()
    flow.updateNodeInternals.mockClear()
    frames = []

    act(() => {
      view.rerender(
        <CanvasFitView nodes={[first, second, third]} projectId="project" />,
      )
    })

    expect(flow.updateNodeInternals).toHaveBeenCalledWith(['first', 'second', 'third'])
    act(() => frames.shift()?.(0))
    expect(flow.fitView).toHaveBeenCalledOnce()
    expect(flow.fitView).toHaveBeenCalledWith(CANVAS_FIT_VIEW_OPTIONS)
  })

  it('lets initial React Flow fitting handle batches completed while canvas was closed', () => {
    const imported = tableNode('imported')
    const batchId = beginCanvasImportBatch('project')
    registerCanvasImportNode(batchId, imported.id)
    completeCanvasImportBatch(batchId)

    render(<CanvasFitView nodes={[imported]} projectId="project" />)

    expect(flow.fitView).not.toHaveBeenCalled()
    expect(useCanvasImportBatchStore.getState().completedBatches).toHaveLength(0)
  })

  it('keeps the pre-centered viewport fixed through first-node completion', () => {
    const imported = tableNode('imported')
    const batchId = beginCanvasImportBatch('project')
    registerCanvasImportNode(batchId, imported.id)
    const view = render(<CanvasFitView nodes={[]} projectId="project" />)
    flow.setCenter.mockClear()

    act(() => {
      view.rerender(<CanvasFitView nodes={[imported]} projectId="project" />)
    })
    act(() => completeCanvasImportBatch(batchId))

    expect(flow.fitView).not.toHaveBeenCalled()
    expect(frames).toHaveLength(0)
    expect(useCanvasImportBatchStore.getState().completedBatches).toHaveLength(0)
  })

  it('pre-centers an empty canvas for its first default-positioned node', () => {
    render(<CanvasFitView nodes={[]} projectId="project" />)

    expect(flow.setCenter).toHaveBeenCalledWith(270, 190, {
      zoom: 1,
      duration: 0,
    })
    expect(flow.fitView).not.toHaveBeenCalled()
  })

  it('does not enable React Flow initial fitting for an empty or importing canvas', () => {
    expect(shouldFitViewOnMount(0, false)).toBe(false)
    expect(shouldFitViewOnMount(1, true)).toBe(false)
    expect(shouldFitViewOnMount(1, false)).toBe(true)
  })
})
