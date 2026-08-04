import { useEffect } from 'react'
import type { ViewMode } from './navigation/viewNavigation'

const BASE_TITLE = 'Table Canvas'

interface UseDocumentTitleArgs {
  projectName: string | null
  viewMode: ViewMode
  nodeName: string | null
  reportName: string | null
}

/** Tab title uses the "context | project | app" convention (e.g. Slack, Jira). */
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

    // Cross-tab sign-out (or any other reason MainApp unmounts) must not leave
    // the browser tab showing a stale project name after the workspace is gone.
    return () => {
      document.title = BASE_TITLE
    }
  }, [projectName, viewMode, nodeName, reportName])
}
