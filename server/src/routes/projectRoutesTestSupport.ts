import { beforeEach } from 'vitest'
import { createDefaultMockUser, createTestApp, type MockUser } from '../test/testApp.js'

let mockUser: MockUser
let app: ReturnType<typeof createTestApp>

beforeEach(() => {
  mockUser = createDefaultMockUser()
  app = createTestApp(mockUser)
})

export function getProjectRoutesTestContext() {
  return { app, mockUser }
}
