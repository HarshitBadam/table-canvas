import type { DiscoveryTourId } from './discoveryTourPersistence'

export type DiscoveryVisual =
  | 'connection'
  | 'workspace'
  | 'report-components'
  | 'suggestions'
  | 'formula'

export interface DiscoveryTourStep {
  id: string
  title: string
  description: string
  anchorIds?: readonly string[]
  visual?: DiscoveryVisual
  prepare?: 'open-report-insert'
}

export interface DiscoveryTourDefinition {
  id: DiscoveryTourId
  label: string
  steps: readonly DiscoveryTourStep[]
}

export const DISCOVERY_ANCHORS = {
  workspaceNavigation: 'workspace-navigation',
  reportStart: 'report-start',
  reportInsertTrigger: 'report-insert-trigger',
  reportInsertMenu: 'report-insert-menu',
  gridSuggestions: 'grid-suggestions',
  gridAddColumn: 'grid-add-column',
} as const

const TOURS: Record<DiscoveryTourId, DiscoveryTourDefinition> = {
  canvas: {
    id: 'canvas',
    label: 'Canvas',
    steps: [
      {
        id: 'canvas-connect',
        title: 'Build workflows by connecting tables',
        description: 'Drag from a handle on one table to another. Then choose how the tables should join, combine, or transform.',
        visual: 'connection',
      },
      {
        id: 'canvas-views',
        title: 'Three ways to work',
        description: 'Build pipelines in Canvas, understand the project in Dashboard, and turn results into documents in Report.',
        anchorIds: [DISCOVERY_ANCHORS.workspaceNavigation],
        visual: 'workspace',
      },
    ],
  },
  report: {
    id: 'report',
    label: 'Report',
    steps: [
      {
        id: 'report-components',
        title: 'Reports are more than text',
        description: 'Mix your narrative with live project data and purpose-built content blocks.',
        visual: 'report-components',
      },
      {
        id: 'report-insert',
        title: 'Your component library lives here',
        description: 'Use Insert inside a report. You can also type / to add linked tables, charts, editable tables, callouts, toggles, and more.',
        anchorIds: [
          DISCOVERY_ANCHORS.reportInsertMenu,
          DISCOVERY_ANCHORS.reportInsertTrigger,
          DISCOVERY_ANCHORS.reportStart,
        ],
        prepare: 'open-report-insert',
      },
    ],
  },
  grid: {
    id: 'grid',
    label: 'Table',
    steps: [
      {
        id: 'grid-suggestions',
        title: 'Let your data suggest the next step',
        description: 'Discover cleaning issues, useful patterns, and ready-to-run transformations for this table.',
        anchorIds: [DISCOVERY_ANCHORS.gridSuggestions],
        visual: 'suggestions',
      },
      {
        id: 'grid-formula',
        title: 'Create calculated columns',
        description: 'Add a column, choose Formula, and name the result. Table Canvas can suggest the expression automatically.',
        anchorIds: [DISCOVERY_ANCHORS.gridAddColumn],
        visual: 'formula',
      },
    ],
  },
}

export function getDiscoveryTour(id: DiscoveryTourId): DiscoveryTourDefinition {
  return TOURS[id]
}
