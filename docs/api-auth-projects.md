# Authentication and Projects API

[Back to the API index](api.md)

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
      "reports": {},
      "revision": 0,
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
      "patches": { ... },
      "reports": { ... },
      "revision": 0
    }
  }
}
```

**Errors:**
- `400` - Invalid project ID format
- `404` - Project not found

### PUT /projects/:id

Update project. Only provided fields are updated; omitted fields retain their current values.

**Request:**
```json
{
  "name": "Updated Name",
  "nodes": { ... },
  "edges": { ... },
  "patches": { ... },
  "reports": { ... },
  "expectedRevision": 0
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

**Errors:**
- `400` - Invalid project ID format
- `409` - `expectedRevision` is stale; reload before retrying
- `404` - Project not found

### PATCH /projects/:id

Partial update of project. Only provided fields are updated.

**Request:**
```json
{
  "name": "New Name",
  "expectedRevision": 1
}
```

**Allowed fields:** `name`, `nodes`, `edges`, `patches`, `reports`.
`expectedRevision` is required for both PUT and PATCH.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "project": { ... }
  }
}
```

**Errors:**
- `400` - Invalid project ID format
- `409` - `expectedRevision` is stale; reload before retrying
- `404` - Project not found

### DELETE /projects/:id

Soft delete a project. The revision is advanced atomically. Restorable files remain
stored and count toward quota.

**Request:**
```json
{
  "expectedRevision": 3
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**Errors:**
- `400` - Invalid project ID format
- `409` - `expectedRevision` is stale; reload before retrying
- `404` - Project not found

### POST /projects/:id/restore

Restore a soft-deleted project.

**Request:**
```json
{
  "expectedRevision": 4
}
```

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

**Errors:**
- `400` - Invalid project ID format
- `409` - `expectedRevision` is stale; reload before retrying
- `404` - Deleted project not found
