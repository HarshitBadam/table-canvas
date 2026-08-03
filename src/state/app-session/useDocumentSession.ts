import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  activeDocumentIdentity,
  documentProjectIdFromPath,
  documentProjectPath,
  type DocumentIdentity,
} from '../document/documentIdentity'

interface DocumentSessionOptions {
  projectId: string | null
  /** Changes on auth transition so storage scope is re-read into the identity. */
  authToken: string
}

/** Project id from the URL, read before the project list is known. */
export function requestedDocumentProjectId(): string | null {
  if (typeof window === 'undefined') return null
  return documentProjectIdFromPath(window.location.pathname)
}

/** Keeps the URL addressable; recomputes identity when auth rewrites storage scope. */
export function useDocumentSession({
  projectId,
  authToken,
}: DocumentSessionOptions): DocumentIdentity | null {
  const location = useLocation()
  const navigate = useNavigate()
  const identity = useMemo(
    () => activeDocumentIdentity(projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authToken re-reads the scope
    [projectId, authToken],
  )

  useEffect(() => {
    if (!identity) {
      // Active project was cleared (deleted elsewhere, empty workspace). Clear
      // the stale /p/:id URL so refresh does not try to reopen a missing project.
      if (documentProjectIdFromPath(location.pathname)) {
        navigate('/', { replace: true })
      }
      return
    }
    const path = documentProjectPath(identity.projectId)
    if (location.pathname === path || location.pathname.startsWith(`${path}/`)) return
    navigate(path, { replace: true })
  }, [identity, location.pathname, navigate])

  return identity
}
