import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page, Route } from '@playwright/test'

interface MockProject {
  id: string
  name: string
  nodes: Record<string, unknown>
  edges: Record<string, unknown>
  patches: Record<string, unknown>
  reports: Record<string, unknown>
  revision: number
  createdAt: string
  updatedAt: string
}

export interface MockBackendState {
  projects: Map<string, MockProject>
  projectNumber: number
  fileNumber: number
  pendingProjectUpdates: number
}

interface MockBackendOptions {
  projectId?: string
  projectName?: string
  state?: MockBackendState
  projectUpdateDelayMs?: number
}

export function createMockBackendState(): MockBackendState {
  return {
    projects: new Map<string, MockProject>(),
    projectNumber: 0,
    fileNumber: 0,
    pendingProjectUpdates: 0,
  }
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data }),
  })
}

export async function installMockBackend(
  page: Page,
  options: MockBackendOptions = {},
) {
  const projectId = options.projectId ?? 'sample-project'
  const projectName = options.projectName ?? 'Sample Workbook Project'
  const workbookPath = resolve(process.cwd(), 'data/sample_workbook.xlsx')
  const state = options.state ?? createMockBackendState()
  const projects = state.projects
  const user = {
    id: 'sample-user',
    email: 'sample@example.com',
    name: 'Sample User',
    tier: 'google',
    createdAt: new Date().toISOString(),
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/api/auth/me') {
      await fulfillJson(route, { user })
      return
    }
    if (path === '/api/projects' && request.method() === 'GET') {
      await fulfillJson(route, {
        projects: [...projects.values()]
          .map(project => ({
              id: project.id,
              name: project.name,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            })),
      })
      return
    }
    if (path === '/api/projects' && request.method() === 'POST') {
      state.projectNumber += 1
      const now = new Date().toISOString()
      const requested = request.postDataJSON() as { name?: string } | null
      const id = state.projectNumber === 1 ? projectId : `${projectId}-${state.projectNumber}`
      const project: MockProject = {
        id,
        name: state.projectNumber === 1
          ? projectName
          : (requested?.name || `Project ${state.projectNumber}`),
        nodes: {},
        edges: {},
        patches: {},
        reports: {},
        revision: 0,
        createdAt: now,
        updatedAt: now,
      }
      projects.set(id, project)
      await fulfillJson(route, { project }, 201)
      return
    }
    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/)
    const requestedProjectId = projectMatch ? decodeURIComponent(projectMatch[1]) : null
    if (requestedProjectId && request.method() === 'GET') {
      const project = projects.get(requestedProjectId) ?? null
      await fulfillJson(route, { project })
      return
    }
    if (requestedProjectId && request.method() === 'PUT') {
      const existing = projects.get(requestedProjectId)
      if (!existing) {
        await fulfillJson(route, null, 404)
        return
      }
      const {
        expectedRevision,
        ...update
      } = request.postDataJSON() as Partial<MockProject> & { expectedRevision?: number }
      if (expectedRevision !== existing.revision) {
        await fulfillJson(route, null, 409)
        return
      }
      const project: MockProject = {
        ...existing,
        ...update,
        revision: existing.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      projects.set(requestedProjectId, project)
      if (options.projectUpdateDelayMs) {
        state.pendingProjectUpdates += 1
        try {
          await new Promise(resolve => setTimeout(resolve, options.projectUpdateDelayMs))
        } finally {
          state.pendingProjectUpdates -= 1
        }
      }
      await fulfillJson(route, { project })
      return
    }
    if (requestedProjectId && request.method() === 'DELETE') {
      const existing = projects.get(requestedProjectId)
      const requested = request.postDataJSON() as { expectedRevision?: number } | null
      if (!existing) {
        await fulfillJson(route, null, 404)
        return
      }
      if (requested?.expectedRevision !== existing.revision) {
        await fulfillJson(route, null, 409)
        return
      }
      projects.delete(requestedProjectId)
      await fulfillJson(route, {})
      return
    }
    if (path === '/api/files/upload' && request.method() === 'POST') {
      state.fileNumber += 1
      await fulfillJson(route, {
        file: {
          id: `sample-file-${state.fileNumber}`,
          filename: 'sample_workbook.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: readFileSync(workbookPath).byteLength,
          uploadDate: new Date().toISOString(),
        },
      }, 201)
      return
    }

    await route.fulfill({ status: 404, body: 'Not mocked' })
  })

  return {
    getProject: () => projects.get(projectId) ?? null,
    getProjects: () => [...projects.values()],
  }
}
