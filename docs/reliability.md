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
written by the old unscoped schema are treated as guest data and migrated lazily.

Only one tab per browser profile may mutate Table Canvas at a time. The Web Locks
API enforces this boundary. A blocked tab can take ownership, which releases the
previous tab before the new workspace initializes. This deliberately prevents
last-write-wins corruption instead of pretending that independent in-browser
editors can be merged safely.

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
project. Offline and conflict-copy projects are promoted through the same path.

## Concurrency contract

Every remote project has a monotonic `revision`. Updates include the revision last
read by the client and are applied atomically only when it still matches. A stale
writer receives HTTP 409 and cannot overwrite newer work.

If startup finds both newer cloud data and unsynchronized local data, Table Canvas
loads the cloud version and preserves the local project and reports as a conflict
copy. The UI keeps sync errors visible and offers a safe reload. This is optimistic
concurrency, not real-time collaborative editing.

## Authentication contract

- Access and refresh tokens are httpOnly cookies.
- Refresh tokens are stored as SHA-256 hashes and rotated with one atomic compare
  and replace operation.
- Concurrent reuse of a rotated token fails without revoking the winning token.
- Login, registration, Google sign-in, and refresh endpoints are rate limited.
- Public email registration is disabled by default in production. Set
  `ENABLE_REGISTRATION=true` only when self-service registration is intended.
- Production secrets and Google configuration are validated at startup.

## Files and quotas

Uploads validate project ownership before writing. Storage is reserved atomically
on the user record, so concurrent uploads cannot exceed the tier quota. Failed
uploads release their reservation; deletion releases used bytes. Server startup
reconciles counters from GridFS to repair drift after an interrupted process or an
upgrade from the legacy counter.

Deleting a project removes a file only when no remaining project references it.
The same reference check runs in the browser cache and on the server.

## Operations

- Serve `/api` through the frontend origin so cookie behavior does not depend on
  cross-origin browser policy.
- Back up MongoDB, including `files.files` and `files.chunks`, as one consistency
  unit.
- Alert on HTTP 409, 413, 429, and 5xx rates. A rise in 409s usually indicates an
  unsupported multi-device editing pattern; 413s indicate quota pressure.
- Keep access-token lifetime short. Logout revokes the current refresh token;
  already-issued access tokens expire according to `JWT_ACCESS_EXPIRES_IN`.
- Do not enable multiple active browser tabs unless the product first adopts an
  operation log or another merge-capable collaboration model.
