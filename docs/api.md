# API Reference

REST API for the optional Express backend. The app also works as a browser-only
guest workspace without these endpoints.

Base path: `/api`. Vite and the hosted frontend proxy this path to the backend.
Direct local backend access is `http://localhost:5173/api`.

Application endpoints use this envelope:

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
```

Operational health endpoints return status objects instead.

## Authentication

Protected endpoints accept either the `access_token` httpOnly cookie or
`Authorization: Bearer <access-token>`.

Successful login sets:

- `access_token`: path `/`, 15-minute default lifetime;
- `refresh_token`: path `/api/auth`, 7-day default lifetime.

Production cookies are secure and use the configured `COOKIE_SAME_SITE`
policy. Refresh rotates both tokens. Failed refresh attempts do not clear
cookies because another tab may already have completed a successful rotation.

Public user objects contain:

```typescript
interface PublicUser {
  id: string
  email: string
  name: string
  tier: 'guest' | 'google'
  createdAt: string
  avatarUrl?: string
}
```

### POST /auth/register

Create a password account. Public registration is disabled in production
unless `ENABLE_REGISTRATION=true`.

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "name": "User Name"
}
```

Returns `201` with `{ data: { user, message: "Registration successful" } }`
and session cookies.

Validation requires a valid email, a trimmed name, and a password of at least
eight characters containing uppercase, lowercase, and numeric characters.

Errors: `400` validation, `403` registration disabled, `409` email exists.

### POST /auth/login

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

Returns `200` with `{ data: { user, message: "Login successful" } }` and
session cookies.

Errors: `400` missing credentials, `401` invalid credentials.

### POST /auth/google

```json
{
  "credential": "<Google ID token>"
}
```

Returns `200` with the same user/message shape and cookies as password login.
Google sign-in never auto-links an existing password account.

Errors: `400`/`401` invalid credential, `409` email belongs to a password
account.

### POST /auth/logout

Invalidates the refresh token when present and clears both cookies. It does not
require an authenticated access token and is safe to call when already logged
out.

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### GET /auth/me

Returns `200` with `{ data: { user } }`.

Errors: `401` missing/invalid session or user no longer exists.

### POST /auth/refresh

Rotates the refresh token and issues new access and refresh cookies.

Returns `200` with `{ data: { user }, message: "Token refreshed successfully" }`.

Errors: `401` token missing, invalid, expired, already rotated, or not found.

## Projects

All project endpoints require authentication. Project writes are limited to
300 requests per account per five minutes.

Project payloads may contain at most 5,000 nodes, 20,000 edges, and 10 MB of
project data within the server's 12 MB JSON request limit. Tier-specific
project, table, and row limits are also enforced.

A full project has this shape:

```typescript
interface Project {
  id: string
  name: string
  nodes: Record<string, unknown>
  edges: Record<string, unknown>
  patches: Record<string, unknown>
  reports: Record<string, unknown>
  revision: number
  createdAt: string
  updatedAt: string
}
```

### GET /projects

Returns `200` with project summaries:

```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "...",
        "name": "My Project",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

### POST /projects

Creates a project. `name`, `nodes`, `edges`, `patches`, and `reports` are
optional; the name defaults to `Untitled Project`.

```json
{
  "name": "My Project",
  "nodes": {},
  "edges": {},
  "patches": {},
  "reports": {}
}
```

An optional `Idempotency-Key` header (maximum 200 characters) makes retries
return the same project. Reusing a key with different data returns `409`.

Returns `201` with `{ data: { project } }`.

### GET /projects/:id

Returns `200` with `{ data: { project } }`.

Errors: `400` invalid ID, `404` not found.

### PUT /projects/:id

### PATCH /projects/:id

Both endpoints update only provided fields. Allowed fields are `name`, `nodes`,
`edges`, `patches`, and `reports`. `expectedRevision` is required.

```json
{
  "name": "Updated Name",
  "expectedRevision": 3
}
```

Returns `200` with `{ data: { project } }` and an incremented revision.

Errors: `400` invalid payload/ID/tier limit, `404` not found, `409` stale
revision or unavailable referenced file.

### DELETE /projects/:id

Permanently deletes a project when `expectedRevision` matches. There is no
restore endpoint. Files are separate resources and can be deleted once no
active project references them.

```json
{
  "expectedRevision": 3
}
```

Returns `200` with `{ message: "Project deleted successfully" }`.

Errors: `400` invalid ID/revision, `404` not found, `409` stale revision.

## Files

All file endpoints require authentication.

File metadata has this shape:

```typescript
interface UploadedFile {
  id: string
  filename: string
  size: number
  contentType: string
  uploadDate: string
}
```

### GET /files

Returns `200` with `{ data: { files: UploadedFile[] } }`.

### POST /files/upload

Accepts `multipart/form-data`:

- `file`: required CSV, Excel workbook, or Table Canvas snapshot;
- `projectId`: optional project association;
- `Idempotency-Key`: optional header for safe retries.

Allowed extensions: `.csv`, `.xlsx`, `.xls`, `.tablecanvas`.

Limits:

- guest-tier account: 2 MB per file;
- Google-tier account: 20 MB total server file storage;
- global GridFS storage: 300 MB;
- 60 upload attempts per account per 15 minutes.

A new upload returns `201`; an idempotent replay returns `200`. Both return
`{ data: { file } }`.

Errors: `400` missing/disallowed file or invalid project ID, `404` project not
found, `409` idempotency key drift, `413` file/storage limit, `429` rate limit.

### GET /files/:id

Streams the file with `Content-Type`, `Content-Length`, and attachment
`Content-Disposition` headers. Downloads are limited to 300 per account per
15 minutes.

Errors: `400` invalid ID, `404` not found, `429` rate limit.

### GET /files/:id/metadata

Returns `200` with `{ data: { file } }`.

Errors: `400` invalid ID, `404` not found.

### DELETE /files/:id

Deletes an unreferenced file and returns
`{ message: "File deleted successfully" }`.

Errors: `400` invalid ID, `404` not found, `409` active project reference.

## Health and readiness

### GET /health

Always reports process liveness:

```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### GET /ready

Returns `200` with status `ready` when MongoDB is connected, otherwise `503`
with status `not-ready`.

## Errors

Errors use this base shape:

```json
{
  "success": false,
  "error": "Error message"
}
```

Validation failures additionally include an `errors` array. Development-only
500 responses may include a stack trace.

| Code | Meaning |
|------|---------|
| 400 | Invalid request or validation failure |
| 401 | Missing or invalid authentication |
| 403 | Forbidden, registration disabled, or tier limit |
| 404 | Resource not found |
| 409 | Revision, idempotency, ownership, or resource-in-use conflict |
| 413 | Payload or storage quota exceeded |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Rate limits

MongoDB-backed counters are shared across backend instances.

| Scope | Window | Limit | Key |
|-------|--------|-------|-----|
| Register, login, Google sign-in | 15 minutes | 20 | Address |
| Token refresh | 15 minutes | 120 | Address |
| Project writes | 5 minutes | 300 | Account |
| File uploads | 15 minutes | 60 | Account |
| File downloads | 15 minutes | 300 | Account |

## CORS and CSRF

The API allows credentials from the comma-separated origins in `FRONTEND_URL`
(default `http://localhost:3000`). Allowed methods are `GET`, `POST`, `PUT`,
`PATCH`, `DELETE`, and `OPTIONS`. Allowed headers are `Content-Type`,
`Authorization`, and `Idempotency-Key`.

Mutating `/api` requests also pass CSRF origin checks. Cross-site browser
requests from an untrusted origin return `403`.
