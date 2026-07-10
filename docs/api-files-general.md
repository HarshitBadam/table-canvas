# Files and General API Behavior

[Back to the API index](api.md)

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
        "uploadDate": "..."
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
- `400` - No file uploaded
- `500` - Disallowed file type (rejected by the upload filter)

### GET /files/:id

Download a file.

**Response:** File stream with appropriate headers:
- `Content-Type`: File MIME type
- `Content-Length`: File size
- `Content-Disposition`: `attachment; filename="..."`

**Errors:**
- `404` - File not found

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

**Errors:**
- `404` - File not found

### DELETE /files/:id

Delete a file.

**Response (200):**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

**Errors:**
- `404` - File not found

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
  "errors": ["Validation error 1", "Validation error 2"]
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

The API allows requests from the configured `FRONTEND_URL` with credentials (cookies). Methods allowed: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
