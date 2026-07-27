import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  activeDocumentIdentity,
  documentProjectIdFromPath,
  documentProjectPath,
  type DocumentIdentity,
} from './documentIdentity'

interface DocumentSessionOptions {
  projectId: string | null
  /** Any value that changes on an auth transition, so the scope is re-read. */
  authToken: string
}

/** The project id this tab asked for, read once before the project list is known. */
export function requestedDocumentProjectId(): string | null {
  if (typeof window === 'undefined') return null
  return documentProjectIdFromPath(window.location.pathname)
}

/**
 * Resolves the active document and keeps the URL addressable. Auth transitions rewrite
 * the storage scope, so the identity is recomputed whenever the auth token changes.
 */
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
    if (!identity) return
    const path = documentProjectPath(identity.projectId)
    if (location.pathname === path || location.pathname.startsWith(`${path}/`)) return
    navigate(path, { replace: true })
  }, [identity, location.pathname, navigate])

  return identity
}
