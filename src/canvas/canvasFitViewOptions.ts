import type { FitViewOptions } from 'reactflow'

export const CANVAS_FIT_VIEW_OPTIONS = {
  padding: 0.08,
  maxZoom: 1.1,
  duration: 180,
} satisfies FitViewOptions

const SINGLE_NODE_FIT_VIEW_OPTIONS = {
  ...CANVAS_FIT_VIEW_OPTIONS,
  duration: 0,
} satisfies FitViewOptions

export function getCanvasFitViewOptions(nodeCount: number): FitViewOptions {
  return nodeCount <= 1 ? SINGLE_NODE_FIT_VIEW_OPTIONS : CANVAS_FIT_VIEW_OPTIONS
}

export function shouldFitViewOnMount(nodeCount: number, hasActiveImport: boolean): boolean {
  return nodeCount > 0 && !hasActiveImport
}
