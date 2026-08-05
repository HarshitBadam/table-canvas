# Concurrency findings

Expanded review of multi-tab ownership, durable sync generations, authentication rotation, account-scoped storage, project transitions, IndexedDB, DuckDB workers, files, and quota accounting.

**21 findings:** 8 P1 · 12 P2 · 1 P3

---

## P1

### 1. 409 merge can overwrite a newer queued edit
- **Area:** Cloud sync
- **Evidence:** `src/persistence/sync/project/save/projectSyncQueue.ts:121`
- **Impact:** While conflict recovery fetches the base and server copy, autosave can enqueue a newer generation. `replaceQueuedProjectSave` then replaces that newer payload with a merge computed from the older payload.

### 2. Conflict-copy fallback clears newer queued work
- **Area:** Cloud sync
- **Evidence:** `src/persistence/sync/project/save/projectConflictCopy.ts:32`
- **Impact:** If a newer save is queued while an older save is failing, `preserveConflictCopy` copies the old payload and unconditionally clears the current queue entry. The 404 path can also delete the newer local snapshot.

### 3. Concurrent refresh rotation can clear the winning cookies
- **Area:** Authentication
- **Evidence:** `server/src/routes/auth.ts:206`
- **Impact:** Two tabs can submit the same refresh token. One CAS wins and sets new cookies; the loser returns later and clears those shared cookies, logging out the otherwise valid session.

### 4. Failed lease adoption still enables writes
- **Area:** Multi-tab editing
- **Evidence:** `src/state/document/documentLease.ts:187`
- **Impact:** A promoted mirror can become editable with a stale snapshot and overwrite the previous owner’s durable changes.

### 5. Async sync operations do not pin account scope
- **Area:** Storage isolation
- **Evidence:** `src/persistence/sync/files/fileSync.ts:78`
- **Impact:** Remote file and project operations re-read the global scope after awaits. A logout/login transition can cache the old account’s bytes or project snapshot inside the new account partition.

### 6. Reference check and server file delete are not atomic
- **Area:** File lifecycle
- **Evidence:** `server/src/routes/files.ts:292`
- **Impact:** A project save can add a file reference after DELETE scans projects but before GridFS deletion. The project then permanently references missing bytes.

### 7. Quota reconciliation overwrites live counters
- **Area:** Quota
- **Evidence:** `server/src/services/storageQuota.service.ts:118`
- **Impact:** A rolling startup aggregates GridFS, then replaces global and user counters while another instance is reserving or completing uploads. Live reservations can be erased, allowing quota drift.

### 8. Three-way merge accepts a stale base revision
- **Area:** Cloud sync
- **Evidence:** `src/persistence/sync/project/save/projectSaveConflict.ts:68`
- **Impact:** The base record stores a revision, but `mergeQueuedSave` ignores it. If base capture previously failed or crashed, a later 409 can classify changes against the wrong ancestor and choose the wrong value.

---

## P2

### 9. Queue flush serialization is tab-local
- **Area:** Cloud sync
- **Evidence:** `src/persistence/sync/project/save/projectSaveSync.ts:46`
- **Impact:** Every tab runs startup/reconnect flushes before document ownership is established. Two tabs can send the same CAS operation; depending on IndexedDB timing, the loser may create a bogus conflict copy or retry an already accepted snapshot.

### 10. Controls are writable while lease ownership is unresolved
- **Area:** Multi-tab editing
- **Evidence:** `src/state/document/useWorkspaceLease.ts:14`
- **Impact:** A second tab can mutate in-memory state during the initial lock probe; persistence refuses it and the edit can disappear when mirroring starts.

### 11. Reconnect reconciliation is not serialized with project actions
- **Area:** Project lifecycle
- **Evidence:** `src/state/app-session/persistence/usePersistenceLifecycle.ts:62`
- **Impact:** The online handler captures an active project, awaits sync, then can prepare that old project after the user switched to another one. Concurrent prepare calls also clear and rebuild the shared engine/runtime out of order.

### 12. Active-project deletion uses a probe, not a held guard
- **Area:** Project deletion
- **Evidence:** `src/state/app-session/persistence/useProjectActions.ts:204`
- **Impact:** `canDeleteDocument` is only a snapshot. Another tab can open the project during the following save/report flush; active deletion proceeds without holding the exclusive open/write locks used for inactive deletion.

### 13. Write ownership is not matched to the snapshot project
- **Area:** Autosave
- **Evidence:** `src/state/app-session/persistence/useProjectAutosave.ts:103`
- **Impact:** Autosave asks only whether this tab holds some document lease, then reads the current project store. During project preparation the store can switch before the lease identity, allowing a new project to be saved under the old project’s ownership.

### 14. Version blocking leaves a closed database promise cached
- **Area:** IndexedDB
- **Evidence:** `src/persistence/storage/local-db/dbCore.ts:139`
- **Impact:** The blocking callback closes `dbInstance` but does not clear the already-resolved `dbOpenPromise`. After a newer tab upgrades the schema, the old tab keeps receiving the closed handle and persistence fails until reload.

### 15. Create idempotency is keyed only by project name
- **Area:** Project creation
- **Evidence:** `src/persistence/sync/project/projectSync.ts:280`
- **Impact:** Two tabs creating the same name can share `create:<name>` through localStorage and nondeterministically collapse two intentional creates into one server project.

### 16. Guest Web Lock claim uses an invalid option combination
- **Area:** Guest isolation
- **Evidence:** `src/persistence/storage/storageScope.ts:94`
- **Impact:** The code combines `ifAvailable` with `signal` even though the Web Locks API rejects that pairing. Robust duplicate-tab isolation silently degrades to a 50 ms BroadcastChannel probe vulnerable to background throttling.

### 17. Quota reservation and GridFS mutation are not crash-atomic
- **Area:** Quota
- **Evidence:** `server/src/services/storageQuota.service.ts:92`
- **Impact:** User and global counters are reserved separately from the upload and released separately after delete. A process exit between steps leaves leaked or mismatched counters until a later reconciliation.

### 18. Worker failure before ready hangs initialization forever
- **Area:** Worker lifecycle
- **Evidence:** `src/engine/worker/rpc.ts:44`
- **Impact:** `onerror` rejects current RPC requests but cannot reject `readyPromise`. A worker load/compile failure before the ready message leaves engine initialization and the app loader pending indefinitely.

### 19. RPC timeout does not cancel the worker mutation
- **Area:** Worker lifecycle
- **Evidence:** `src/engine/worker/rpc.ts:63`
- **Impact:** The caller removes and rejects a timed-out request, but DuckDB continues it. Import rollback can delete the node/file while the worker later commits an orphan table; retries then execute behind an operation the UI considers failed.

### 20. Timed-out database opens continue untracked
- **Area:** IndexedDB
- **Evidence:** `src/persistence/storage/local-db/dbCore.ts:100`
- **Impact:** `withTimeout` rejects but does not cancel `openDB`. The original open can later succeed as an untracked live connection, which can block schema upgrades or database reset.

---

## P3

### 21. Concurrent Google first sign-in does not converge
- **Area:** Account creation
- **Evidence:** `server/src/routes/auth.ts:265`
- **Impact:** Two first-time requests can both miss `googleId` and race to create. The unique index protects data and the global handler returns 409, but the loser is not re-read as a successful login and surfaces a generic duplicate error.

---

## Why the sync race loses data

The operation sent over the network is a snapshot of generation N. While that request or its merge fetch is awaiting, autosave can atomically store generation N+1. Success acknowledgement checks N before clearing, but conflict recovery replaces or clears whichever generation happens to be current. The older network attempt can therefore erase N+1.

**Required invariant:** Every recovery transaction must receive the attempted generation and mutate IndexedDB only if the current operation still matches it. If a newer generation exists, recovery must restart from that payload or leave it queued.

## Fix order

1. Make merge, conflict-copy, 404 cleanup, and delete recovery conditional on the attempted queue generation.
2. Add a scope-wide cross-tab lock around queue flushing; the in-memory flush map is not sufficient.
3. Fix refresh rotation so a stale-token CAS loser never clears a possibly newer shared cookie.
4. Capture auth epoch, storage scope, project id, and lease key at operation start; verify all four before committing results.
5. Make file reference/deletion and quota reconciliation atomic or lifecycle-state based.
6. Fail closed while acquiring ownership and do not promote after mirror refresh fails.
7. Harden IndexedDB and worker promises so timeout/error paths retire the underlying resource, not only the caller promise.

## Verification notes

Static path analysis plus the previously passing 954-test frontend suite. Existing tests cover same-process generations, but not module-isolated tabs, auth-cookie response ordering, scope changes during awaited operations, or a newer enqueue arriving during conflict recovery. Backend Mongo-backed tests remain unverified here because the embedded Mongo process exited with code 48.
