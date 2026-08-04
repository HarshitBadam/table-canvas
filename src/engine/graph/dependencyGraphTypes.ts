export interface DependencyGraph {
  upstream: Map<string, Set<string>>
  downstream: Map<string, Set<string>>
}
