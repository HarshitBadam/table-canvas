import { describe, expect, it } from 'vitest'
import { activeSidebarNodeId } from '@/layout/navigation/viewNavigation'

describe('activeSidebarNodeId', () => {
  it.each(['canvas', 'dashboard', 'report'] as const)(
    'does not highlight a selected node while %s is open',
    (view) => {
      expect(activeSidebarNodeId(view, 'table-1')).toBeNull()
    },
  )

  it.each(['grid', 'chart'] as const)(
    'highlights the selected node while %s is open',
    (view) => {
      expect(activeSidebarNodeId(view, 'node-1')).toBe('node-1')
    },
  )
})
