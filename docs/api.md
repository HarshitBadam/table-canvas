# API Reference

REST API for the **optional** backend. The app runs fully in local mode without it; these
endpoints only matter when you're running the server for auth and cross-device sync.

Base URL: `http://localhost:3001/api`

All endpoints except the health check return JSON with the structure:
```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
```

## Endpoint references

- [Authentication and projects](api-auth-projects.md)
- [Files, health, and general behavior](api-files-general.md)
