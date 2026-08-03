import { useEffect } from 'react'
import type { ViewMode } from './viewNavigation'

const BASE_TITLE = 'Table Canvas'

interface UseDocumentTitleArgs {
  projectName: string | null
  viewMode: ViewMode
  nodeName: string | null
  reportName: string | null
}

/**
 * Keeps the browser tab title in sync with what's open, following the
 * "context | project | app" convention (e.g. Slack, Jira).
 */
export function useDocumentTitle({ projectName, viewMode, nodeName, reportName }: UseDocumentTitleArgs) {
  useEffect(() => {
    const segments: string[] = []

    if ((viewMode === 'grid' || viewMode === 'chart') && nodeName) {
      segments.push(nodeName)
    } else if (viewMode === 'dashboard') {
      segments.push('Dashboard')
    } else if (viewMode === 'report') {
      segments.push(reportName || 'Report')
    }

    if (projectName) {
      segments.push(projectName)
    }

    segments.push(BASE_TITLE)
    document.title = segments.join(' | ')
  }, [projectName, viewMode, nodeName, reportName])
}
