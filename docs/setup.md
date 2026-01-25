# Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | LTS recommended |
| npm | 9+ | Comes with Node.js |
| Docker | 24+ | Optional, for full-stack |
| Docker Compose | 2.0+ | Optional, for full-stack |

## Installation Methods

### Method 1: Frontend Only (Local Development)

This mode runs the application entirely in the browser using IndexedDB for persistence. No server required.

```bash
# Clone repository
git clone <repo-url>
cd excel-table-app

# Install dependencies
npm install

# Start development server
npm run dev
```

Access the application at `http://localhost:5173`.

**Limitations in this mode:**
- Data persists only in browser storage
- No user authentication
- No cross-device sync

### Method 2: Full Stack with Docker

This mode runs the complete application stack with user authentication and server-side persistence.

```bash
# Start all services
npm run docker:up

# Or run attached to see logs
npm run docker:up:attached
```

Services started:
| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | Vite dev server |
| Backend | http://localhost:3001 | Express API |
| MongoDB | localhost:27017 | Database |

**Seed sample data:**
```bash
npm run docker:seed
```

**Stop services:**
```bash
# Stop but preserve data
npm run docker:down

# Stop and remove all data
npm run docker:down:volumes
```

### Method 3: Manual Backend Setup

For running the backend without Docker:

```bash
# Terminal 1: Start MongoDB (requires local installation)
mongod --dbpath ./data/db

# Terminal 2: Start backend
cd server
npm install
npm run dev

# Terminal 3: Start frontend
npm run dev
```

## Environment Configuration

### Frontend Environment

Create `.env.local` in the project root:

```env
# API endpoint (only needed if backend is running)
VITE_API_URL=http://localhost:3001/api
```

### Backend Environment

Create `server/.env`:

```env
# Server
NODE_ENV=development
PORT=3001

# Database
MONGODB_URI=mongodb://localhost:27017/table-canvas

# JWT Authentication
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS
FRONTEND_URL=http://localhost:5173
```

**Security note:** Generate secrets with:
```bash
openssl rand -base64 32
```

## Docker Configuration

The `docker-compose.yml` defines three services:

### MongoDB Service
- Image: `mongo:7`
- Port: `27017`
- Volume: `mongodb_data` (persistent)
- Health check: Ping every 10s

### Backend Service
- Build context: `./server`
- Port: `3001`
- Depends on: MongoDB (healthy)
- Hot reload: Source mounted as read-only

### Frontend Service
- Build context: `.` (root)
- Port: `5173`
- Depends on: Backend
- Hot reload: Source mounted as read-only

### Resource Limits

For constrained environments, add to `docker-compose.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
  mongodb:
    deploy:
      resources:
        limits:
          memory: 1G
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 5173
lsof -i :5173

# Kill process
kill -9 <PID>
```

### Docker Build Fails

```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker compose build --no-cache
```

### MongoDB Connection Refused

```bash
# Check MongoDB logs
docker compose logs mongodb

# Verify health
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### CORS Errors

Ensure `FRONTEND_URL` in backend matches the actual frontend URL, including port.

### IndexedDB Storage Full

Clear site data in browser settings or use:
```javascript
indexedDB.deleteDatabase('table-canvas')
```

## Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all (review changes)
npm update

# Update specific package
npm install <package>@latest
```

## Build for Production

```bash
# Frontend build
npm run build

# Output in dist/
ls dist/
```

The build output can be served by any static file server. Configure the server to redirect all routes to `index.html` for client-side routing.
