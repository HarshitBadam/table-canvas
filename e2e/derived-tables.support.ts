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

interface MockFile {
  id: string
  filename: string
  contentType: string
  size: number
  uploadDate: string
  buffer: Buffer
}

export interface MockBackendState {
  projects: Map<string, MockProject>
  files: Map<string, MockFile>
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
    files: new Map<string, MockFile>(),
    projectNumber: 0,
    fileNumber: 0,
    pendingProjectUpdates: 0,
  }
}

/** Pulls the `file` field's raw bytes and filename out of a multipart/form-data body. */
function extractUploadedFilePart(
  request: import('@playwright/test').Request,
): { filename: string; buffer: Buffer } | null {
  const body = request.postDataBuffer()
  const contentType = request.headers()['content-type']
  const boundaryMatch = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/)
  const boundary = boundaryMatch ? (boundaryMatch[1] ?? boundaryMatch[2]) : null
  if (!body || !boundary) return null

  const delimiter = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let searchFrom = 0
  while (true) {
    const start = body.indexOf(delimiter, searchFrom)
    if (start === -1) break
    const next = body.indexOf(delimiter, start + delimiter.length)
    if (next === -1) break
    parts.push(body.subarray(start + delimiter.length, next))
    searchFrom = next
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue
    const headers = part.subarray(0, headerEnd).toString('latin1')
    if (!/name="file"/.test(headers)) continue
    const filenameMatch = headers.match(/filename="([^"]*)"/)
    if (!filenameMatch) continue
    let content = part.subarray(headerEnd + 4)
    if (content.subarray(-2).toString('latin1') === '\r\n') {
      content = content.subarray(0, -2)
    }
    return { filename: filenameMatch[1], buffer: content }
  }
  return null
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
      const uploadedPart = extractUploadedFilePart(request)
      const filename = uploadedPart?.filename ?? 'sample_workbook.xlsx'
      const buffer = uploadedPart?.buffer ?? readFileSync(workbookPath)
      const file: MockFile = {
        id: `sample-file-${state.fileNumber}`,
        filename,
        contentType: filename.endsWith('.csv') ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.byteLength,
        uploadDate: new Date().toISOString(),
        buffer,
      }
      state.files.set(file.id, file)
      await fulfillJson(route, {
        file: {
          id: file.id,
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
          uploadDate: file.uploadDate,
        },
      }, 201)
      return
    }
    if (path === '/api/files' && request.method() === 'GET') {
      await fulfillJson(route, {
        files: [...state.files.values()].map(({ buffer, ...meta }) => meta),
      })
      return
    }
    const fileMatch = path.match(/^\/api\/files\/([^/]+)$/)
    const requestedFileId = fileMatch ? decodeURIComponent(fileMatch[1]) : null
    if (requestedFileId && request.method() === 'GET') {
      const file = state.files.get(requestedFileId)
      if (!file) {
        await fulfillJson(route, null, 404)
        return
      }
      await route.fulfill({ status: 200, contentType: file.contentType, body: file.buffer })
      return
    }
    if (requestedFileId && request.method() === 'DELETE') {
      state.files.delete(requestedFileId)
      await fulfillJson(route, {})
      return
    }

    await route.fulfill({ status: 404, body: 'Not mocked' })
  })

  return {
    getProject: () => projects.get(projectId) ?? null,
    getProjects: () => [...projects.values()],
  }
}
