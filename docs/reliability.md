# Session and data reliability

Table Canvas has two explicit workspace modes:

- **Guest workspace** stores projects, files, and reports in this browser only.
- **Account workspace** keeps an owner-scoped local cache and synchronizes projects,
  reports, and files with the authenticated account.

Backend availability does not choose the user's mode in production. The login page
offers guest access explicitly. Development can opt into automatic guest startup
with `VITE_AUTO_GUEST=true`.

## Browser ownership

IndexedDB records are keyed by an owner scope (`guest` or `account:<user id>`).
Records from one account are never returned while another scope is active. Records
written by the old unscoped schema are quarantined because their owner cannot be
proven. They remain available for an explicit recovery tool or support migration,
but are never exposed automatically to a guest or another account.

Only one tab per browser profile may mutate Table Canvas at a time. The Web Locks
API enforces this boundary. A blocked tab can take ownership, which releases the
previous tab before the new workspace initializes. This deliberately prevents
last-write-wins corruption instead of pretending that independent in-browser
editors can be merged safely. A tab keeps ownership if local persistence fails.

## Guest promotion and offline recovery

After sign-in, local guest and account-offline projects are promoted with stable
idempotency keys. Promotion completes in this order:

1. create or reconcile the remote project;
2. upload local file references;
3. save the revisioned project and reports remotely;
4. cache the server project in the account scope;
5. copy reports to the server project id;
6. delete the source project and reports.

Failures leave the source data intact and retries resolve to the same server
project. File uploads use stable idempotency keys, so retries cannot consume quota
with duplicate blobs. Offline and conflict-copy projects use the same path, and an
active local workspace is remapped to its server id before editing resumes.

## Concurrency contract

Every remote project has a monotonic `revision`. Updates include the revision last
read by the client and are applied atomically only when it still matches. A stale
writer receives HTTP 409 and cannot overwrite newer work.

Local edits and their server base revision are committed atomically to a durable
IndexedDB operation queue. Server acknowledgement removes only the exact generation
that was sent; a newer queued generation remains pending with the advanced base
revision. Offline saves and deletions survive reload and replay on reconnect.
Timestamps are presentation metadata and are never used to infer whether data is
dirty.

If the cloud revision advances beyond a queued operation's base, Table Canvas loads
the cloud version and preserves the queued project and reports under new ids as a
conflict copy. The UI keeps sync errors visible and offers a safe reload. This is
optimistic concurrency, not real-time collaborative editing.

## Authentication contract

- Access and refresh tokens are httpOnly cookies.
- Refresh tokens are stored as SHA-256 hashes and rotated with one atomic compare
  and replace operation.
- Concurrent reuse of a rotated token fails without revoking the winning token.
- Session issuance uses atomic updates, so concurrent login and refresh requests
  cannot resurrect or discard tokens. Legacy plaintext refresh sessions are revoked
  during startup migration.
- Login, registration, Google sign-in, and refresh endpoints are rate limited with
  a shared MongoDB store across backend instances.
- Google sign-in never auto-links an existing password account. Linking requires a
  future explicit authenticated flow.
- Public email registration is disabled by default in production. Set
  `ENABLE_REGISTRATION=true` only when self-service registration is intended.
- Production secrets and Google configuration are validated at startup.

## Files and quotas

Uploads validate project ownership before writing. Storage is reserved atomically
on the user record, so concurrent uploads cannot exceed the tier quota. Failed
uploads release their reservation; deletion releases used bytes. Server startup
raises legacy counters to at least the bytes present in GridFS without temporarily
zeroing live counters during rolling restarts.

Project deletion is revisioned and soft: files remain restorable and continue to
count toward quota until permanent purge. Direct file deletion is rejected while
the owning project or any other active project can reference the file. Browser-cache
garbage collection removes only files no remaining local project references.

## Operations

- Serve `/api` through the frontend origin so cookie behavior does not depend on
  cross-origin browser policy.
- Keep the backend port private. `TRUST_PROXY` must contain only the reverse
  proxy's private ranges; never configure Express to trust every client.
- Back up MongoDB, including `files.files` and `files.chunks`, as one consistency
  unit.
- Alert on HTTP 409, 413, 429, and 5xx rates. A rise in 409s usually indicates an
  unsupported multi-device editing pattern; 413s indicate quota pressure.
- Keep access-token lifetime short. Logout revokes the current refresh token;
  already-issued access tokens expire according to `JWT_ACCESS_EXPIRES_IN`.
- Do not enable multiple active browser tabs unless the product first adopts an
  operation log or another merge-capable collaboration model.
