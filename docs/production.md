# Production deployment

This is the production baseline for the hosted portfolio project. Vercel serves the
Vite frontend; the Express API must run on a persistent Node host, and MongoDB must
run on MongoDB Atlas or an equivalent managed service.

## Recommended topology

- `app.example.com`: Vercel frontend
- `api.example.com`: Express backend
- MongoDB Atlas: projects, authentication data, rate limits, and GridFS files

Using frontend and API subdomains under one registrable domain keeps authentication
cookies same-site. If the frontend and API use unrelated domains, set
`COOKIE_SAME_SITE=none`; the API validates mutation origins, but some browsers may
still restrict those third-party cookies.

## Vercel frontend

Set these production environment variables:

```env
VITE_API_URL=https://api.example.com/api
VITE_AUTO_GUEST=false
# Optional:
# VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
# VITE_TELEMETRY_ENDPOINT=https://telemetry.example.com/events
```

`vercel.json` supplies the SPA fallback, immutable asset caching, and baseline
security headers. Deploy previews may use a different API, but production must use
HTTPS and the exact API origin configured on the backend.

## Backend

Deploy `server/` to a persistent Node host. Set:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=<independent-random-secret-at-least-32-characters>
JWT_REFRESH_SECRET=<different-random-secret-at-least-32-characters>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://app.example.com
TRUST_PROXY=1
COOKIE_SAME_SITE=strict
ENABLE_REGISTRATION=false
# Optional:
# GOOGLE_CLIENT_ID=<same-google-oauth-client-id>
```

`FRONTEND_URL` accepts a comma-separated allowlist when a second trusted origin is
required. Never use a wildcard with credentialed CORS. Set `TRUST_PROXY` for the
actual host topology: `1` for a single trusted edge proxy, or explicit trusted
ranges for a private proxy network. The server refuses to start when proxy trust is
omitted, or with local MongoDB, weak JWT secrets, invalid frontend origins, or
unrestricted proxy trust.

Google OAuth is optional. When enabled, use the same client ID on the frontend and
backend and register the exact production frontend under Google Cloud Authorized
JavaScript origins. The frontend enables FedCM where supported and deployment
headers retain popup compatibility elsewhere.

Configure the host to use:

- liveness: `GET /api/health`
- readiness: `GET /api/ready`
- graceful shutdown timeout: at least 10 seconds

## Data protection

Enable Atlas backups for the database containing normal collections and both GridFS
collections (`files.files` and `files.chunks`). Treat them as one backup unit.

Before announcing a release:

1. restore the latest backup into a temporary database;
2. verify login, project listing, file download, and project export;
3. remove the temporary database after validation.

For a portfolio project, run this restore check before major releases and at least
quarterly while the site remains public.

## Monitoring

Use the backend host and Atlas alerts for:

- readiness failures and process restarts;
- HTTP 5xx rate;
- sustained HTTP 409 conflicts;
- HTTP 413 quota failures;
- HTTP 429 authentication throttling;
- MongoDB connection and storage pressure.

Do not log tokens, cookies, project payloads, or uploaded file contents.

## Release gate

Run from the repository root:

```bash
npm ci
npm --prefix server ci
npm run lint
npm run check:dead-code
npm run test:coverage
npm --prefix server run test:coverage
npm run test:e2e
npm run build
npm --prefix server run build
npm audit --omit=dev
npm --prefix server audit --omit=dev
npm run test:production
```

Deploy the backend first, verify `/api/ready`, then promote the Vercel deployment.
Rollback by restoring the previous backend release and promoting the previous Vercel
deployment. Database changes must remain backward compatible across that window.

`npm run test:production` builds the production Docker images, starts an isolated
MongoDB/backend/nginx stack, waits for container health checks, and verifies
liveness, database readiness, frontend API proxying, CORS, and DuckDB content/cache
headers. It generates temporary secrets and destroys the stack and volume afterward.

It does not replace a live-host smoke test: Docker cannot validate Vercel TLS,
custom-domain DNS, Atlas network access, or browser cookie policy across your final
frontend and API origins.

## Supported concurrency

Multiple users and browsers can work concurrently. Project writes use optimistic
revisions and preserve stale local work as a conflict copy. The same project is not
a real-time collaborative document: simultaneous editors do not merge live changes.
Within one browser profile, only one active tab may edit at a time.
