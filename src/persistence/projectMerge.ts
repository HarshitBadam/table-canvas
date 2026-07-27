import type { Edge } from '@/types'
import type { Report } from '@/report/types'
import { removeCyclicEdges } from '@/engine/workflowGraph'
import type { ProjectSnapshot } from './dbCore'
import {
  collectLocalWinningNodeIds,
  compareStrings,
  isDeepEqual,
  isLocalNewer,
  mergeNodeMaps,
  sortedRecord,
  unionKeys,
} from './projectMergeNodes'
import { mergePatchMaps } from './projectMergePatches'

export interface MergeInput {
  base: ProjectSnapshot | null
  local: ProjectSnapshot
  server: ProjectSnapshot
}

export type MergeOutcome =
  | {
    status: 'merged'
    snapshot: ProjectSnapshot
    recoveredReportIds: string[]
    droppedEdgeIds: string[]
  }
  | { status: 'unmergeable'; reason: 'missing_base' | 'limits_exceeded' }

const MAX_NODES = 5_000
const MAX_EDGES = 20_000
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024

function mergeName(base: string, local: string, server: string): string {
  return local !== base && server === base ? local : server
}

function mergeEdges(
  base: Record<string, Edge>,
  local: Record<string, Edge>,
  server: Record<string, Edge>,
  nodeIds: Set<string>,
): { edges: Record<string, Edge>; droppedEdgeIds: string[] } {
  const retained: Record<string, Edge> = {}
  const droppedEdgeIds: string[] = []
  for (const edgeId of unionKeys(base, local, server)) {
    const localEdge = local[edgeId]
    const serverEdge = server[edgeId]
    if (edgeId in base && (!localEdge || !serverEdge)) continue
    const edge = serverEdge ?? localEdge
    if (!edge) continue
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      droppedEdgeIds.push(edgeId)
      continue
    }
    retained[edgeId] = edge
  }

  const retainedIds = Object.keys(retained)
  const acyclic = removeCyclicEdges(retained, [
    ...retainedIds.filter(edgeId => edgeId in base),
    ...retainedIds.filter(edgeId => !(edgeId in base)),
  ])
  return {
    edges: sortedRecord(acyclic.edges),
    droppedEdgeIds: [...droppedEdgeIds, ...acyclic.removedEdgeIds].sort(compareStrings),
  }
}

function mergeReports(
  base: Record<string, Report>,
  local: Record<string, Report>,
  server: Record<string, Report>,
): { reports: Record<string, Report>; recoveredReportIds: string[] } {
  const reports: Record<string, Report> = {}
  const recoveredReportIds: string[] = []
  for (const reportId of unionKeys(base, local, server)) {
    const baseReport = base[reportId]
    const localReport = local[reportId]
    const serverReport = server[reportId]
    if (!localReport && !serverReport) continue
    if (!localReport || !serverReport) {
      const survivor = localReport ?? serverReport
      if (!isDeepEqual(survivor, baseReport)) reports[reportId] = survivor
      continue
    }
    if (isDeepEqual(localReport, baseReport) || isDeepEqual(localReport, serverReport)) {
      reports[reportId] = serverReport
      continue
    }
    if (isDeepEqual(serverReport, baseReport)) {
      reports[reportId] = localReport
      continue
    }
    const localWins = isLocalNewer(localReport.updatedAt, serverReport.updatedAt)
    const loser = localWins ? serverReport : localReport
    const recoveredId = `${reportId}__recovered`
    reports[reportId] = localWins ? localReport : serverReport
    reports[recoveredId] = { ...loser, id: recoveredId, name: `${loser.name} (recovered)` }
    recoveredReportIds.push(recoveredId)
  }
  return {
    reports: sortedRecord(reports),
    recoveredReportIds: recoveredReportIds.sort(compareStrings),
  }
}

function exceedsLimits(snapshot: ProjectSnapshot): boolean {
  if (Object.keys(snapshot.nodes).length > MAX_NODES) return true
  if (Object.keys(snapshot.edges).length > MAX_EDGES) return true
  return new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_PAYLOAD_BYTES
}

export function mergeProjectSnapshots(input: MergeInput): MergeOutcome {
  const { base, local, server } = input
  if (!base) return { status: 'unmergeable', reason: 'missing_base' }

  const nodes = mergeNodeMaps(base.nodes, local.nodes, server.nodes)
  const nodeIds = new Set(Object.keys(nodes))
  const { edges, droppedEdgeIds } = mergeEdges(base.edges, local.edges, server.edges, nodeIds)
  const { reports, recoveredReportIds } = mergeReports(base.reports, local.reports, server.reports)
  const snapshot: ProjectSnapshot = {
    name: mergeName(base.name, local.name, server.name),
    nodes,
    edges,
    patches: mergePatchMaps(base.patches, local.patches, server.patches, {
      nodeIds,
      localWinningNodeIds: collectLocalWinningNodeIds(local.nodes, server.nodes),
    }),
    reports,
  }

  if (exceedsLimits(snapshot)) return { status: 'unmergeable', reason: 'limits_exceeded' }
  return { status: 'merged', snapshot, recoveredReportIds, droppedEdgeIds }
}
