export { EngineAdapter, getEngine } from './EngineAdapter'
export * from './types'

// Dependency graph utilities
export {
  buildDependencyGraph,
  wouldCreateCycle,
  detectCycles,
  getTopologicalOrder,
  getComputationOrder,
  getAllDescendants,
  getAllAncestors,
  getDirectUpstream,
  getDirectDownstream,
  getNodeDepth,
  isAncestorOf,
  isDescendantOf,
  getRootNodes,
  getLeafNodes,
} from './dependencyGraph'

// Materialization service
export {
  ensureTableMaterialized,
  needsMaterialization,
  forceMaterialize,
  getMaterializationStatus,
  getTableData,
} from './materializationService'
export type { MaterializationResult, MaterializationStatus } from './materializationService'