# Session and data reliability

Table Canvas has two explicit workspace modes:

- **Guest workspace** stores projects, files, and reports in this browser only.
- **Account workspace** keeps an owner-scoped local cache and synchronizes projects, reports, and files with the authenticated account.

Backend availability does not choose the user's mode in production. The login page offers guest access explicitly. Development can opt into automatic guest startup with `VITE_AUTO_GUEST=true`.

## Storage scopes

IndexedDB records are keyed by an owner scope (`guest:<id>` per guest tab partition, or `account:<user id>`). Records from one account are never returned while another scope is active. The legacy `guest` partition is migrated automatically to a scoped guest id. Older unscoped records are quarantined and never exposed automatically to a guest or another account; there is currently no user-facing recovery UI for them.

## Document ownership

Write ownership is per document, not per browser. A document is the pair of owner scope and project id, and the Web Locks API grants exactly one tab the right to write it. Other tabs open the same document read-only, mirror the owner's changes live over a BroadcastChannel, and stay fully navigable — pan, zoom, scroll, switch views, read reports. Two tabs on different projects both edit normally. No tab is ever refused the workspace.

Focus and visibility never transfer ownership. Mirror tabs remain read-only while
the writer holds the Web Lock; there is no forced-takeover control. Closing or
unmounting the owner releases the document, and the next waiting tab adopts
the latest durable snapshot before becoming writable. If adoption fails, it
stays read-only and retries rather than writing stale state.

Only the owner writes. Per-tab compute state — materialization progress, cache counts, derived schema — lives outside the document in a runtime store, so a mirroring tab can materialize and browse tables locally without its results reaching IndexedDB, the server, or the owner's document.

## Guest promotion and offline recovery

After sign-in, local guest and account-offline projects are promoted with stable idempotency keys. Promotion completes in this order:

1. create or reconcile the remote project;
2. upload local file references;
3. save the revisioned project and reports remotely;
4. cache the server project in the account scope;
5. re-key local report records to the server project id;
6. delete the source project and reports.

Failures leave the source data intact and retries resolve to the same server project. File uploads use stable idempotency keys, so retries cannot consume quota with duplicate blobs. Offline and conflict-copy projects use the same path, and an active local workspace is remapped to its server id before editing resumes.

## Concurrency contract

Every remote project has a monotonic `revision`. Updates include the revision last read by the client and are applied atomically only when it still matches. A stale writer receives HTTP 409 and cannot overwrite newer work.

Local edits and their server base revision are committed atomically to a durable IndexedDB operation queue. Server acknowledgement removes only the exact generation that was sent; a newer queued generation remains pending with the advanced base revision. Offline saves and deletions survive reload and replay on reconnect. Timestamps are presentation metadata and are never used to infer whether data is dirty.

Startup and reconnect replay reconcile HTTP 409 responses before initialization continues. Stale saves become conflict copies; stale deletes are cancelled and the newer cloud project is restored. Report writes are serialized per report, and flush boundaries wait for both debounced and already-running IndexedDB writes.

## Cross-device merge

A rejected save is merged, not discarded. Every acknowledged save records the exact snapshot the server accepted as that document's base, so a 409 has three versions to work with: the base, the local queued payload, and the current server state. The merge is per entity — a node, edge, cell patch, or report changed on only one side is taken from that side, and only genuine both-changed collisions need arbitration. The merged snapshot replaces the queued payload together with the server's fresh revision in one durable write, and the save is re-sent — at most three attempts per flush, so a document under contention gives up and falls back rather than looping. A 429 is retried after the server's `Retry-After`, capped at five seconds.

Arbitration is last-write-wins on the node's `updatedAt`, with deterministic tiebreaks so two devices resolving the same conflict independently reach the same snapshot: the server wins ties, absent or unparseable timestamps, and every `ui`/position collision. Deleting a node loses to editing it, because a delete is one gesture and the edits under it are many. Edges that would outlive a deleted node, or close a cycle, are dropped and named in the merge notice. Reports never lose data: the losing side is kept beside the winner as a "(recovered)" copy.

Merging is refused rather than approximated when the base snapshot is missing — first save from this browser, or a cleared cache — or when the merged result would exceed the server's node, edge, or payload limits. Refusal falls back to the existing behaviour: load the cloud version and preserve the queued project and reports under new ids as a conflict copy. The UI keeps sync errors visible and offers a safe reload. This is optimistic concurrency, not real-time collaborative editing.

## Accepted trade-offs

Two known losses are deliberate, because closing them needs a server-side clock or an operation log that this product does not have yet.

Every `updatedAt` is a client wall clock. A device whose clock is wrong can win an arbitration it should have lost, and the merge succeeds — the conflict-copy fallback only catches merges that *fail*, not merges that resolve wrongly. The exposure is bounded to fields that genuinely collided on two devices, and reports are exempt because their loser survives as a "(recovered)" copy.

Autosave coalesces bursts — cell values, node positions, report text — into one write roughly every 800ms, so a crash inside that window loses the last keystrokes rather than the last edit. Adding or removing a table or a connection is written immediately, and tab hide and `pagehide` flush pending work.

## Authentication contract

- Access and refresh tokens are httpOnly cookies.
- Refresh tokens are stored as SHA-256 hashes and rotated with one atomic compare and replace operation.
- Concurrent reuse of a rotated token fails without revoking the winning token.
- Session issuance uses atomic updates, so concurrent login and refresh requests cannot resurrect or discard tokens. Legacy plaintext refresh sessions are revoked during startup migration.
- Login, registration, Google sign-in, and refresh endpoints are rate limited with a shared MongoDB store across backend instances.
- The rate-limit key has a unique MongoDB index, so concurrent first requests cannot create separate counters. Startup consolidates records created by older versions.
- Google sign-in never auto-links an existing password account. Linking requires a future explicit authenticated flow.
- Public email registration is disabled by default in production. Set `ENABLE_REGISTRATION=true` only when self-service registration is intended.
- Production secrets and Google configuration are validated at startup.

## Cross-tab authentication and session

Implemented in `src/state/app-session/useAuthState.ts` and the storage/sync modules. This is separate from document write ownership ([Document ownership](#document-ownership)).

**Shared across tabs (origin)**

- Account auth cookies are httpOnly and origin-shared. A successful login is visible to new or reloaded tabs that call `checkAuth` / `/auth/me` with credentials included.
- Account workspace data uses the account storage scope (`account:<userId>` via `accountStorageScope` in `src/persistence/storage/storageScope.ts`).

**Tab-local (`sessionStorage`)**

- Guest selection (`table-canvas:guest-session`) is tab-local. An existing guest tab keeps its isolated guest workspace on reload even when another tab has signed into an account; shared account cookies must not silently replace that guest choice.
- Explicit sign-out revokes the current server refresh session, clears the shared auth cookies, and sets `table-canvas:account-signed-out` in the initiating tab. Other account tabs keep their current workspace until their next authenticated request receives `401`; guest tabs remain isolated. An explicit login in the signed-out tab clears its marker.
- Guest tabs ignore account `401` handlers so another tab's logout cannot interrupt an in-progress guest session.

**Broadcast between tabs (not auth state)**

- There is **no** live auth-state `BroadcastChannel` propagation. Each tab decides its own auth mode from cookies plus its tab-local markers on boot or user action.
- Project catalog create/rename/delete events fan out on `BroadcastChannel` (`src/persistence/sync/project/projectCatalog.ts`), with a `visibilitychange` reconcile fallback in `useProjectCatalogReconcile`.
- Open-document updates publish lightweight invalidations on `BroadcastChannel` (`src/state/document/documentMirror.ts`); readers reload the durable IndexedDB snapshot. `visibilitychange` also schedules a reader refresh when BroadcastChannel is unavailable or a tab becomes visible again.
- Guest storage-scope claiming uses Web Locks with a `BroadcastChannel` occupancy probe as fallback (`claimGuestStorageScope`) so duplicated tabs do not share one guest partition. That isolates storage; it does not sync login/logout UI state.

## Request rate limits

Rate-limit counters live in MongoDB rather than a dedicated cache. A second stateful dependency would add its own credentials, availability, and failure modes to defend against traffic that the edge proxy already absorbs, and rate limiters that fail open provide no protection when that dependency is down. Revisit this only if Mongo shows connection saturation or rate-limit write latency under real load.

| Scope | Window | Limit | Key |
| --- | --- | --- | --- |
| Sign-in, registration, Google sign-in | 15 min | 20 | address |
| Token refresh | 15 min | 120 | address |
| Project create, update, delete | 5 min | 300 | account |
| File upload | 15 min | 60 | account |
| File download | 15 min | 300 | account |

Authenticated limiters are keyed by account, not address, because proxies and carrier NAT collapse many honest users onto one address while one abusive account can rotate addresses freely. They are mounted after `requireAuth`, so unauthenticated floods are rejected by token verification without a database write. The upload limiter runs before the multipart parser so a throttled request never buffers its body.

Reads that resolve from a single indexed query are deliberately unmetered: metering them would add a database write to the cheapest requests the API serves. Writes, uploads, and downloads are metered because they cost far more than the counter update that guards them.

Clients that exceed a limit receive HTTP 429. Queued project operations survive a 429 intact and replay on the next flush, so throttling delays a save but never discards one.

## Files and quotas

Uploads validate project ownership before writing. Storage is reserved atomically on the user record, so concurrent uploads cannot exceed the tier quota. Failed uploads release their reservation; deletion releases used bytes. Server startup raises legacy counters to at least the bytes present in GridFS without temporarily zeroing live counters during rolling restarts.

Project deletion is revision-checked and permanent; there is no restore route.
Files are separate resources and become eligible for direct/client cleanup
after no active project references them. Direct file deletion is rejected
while any active project references the file. Browser-cache garbage collection
removes only files that no remaining local project references.

## Error monitoring

Error reporting is optional in every environment. Without `SENTRY_DSN` the backend skips initialization; without `VITE_SENTRY_DSN` the browser never downloads the SDK chunk. Nothing else changes, so local development and self-hosting need no account.

The backend reports only failures it did not anticipate: HTTP 5xx responses, uncaught exceptions, and unhandled rejections. Expected 4xx answers — validation, authentication, conflicts, quota, throttling — are normal API behaviour and are never reported. Each event carries the request method, the matched route pattern rather than the concrete path, the status code, and the account id. Request bodies, headers, cookies, addresses, and email addresses are excluded.

The browser reports uncaught errors, unhandled rejections, and React
error-boundary failures in production, or in development when
`VITE_ENABLE_FRONTEND_TELEMETRY=true`. Every error passes through one collector
in `src/observability/frontendTelemetry.ts` that truncates messages and stacks,
and drops repeats of the same failure within five seconds, so a render loop
cannot flood the project. The SDK's own window hooks are disabled to keep that
path single. Errors raised before the SDK chunk loads are held in a bounded
backlog and flushed once it arrives; if the chunk is blocked, reporting is
abandoned and the app continues.

Core Web Vitals are deliberately not sent anywhere. They are buffered on `window.__tableCanvasTelemetry` to enforce the performance budget asserted by the UX end-to-end suite, which needs neither a collector nor a sampling quota.

## Operations

- Prefer a same-origin API proxy or same-site frontend/API subdomains. Unrelated domains require `COOKIE_SAME_SITE=none` and remain subject to browser third-party-cookie restrictions.
- Set `TRUST_PROXY` to the actual proxy hop count or private ranges; never configure Express to trust every client.
- Back up MongoDB, including `files.files` and `files.chunks`, as one consistency unit.
- Alert on HTTP 409, 413, 429, and 5xx rates. Occasional 409s are normal — they are the input to the client merge — but a sustained rise means merges are failing back to conflict copies; 413s indicate quota pressure.
- Keep access-token lifetime short. Logout revokes the current refresh token; already-issued access tokens expire according to `JWT_ACCESS_EXPIRES_IN`.
- Multiple tabs and multiple devices are supported: one tab writes a document at a time and the rest mirror it, and cross-device conflicts merge on the client. Simultaneous editing of one document by two people is not, and needs an operation log or another real-time collaboration model.
- Follow [Production deployment](production.md) for Vercel, backend readiness, backups, monitoring, release gates, and rollback.
