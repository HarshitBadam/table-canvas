import { describe, expect, it } from 'vitest'
import type { Node } from 'reactflow'
import { getLayoutedNodes } from './autoLayout'

function tableNode(id: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { ui: { viewMode: 'collapsed' } },
  }
}

describe('getLayoutedNodes', () => {
  it('arranges disconnected nodes from left to right', () => {
    const nodes = getLayoutedNodes(
      [tableNode('one'), tableNode('two'), tableNode('three')],
      [],
      { direction: 'LR' },
    )

    expect(nodes.map(node => node.position.y)).toEqual([50, 50, 50])
    expect(nodes[0].position.x).toBeLessThan(nodes[1].position.x)
    expect(nodes[1].position.x).toBeLessThan(nodes[2].position.x)
  })

  it('arranges disconnected nodes from top to bottom', () => {
    const nodes = getLayoutedNodes(
      [tableNode('one'), tableNode('two'), tableNode('three')],
      [],
      { direction: 'TB' },
    )

    expect(nodes.map(node => node.position.x)).toEqual([50, 50, 50])
    expect(nodes[0].position.y).toBeLessThan(nodes[1].position.y)
    expect(nodes[1].position.y).toBeLessThan(nodes[2].position.y)
  })
})
