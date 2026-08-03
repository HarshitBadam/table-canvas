# Multi-tab editing: problem, research, and plan

Status: **implemented and superseded.** Layers L0–L3 and the client merge shipped; `ExclusiveTabGate` and `tabOwnership` are deleted. This file is kept as the design record — the reasoning, the rejected alternatives, and the UX states. The living contract is [Reliability](reliability.md); read that first if you only need current behaviour. L4 (operation log) remains out of scope; see [Out of scope](#out-of-scope).

Four corrections from the implementation audit apply to everything below.

1. **Data edits keep bumping `updatedAt` explicitly.** Dirty flags moved to the per-tab runtime store in L1, but the document-level timestamp did not: real data edits call `touchNodeUpdatedAt`. Cell patches carry values only, so that timestamp is the merge's sole arbiter for same-cell collisions and had to survive L1 intact.
2. **Ties are resolved deterministically, server first.** `updateNodePosition` and `updateNodeUI` never bump `updatedAt`, so `ui` and position collisions have nothing to compare; those, equal timestamps, and unparseable timestamps all resolve to the server. Both devices must land on the same snapshot, which matters more than which side wins.
3. **Client clocks are trusted, knowingly.** Every `updatedAt` is `new Date().toISOString()` on the device that made the edit, so a skewed clock can win an arbitration it should lose, and the conflict copy only catches merges that fail rather than merges that resolve wrongly. Accepted: fixing it needs a server-authoritative clock. Reports are exempt — the losing version survives as a "(recovered)" copy.
4. **The cycle check is new code.** `src/engine/graph/workflowGraph.ts` had no cycle helper; `hasEdgeCycle` and `removeCyclicEdges` were added beside `getDependentNodeIds` for the edge merge.

The drag-coalescing task below is obsolete: canvas drags already commit only on drag-stop, and the ~800ms autosave debounce covers the rest. The `visibilitychange` flush also already existed; L1 added the `pagehide` and handover flushes.

## The symptom

Opening the app in a single tab can show a full-screen wall: "Table Canvas is open in another tab", with no way forward except "Use this tab instead". Opening a second tab always shows it, even for unrelated projects.

## Two root causes

**1. A false positive from a correct-but-misused lock.** `ExclusiveTabGate` requests the lock with `ifAvailable: true` and treats a miss as "another tab owns this" (`src/components/ExclusiveTabGate.tsx:116`). React `StrictMode` mounts effects twice in development (`src/main.tsx:17`): the first mount takes the lock, cleanup resolves the hold promise, then the second mount probes before the release has actually settled, misses, and shows the wall. The gate never retries, so a lone tab stays walled until the user clicks through.

**2. The lock is app-wide, not per-document.** One lock name, `table-canvas:active-workspace`, guards the whole origin (`src/components/ExclusiveTabGate.tsx:4`). Two tabs on unrelated projects cannot conflict, and a guest tab plus a signed-in tab address different storage scopes entirely, yet all of them are blocked.

## What the code does today

- IndexedDB `table-canvas-v2`, records keyed `scope\u001fentityId` where scope is `guest` or `account:<userId>` (`src/persistence/storage/storageScope.ts:27`).
- DuckDB-WASM runs per tab, opened as `:memory:` (`src/engine/worker/engine.worker.ts:44`). Nothing is shared between tabs, and each tab rebuilds tables from imported files plus patches.
- Saves are whole-snapshot: `saveProjectWithSync` writes the entire `{name, nodes, edges, patches, reports}` payload and enqueues a sync operation carrying `expectedRevision` (`src/persistence/sync/project/save/projectSaveSync.ts:100`).
- The server does compare-and-swap on `revision` and returns 409 to a stale writer (`server/src/routes/projects.ts:80`). The client turns a 409 into a `local_*` conflict copy (`src/persistence/sync/project/projectSync.ts:191`).
- Autosave fires on every change to `nodes`, `edges`, `patches`, or `projectName` with no debounce (`src/state/app-session/AppProvider.tsx:214`).
- One project is loaded at a time, chosen as `projects[0]` (`src/state/project/projectLifecycle.ts:82`). There is no project id in the route (`src/layout/App.tsx:56`), so a tab cannot express which project it wants.
- Undo/redo is local snapshot history (`src/state/stores/historySlice.ts`).

## What actually breaks, per case

Rows are the three real workflows; columns are the identity dimensions. Every "safe" cell is nonetheless blocked by today's gate.

| | Two guests | Guest + signed-in | Same user, two tabs |
|---|---|---|---|
| Same project | Silent last-write-wins in IndexedDB, no server to catch it | Not expressible: different scopes are different documents | Silent local clobber, then a 409 that spawns a `local_*` copy |
| Different projects | Safe | Safe | Safe |
| Edit + watch report | Watcher also writes (see below) and clobbers; its view never updates | Not expressible | Same, plus 409 churn |

Two conclusions follow. Only **same-scope** pairs need any machinery, so guest and signed-in tabs must never coordinate. And every genuinely broken cell fails *silently*, which is the real defect: the enforcement is in the wrong place and the failure mode is invisible.

**The watcher is not read-only today.** Materialization writes `cacheInfo` (`isDirty`, `dataRevision`, `lastRowCount`) into nodes, and the autosave effect fires on any `nodes` change. `withoutTransientComputeState` strips only `isComputing` (`src/state/document/transientProjectState.ts:4`). So a tab that merely opens a dashboard still mutates the document and writes a full snapshot. No design where one tab "just watches" is sound until this is fixed.

## Research: how other products solve this

**Per-document scoping (case 2).** Universal. Figma, draw.io's file mode, VS Code, Obsidian, every IDE: the document is URL-addressable and any lock is scoped to the document, never the app. This app has no project id in the route, which is precisely why its lock had to be app-wide.

**Leader election plus change broadcast (case 3).** RxDB ships `LeaderElection` explicitly: one tab runs replication, all tabs share the database and receive change events over `BroadcastChannel`. Dexie does the same with observable change streams. The `broadcast-channel` package's `LeaderElection` and web.dev's Web Locks guide are the canonical recipes. Note the ordering RxDB chose: make storage concurrency-safe first, elect a leader only for the network side. The leader is an optimization, not the safety mechanism.

**Merge (case 1), in rising cost.**

- *Versioned per-field last-write-wins.* Figma's multiplayer is publicly described as last-write-wins per object property with the server assigning order — deliberately not a full CRDT. Excalidraw reconciles elements by per-element `version` / `versionNonce`. Cheap, no dependency, and adequate for a node graph and sparse cell overrides. Unacceptable for rich text.
- *CRDT.* Yjs is the mature local-first option: `y-indexeddb` for persistence, BroadcastChannel cross-tab sync in its providers, `y-websocket` for a server, and — decisive here — TipTap ships an official Yjs Collaboration extension, and reports are TipTap (`src/report/reportStore.ts`). Automerge 2 is the alternative with nicer JSON ergonomics and a weaker TipTap story. Both converge without a server, so both would work for guests.
- *OT with a server authority.* Google Docs. Strongest semantics, requires the server in the loop, so it cannot serve guest mode.
- *Client-group mutation logs.* Replicache/Zero and Linear's sync engine: local optimistic mutations, server rebase, multiple tabs of one user sharing a client group. Excellent, but server-mandatory.
- *Conflicted copies.* Dropbox, Google Drive desktop, Obsidian, iCloud. The honest backstop everyone keeps. This app already has it and it must survive.

**The constraint that eliminates half of these.** Guest mode has no server, so any merge mechanism must converge purely client-side. That rules out OT, Replicache/Zero, and ElectricSQL as the primary mechanism.

## Decisions

**D1. No operation log or CRDT for the tab problem.** One person cannot type in two tabs at once. Good UX requires only that every tab shows current data and that write ownership follows the tab in use. For a single user that is indistinguishable from co-editing. Genuine simultaneous editing is a multi-user collaboration feature, tracked separately, and L0–L3 make it additive rather than harder.

**D2. Ownership follows focus, automatically.** There is no wall and no mandatory takeover click. A non-owner tab mirrors the document live and becomes the owner when the user actually uses it: sustained focus, or the first edit intent. Handover is invisible when fast.

**D3. Guest and signed-in tabs never coordinate.** Different scopes are different documents. No lock, no mirroring, no blocking between them.

**D4. Reports are part of the project document.** This matches the code, which already ships `reports` in the sync payload (`src/state/app-session/AppProvider.tsx:95`). `docs/features.md:143` claims reports are local-only and must be corrected.

**D5. Web Locks unavailable means single-tab assumption.** Writes are allowed, a console warning and a telemetry breadcrumb are emitted, and no UI appears. The condition only arises in an insecure context, which is a deployment misconfiguration the user cannot act on. This replaces today's fail-closed behaviour, which bricks the app with no recourse.

**D6. Handover fails closed.** The owner flushes before releasing. If the flush fails it keeps ownership, and the requesting tab shows a real, actionable message. Never trade unsaved work for a smoother transition.

## Architecture

Four layers. L0–L3 are in scope and must land in order.

**L0 — document identity.** A document is `(scope, projectId)`. That tuple keys storage, the lock name, and the broadcast topic. Add a `/p/:projectId` route; `/` resolves to the most recently updated project and replaces the URL. A tab can then express intent, which is what makes cases 2 and 3 reachable at all. Auth changes rewrite the scope, so every coordination primitive must be torn down and re-established on sign-in and sign-out.

**L1 — separate per-tab derived state from the document.** Move `cacheInfo`, dirty flags, `dataRevision`, selection, and viewport out of the persisted graph into a per-tab store. Required by both remaining layers; without it no tab can be read-only. Also coalesce node-drag positions and commit on drag end (already flagged at `AUDIT.md:153`).

**L2 — per-document write ownership.** One exclusive Web Lock per document, named from the L0 tuple. Three properties matter:

- *Deterministic acquisition.* Await the actual lock release before probing again; never infer ownership from a timing race. This is what fixes root cause 1.
- *Queued promotion.* A tab that loses the race stays queued on the lock, so it is promoted the instant the owner releases, closes, or crashes. No user action, no polling.
- *Focus-driven handover.* A non-owner tab that gains sustained focus (~400ms debounce, and immediately on edit intent) broadcasts a handover request. The owner flushes, releases, and itself re-queues. Debounce prevents thrash when the user alt-tabs.

**L3 — live mirroring.** The owner publishes document changes over `BroadcastChannel`, keyed by the L0 tuple; non-owner tabs apply them and re-materialize through the existing `isDirty` / version-hash path. This makes case 3 correct and case 1 non-lossy. It is also exactly the transport an operation log needs, so it is not throwaway work.

## Case coverage after L0–L3

**Case 1, same project in two tabs (canvas, table, or report).** Both tabs show live data. The tab you are using owns writes; ownership migrates invisibly when you switch. No wall, no lost edits, no conflict copies. Two *people* still do not get simultaneous editing — that is L4.

**Case 2, two different projects.** Fully independent. Both editable. No coordination between them.

**Case 3, editing while watching the report or dashboard.** The watching tab is a true read-only mirror that updates live, and one click or one focus change moves editing there.

**Identity dimensions.** Two guests and two same-user tabs behave as above within their scope. Guest plus signed-in are separate documents and never interact. Same user on two devices is unchanged: server revisions plus conflict copies.

## UX specification

Reuse the banner pattern in `src/persistence/storage/StorageWarningBanner.tsx` (in flow, above the header, `role="status"`, `aria-live="polite"`) and the tokens in `DESIGN.md`. Motion: 150ms ease-out fade, instant under `prefers-reduced-motion: reduce`.

**State 1 — editing here (default).** No UI at all. Nothing is added to the normal single-tab experience.

**State 2 — mirroring.** A slim neutral bar (`bg-surface-secondary`, `text-text-secondary`, `border-b border-border`). Not amber: nothing is wrong. Copy: "Viewing live. Editing is active in another tab." Trailing button "Edit here" (`btn btn-primary`, compact). The workspace stays fully readable and navigable — pan, zoom, scroll, select, switch views. Mutating controls are **disabled, not hidden**, each with the tooltip "Editing is active in another tab."

**State 3 — claiming.** Suppress any UI change for the first 300ms so a fast handover is invisible. Beyond that, replace the bar text with "Moving editing to this tab…" in place, with no layout shift.

**State 4 — handover refused.** The only alarming state, because it is a real problem. Amber treatment matching the storage banner. Copy: "The other tab could not save its changes, so editing stayed there." Trailing button "Try again".

**State 5 — no cross-tab coordination (D5).** No UI. Console warning plus telemetry breadcrumb only.

**Copy rules.** Never expose "lock", "lease", "Web Locks", "mutex", or "owner". The user-facing concept is only ever "editing is active in another tab". Announce transitions politely; never steal focus.

## Implementation plan

Delete first, so the new model is not layered on the old one:

- `src/components/ExclusiveTabGate.tsx` and `ExclusiveTabGate.test.tsx`
- `src/state/tabOwnership.ts` (`setBeforeTabRelease` / `prepareForTabRelease`)
- the `<ExclusiveTabGate>` wrapper in `src/main.tsx`

Then, by layer:

**L0.** Add `src/state/document/documentIdentity.ts` exporting `documentKey(scope, projectId)` built on `scopedStorageKey`. Add the `/p/:projectId` route in `src/layout/App.tsx`; make `loadOrCreateProject` in `src/state/project/projectLifecycle.ts` honour a requested id and fall back to most recent. Redirect `/` to the resolved id with `replace`.

**L1.** Add `src/state/tableRuntimeStore.ts` for per-tab derived state. Move `cacheInfo` reads/writes in `src/engine/materialization/materializationService.ts`, `src/state/stores/nodes/nodesSlice.ts`, and the dashboard hooks onto it. Delete `withoutTransientComputeState` once nothing transient remains in the document. Add drag coalescing in the canvas node change handler.

**L2.** Add `src/state/document/documentLease.ts`: `claimWriteLease`, `requestWriteLeaseHandover`, `releaseWriteLease`, `holdsWriteLease`, `subscribeToDocumentLease`, and `setHandoverFlush`. Keep the settled-release promise so `releaseWriteLease` awaits the real release. Bind it with `useSyncExternalStore` in `src/state/document/useWorkspaceLease.ts`. Register the flush handler where `setBeforeTabRelease` was registered (`src/state/app-session/persistence/usePersistenceLifecycle.ts:30`). Gate `saveLatestProject` and `flushProjectSave` in `src/state/app-session/AppProvider.tsx` on `holdsWriteLease` as defence in depth. Expose `canEdit` on `AppContextValue`. Add the focus listener with the 400ms debounce.

**L3.** Add `src/state/document/documentMirror.ts` for publish/subscribe over `BroadcastChannel`. The owner publishes after each successful IndexedDB write; followers apply into `useProjectStore` and `useReportStore` and trigger re-materialization. Guard against echo with a tab id.

**UI.** Add `src/layout/EditingElsewhereBanner.tsx` rendering states 2–4, placed beside `<StorageWarningBanner />` in `MainApp`. Thread `canEdit` into mutating affordances; start with the canvas toolbar, grid cell editing, the transform and new-table modals, and the report editor.

Keep every file under 400 physical lines (`scripts/check-file-lines.mjs`).

## Landmines

- **Undo/redo.** Local snapshot history is incoherent across owners. Under L2/L3, clear history on ownership change; under any future L4 it must become per-origin.
- **Auth transitions.** Scope is module-global and changes on sign-in/out, silently changing document identity beneath any lock or subscription.
- **Autosave frequency.** Every drag frame currently saves; under mirroring that becomes a broadcast firehose. L1's coalescing is a correctness requirement, not a nicety.
- **Materialization loops.** A follower applying a mirrored change must not produce a change that it re-publishes.
- **Engine isolation.** Each tab's DuckDB is independent and table names are not project-prefixed (`src/engine/worker/table/sqlHelpers.ts:3`). Safe today only because a project switch drops all tables; do not load two projects into one tab.

## Test plan

Unit (Vitest): deterministic release-then-reacquire with a fake `LockManager`, covering the StrictMode double-mount sequence explicitly; queued promotion when the owner releases; handover refused when the flush rejects, asserting the owner keeps ownership; `holdsWriteLease` false for a different scope with the same project id; mirror apply/echo suppression.

End-to-end (Playwright, multi-page — `e2e/tab-ownership.spec.ts` is already the right shape): rewrite it to assert that a second tab on the *same* project mirrors rather than blocks, that focusing it migrates ownership after a pending save flushes, that two tabs on *different* projects are both editable simultaneously, and that a dashboard tab reflects an edit made in the other tab. Add a case asserting no wall ever appears with one tab open.

## Out of scope

Simultaneous editing of one document by two *people* or one person on two devices at once. That needs L4: an operation log with commutative merge, per-origin undo, a new IndexedDB version, and a server model change from compare-and-swap to an append-only log with a materialized view. The recommended shape, if it is ever built, is a split by seam — versioned per-field last-write-wins for the graph and cell patches, Yjs for report rich text via TipTap's Collaboration extension. L0–L3 are prerequisites for it, not detours.

## Documentation to update

- `docs/reliability.md:21-25` — replace the single-tab rule with per-document ownership and focus-driven handover.
- `docs/reliability.md:171-172` — the operations note forbidding multiple tabs.
- `docs/production.md:137-142` — the supported-concurrency summary.
- `docs/features.md:143` — reports are synced with the project (D4).
- `docs/architecture.md:207-209` — already stale: it claims last-write-wins with no conflict resolution, which `docs/reliability.md` contradicts.
