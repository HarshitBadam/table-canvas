# Production deployment

This is the production baseline for the hosted portfolio project. Vercel serves the Vite frontend and proxies `/api` to Render, Render runs the Express API, and MongoDB Atlas stores account data and synced files.

## Recommended topology

- `<project>.vercel.app`: public application origin
- `<service>.onrender.com`: API upstream behind Vercel's `/api` rewrite
- MongoDB Atlas: projects, authentication data, rate limits, and GridFS files

`vercel.json` rewrites `/api/:path*` to Render before the SPA fallback. The browser stays on one origin, so authentication uses `COOKIE_SAME_SITE=strict` without third-party cookies. Production authentication and large file transfers have been validated through this path.

## Vercel frontend

Set these production environment variables:

```env
VITE_API_URL=/api
VITE_AUTO_GUEST=false
# Optional:
# VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
# VITE_SENTRY_DSN=<sentry-project-dsn>
```

`vercel.json` supplies the API proxy, SPA fallback, immutable asset caching, and baseline security headers. Publish the Vercel production URL to users.

## Backend

Create the Render service from `render.yaml`. The Blueprint generates independent JWT secrets and prompts for `MONGODB_URI`, `FRONTEND_URL`, and `GOOGLE_CLIENT_ID`. Set `SENTRY_DSN` manually when server error reporting is required.

Add the Render service's published outbound IP ranges to the Atlas project Network Access list. Do not leave Atlas open to `0.0.0.0/0`.

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=<independent-random-secret-at-least-32-characters>
JWT_REFRESH_SECRET=<different-random-secret-at-least-32-characters>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://table-canvas.vercel.app
TRUST_PROXY=1
COOKIE_SAME_SITE=strict
ENABLE_REGISTRATION=false
# Optional:
# GOOGLE_CLIENT_ID=<same-google-oauth-client-id>
# SENTRY_DSN=<sentry-project-dsn>
```

`FRONTEND_URL` accepts a comma-separated allowlist when a second trusted origin is required. Never use a wildcard with credentialed CORS. Set `TRUST_PROXY` for the actual host topology: `1` for a single trusted edge proxy, or explicit trusted ranges for a private proxy network. The server refuses to start when proxy trust is omitted, or with local MongoDB, weak JWT secrets, invalid frontend origins, or unrestricted proxy trust.

Google OAuth is optional. When enabled, use the same client ID on the frontend and backend and register the exact production frontend under Google Cloud Authorized JavaScript origins. The frontend enables FedCM where supported and deployment headers retain popup compatibility elsewhere.

Configure the host to use:

- liveness: `GET /api/health`
- readiness: `GET /api/ready`
- graceful shutdown timeout: at least 10 seconds

Create one external uptime monitor for `https://table-canvas.vercel.app/api/health` with a five-minute interval. This checks the complete Vercel-to-Render path. Keep only one Render Free service continuously warm in the workspace because a 31-day month consumes 744 of the 750 included instance hours.

## Data protection

Atlas Free has no managed backups. Back up the database from a trusted machine with MongoDB Database Tools:

```bash
mkdir -p backups
mongodump \
  --uri="$MONGODB_URI" \
  --archive="backups/table-canvas-$(date +%Y%m%dT%H%M%S).archive.gz" \
  --gzip
```

Treat normal collections and both GridFS collections (`files.files` and `files.chunks`) as one backup unit. Restore into a temporary database rather than production:

```bash
BACKUP_FILE=backups/table-canvas-YYYYMMDDTHHMMSS.archive.gz
mongorestore \
  --uri="$MONGODB_RESTORE_URI" \
  --archive="$BACKUP_FILE" \
  --gzip \
  --nsFrom='table-canvas.*' \
  --nsTo='table-canvas-restore.*'
```

Before announcing a release:

1. restore the latest backup into a temporary database;
2. verify login, project listing, file download, and project export;
3. remove the temporary database after validation.

For a portfolio project, run this restore check before major releases and at least quarterly while the site remains public.

Cloud files are limited to 20 MiB per Google account and 300 MiB globally. The global ceiling reserves Atlas capacity for projects, users, indexes, rate limits, and refresh sessions.

## Monitoring

Use the backend host and Atlas alerts for:

- readiness failures and process restarts;
- HTTP 5xx rate;
- sustained HTTP 409 conflicts;
- HTTP 413 quota failures;
- HTTP 429 authentication throttling;
- MongoDB connection and storage pressure.

Rate-based alerting stays with the host and Atlas, which already count responses. Sentry answers the separate question of *which* defect caused a 5xx. Set `SENTRY_DSN` on the backend and `VITE_SENTRY_DSN` on Vercel to enable it; both are optional and the application runs unchanged without them. See [Error monitoring](reliability.md#error-monitoring) for what is and is not sent.

Do not log tokens, cookies, project payloads, or uploaded file contents.

## Release gate

Run from the repository root:

```bash
npm ci
npm --prefix server ci
npm run test:release
npm run test:production
```

`test:release` runs frontend lint, dead-code and cycle checks, frontend and
backend coverage, backend typechecking, E2E tests, both production builds, and
dependency audits (critical findings for the frontend and moderate findings
for the backend). The tag-based release workflow then runs the production
Compose smoke test separately.

Deploy the backend first, verify `/api/ready`, then promote the Vercel deployment. Rollback by restoring the previous backend release and promoting the previous Vercel deployment. Database changes must remain backward compatible across that window.

`npm run test:production` builds the production Docker images, starts an isolated MongoDB/backend/nginx stack, waits for container health checks, and verifies liveness, database readiness, frontend API proxying, CORS, and DuckDB content/cache headers. It generates temporary secrets and destroys the stack and volume afterward.

It does not replace a live-host smoke test: Docker cannot validate Vercel TLS, the external `/api` rewrite, Atlas network access, or browser cookie policy on the public origin.

## Supported concurrency

Multiple users, browsers, devices, and tabs can work concurrently. Project writes use optimistic revisions; a rejected write is merged on the client from the last acknowledged base, and only an unmergeable one preserves the local work as a conflict copy.

Within one browser profile, tabs on different projects edit independently. Tabs on the same project elect one writer and mirror it live, and editing follows the tab the user is working in. Across devices, edits merge per entity when they land, with last-write-wins on client timestamps as the tiebreak.

The same project is still not a real-time collaborative document: two people editing it at once will see each other's work only after a save round-trip, and colliding changes to the same field resolve to one of them.
