# Architecture

## System Overview

Table Canvas follows a hybrid architecture where computation happens client-side (DuckDB-WASM) while optional server-side persistence provides authentication and cross-device sync.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   React UI  │  │   Zustand   │  │     IndexedDB       │  │
│  │  (Canvas,   │◄─┤   Stores    │◄─┤  (Projects, Files)  │  │
│  │   Grid)     │  │             │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                  │
│         │         ┌──────▼──────┐                           │
│         │         │  Web Worker │                           │
│         └────────►│  DuckDB-WASM│                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                            │
                       ( Sync)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        Server                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Express   │◄─┤  Services   │◄─┤      MongoDB        │  │
│  │   Routes    │  │  (Auth,     │  │  (Users, Projects)  │  │
│  │             │  │   Files)    │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Dependency Graph (DAG)

The core data model is a directed acyclic graph where nodes are tables and edges represent data dependencies.

### Node Types

| Type | Description | Properties |
|------|-------------|------------|
| `source_table` | Imported CSV/Excel | `fileRef`, `schema`, `patches` |
| `derived_table` | Computed from transforms | `transformDef`, `upstreamNodeIds` |
| `chart` | Visualization | `sourceTableId`, `chartType`, `config` |

### Edge Properties

```typescript
interface Edge {
  id: string
  fromNodeId: string      // Upstream (data source)
  toNodeId: string        // Downstream (dependent)
  transformType: string   // 'filter' | 'join' | 'group' | ...
}
```

### Cycle Detection

Before creating edges, the system checks for cycles using DFS with three-color marking:

```typescript
// src/engine/dependencyGraph.ts
function wouldCreateCycle(edges, sourceId, targetId): boolean {
  // Self-loop check
  if (sourceId === targetId) return true
  
  // Build adjacency graph
  const graph = buildDependencyGraph(edges)
  
  // Check if targetId can reach sourceId
  return isReachable(graph.downstream, targetId, sourceId)
}
```

### Topological Sort

Computation order is determined by topological sort, ensuring upstream tables are materialized before downstream consumers:

```typescript
function getComputationOrder(targetNodeId, nodes, edges): string[] {
  // Returns nodes in dependency order
  // [upstream1, upstream2, ..., targetNode]
}
```

## State Management

### Store Architecture

State is managed by Zustand with Immer for immutable updates. The store is composed from domain slices:

```
projectStore
├── nodesSlice      # Table/chart node CRUD
├── edgesSlice      # Connection management
├── patchesSlice    # Cell edits, row insertions/deletions
├── historySlice    # Undo/redo stack
└── selectionSlice  # UI selection state
```

### Dirty Propagation

When a source table is edited, all downstream derived tables are marked dirty:

```typescript
// On cell edit
setCellValue(tableId, rowId, colId, value) {
  // 1. Update patches
  // 2. Mark node and descendants dirty
  markNodeAndDescendantsDirty(tableId)
}
```

The `markNodeAndDescendantsDirty` function traverses the downstream graph and sets `cacheInfo.isDirty = true` on all affected nodes.

## Computation Engine

### Web Worker Architecture

DuckDB-WASM runs in a dedicated Web Worker to avoid blocking the UI thread:

```
Main Thread                    Worker Thread
     │                              │
     │  ──── loadTable ────►        │
     │  ◄─── ready ────────         │
     │                              │
     │  ──── executeTransform ──►   │
     │  ◄─── result ────────────    │
     │                              │
```

Communication uses a simple RPC protocol:

```typescript
// src/engine/worker/rpc.ts
class WorkerRPC {
  call<T>(method: string, params: unknown): Promise<T>
  waitForReady(): Promise<void>
}
```

### Materialization Service

The materialization service orchestrates computation:

```typescript
async function ensureTableMaterialized(tableId): Promise<MaterializationResult> {
  // 1. Check if already in progress (dedup)
  // 2. Get computation order
  // 3. Materialize each node in order
  // 4. Update cache info
}
```

**Race condition handling:**
- `inProgressMaterializations` Map prevents duplicate concurrent requests
- `materializationQueue` Promise chain ensures sequential execution

### Cache Invalidation

Version hashes track whether cached data is stale:

```typescript
// Source table hash
hash = simpleHash(`source:${tableId}:${fileRef}:${patchVersion}`)

// Derived table hash  
hash = simpleHash(`derived:${tableId}:${transformDefJson}:${upstreamHashes}`)
```

## Data Flow

### Import Flow

```
User selects file
       │
       ▼
Parse CSV/Excel (PapaParse/xlsx)
       │
       ▼
Infer schema (column types)
       │
       ▼
Save file to IndexedDB
       │
       ▼
Create source_table node
       │
       ▼
Load into DuckDB
```

### Transform Flow

```
User connects nodes on canvas
       │
       ▼
Check for cycles
       │
       ▼
Open transform modal
       │
       ▼
User configures transform
       │
       ▼
Create derived_table node + edge
       │
       ▼
Execute SQL in DuckDB
       │
       ▼
Store result + update schema
```

### Export Flow

```
User exports project
       │
       ▼
Collect all nodes, edges, patches
       │
       ▼
Load file blobs from IndexedDB
       │
       ▼
Base64 encode files
       │
       ▼
Bundle as ZIP:
├── project.tablecanvas.json
├── data.xlsx (all tables as sheets)
└── reports/*.html
```

## Transform Definitions

Each transform type has a specific definition structure:

### Filter
```typescript
{
  type: 'filter',
  sourceTableId: string,
  conditions: FilterCondition[],
  logic: 'and' | 'or'
}
```

### Group/Summarize
```typescript
{
  type: 'group_summarize',
  sourceTableId: string,
  groupByColumns: string[],
  aggregations: [{
    columnId: string,
    operation: 'sum' | 'avg' | 'min' | 'max' | 'count',
    alias: string
  }]
}
```

### Join
```typescript
{
  type: 'join',
  leftTableId: string,
  rightTableId: string,
  joinType: 'inner' | 'left' | 'right' | 'full',
  leftKey: string,
  rightKey: string
}
```

### Pivot
```typescript
{
  type: 'pivot',
  sourceTableId: string,
  rowColumns: string[],
  pivotColumn: string,
  valueColumn: string,
  aggregation: 'sum' | 'avg' | 'count'
}
```

## Persistence Layer

### IndexedDB Schema

```typescript
interface TableCanvasDB {
  projects: {
    key: string
    value: StoredProject
    indexes: { 'by-updated': string }
  }
  files: {
    key: string
    value: { id, name, type, data: ArrayBuffer }
  }
  cache: {
    key: [string, string]  // [tableId, type]
    value: { tableId, type, data, computedAt }
  }
  reports: {
    key: string
    value: Report
  }
}
```

### Server Sync

When the backend is available, projects sync bidirectionally:

1. **Save:** Local changes → API → MongoDB
2. **Load:** MongoDB → API → Local store

The sync service handles conflicts by timestamp comparison.

## Error Boundaries

React error boundaries wrap major feature areas:

```
App
├── FeatureErrorBoundary (Canvas)
├── FeatureErrorBoundary (Grid)
├── FeatureErrorBoundary (Charts)
└── FeatureErrorBoundary (Reports)
```

Each boundary catches render errors and displays a recovery UI without crashing the entire application.
