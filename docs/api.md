# API Reference

Base URL: `http://localhost:3001/api`

All endpoints return JSON with the structure:
```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
```

## Authentication

Authentication uses httpOnly cookies with JWT tokens. Access tokens expire in 15 minutes; refresh tokens in 7 days.

### POST /auth/register

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "User Name"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "name": "User Name"
    },
    "message": "Registration successful"
  }
}
```

**Validation:**
- Email: Valid format required
- Password: Minimum 8 characters, must include uppercase, lowercase, and number
- Name: Required, trimmed

**Errors:**
- `400` - Validation failed
- `409` - Email already registered

### POST /auth/login

Authenticate and receive session cookies.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "name": "User Name"
    },
    "message": "Login successful"
  }
}
```

**Cookies set:**
- `access_token` (httpOnly, 15m expiry)
- `refresh_token` (httpOnly, 7d expiry)

**Errors:**
- `400` - Missing credentials
- `401` - Invalid email or password

### POST /auth/logout

Clear session cookies and invalidate refresh token.

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### GET /auth/me

Get current authenticated user.

**Headers:** Requires valid session cookie

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "name": "User Name"
    }
  }
}
```

**Errors:**
- `401` - Not authenticated

### POST /auth/refresh

Refresh access token using refresh token.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... }
  },
  "message": "Token refreshed successfully"
}
```

**Errors:**
- `401` - Invalid or expired refresh token

---

## Projects

All project endpoints require authentication.

### GET /projects

List user's projects.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "...",
        "name": "My Project",
        "updatedAt": "2024-01-15T10:30:00Z",
        "createdAt": "2024-01-10T08:00:00Z"
      }
    ]
  }
}
```

### POST /projects

Create a new project.

**Request:**
```json
{
  "name": "My Project",
  "nodes": {},
  "edges": {},
  "patches": {}
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "project": {
      "id": "...",
      "name": "My Project",
      "nodes": {},
      "edges": {},
      "patches": {},
      "updatedAt": "...",
      "createdAt": "..."
    }
  }
}
```

### GET /projects/:id

Get project by ID.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "project": {
      "id": "...",
      "name": "My Project",
      "nodes": { ... },
      "edges": { ... },
      "patches": { ... }
    }
  }
}
```

**Errors:**
- `400` - Invalid project ID format
- `404` - Project not found

### PUT /projects/:id

Full update of project.

**Request:**
```json
{
  "name": "Updated Name",
  "nodes": { ... },
  "edges": { ... },
  "patches": { ... }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "project": { ... }
  }
}
```

### PATCH /projects/:id

Partial update of project. Only provided fields are updated.

**Request:**
```json
{
  "name": "New Name"
}
```

**Allowed fields:** `name`, `nodes`, `edges`, `patches`

### DELETE /projects/:id

Soft delete a project.

**Response (200):**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

### POST /projects/:id/restore

Restore a soft-deleted project.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "project": { ... }
  },
  "message": "Project restored successfully"
}
```

---

## Files

All file endpoints require authentication.

### GET /files

List user's uploaded files.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "...",
        "filename": "data.csv",
        "size": 1024,
        "contentType": "text/csv",
        "uploadedAt": "..."
      }
    ]
  }
}
```

### POST /files/upload

Upload a file (CSV or Excel).

**Request:** `multipart/form-data`
- `file`: The file to upload
- `projectId` (optional): Associate with a project

**Limits:**
- Max size: 50MB
- Allowed types: `.csv`, `.xlsx`, `.xls`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "file": {
      "id": "...",
      "filename": "data.csv",
      "size": 1024,
      "contentType": "text/csv"
    }
  }
}
```

**Errors:**
- `400` - No file uploaded or invalid type

### GET /files/:id

Download a file.

**Response:** File stream with appropriate headers:
- `Content-Type`: File MIME type
- `Content-Length`: File size
- `Content-Disposition`: `attachment; filename="..."`

### GET /files/:id/metadata

Get file metadata without downloading.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "file": {
      "id": "...",
      "filename": "data.csv",
      "size": 1024,
      "contentType": "text/csv"
    }
  }
}
```

### DELETE /files/:id

Delete a file.

**Response (200):**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

## Health Check

### GET /health

Check API status.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": ["Validation error 1", "Validation error 2"]
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not authenticated) |
| 403 | Forbidden (not authorized) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production, configure at the reverse proxy level (nginx, Cloudflare, etc.).

## CORS

The API allows requests from the configured `FRONTEND_URL` with credentials (cookies). Methods allowed: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
