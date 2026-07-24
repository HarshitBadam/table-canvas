# Setup

## Prerequisites

- Node.js 24+ and npm
- Docker + Docker Compose (only for the full stack)

## Run modes

### 1. Frontend only (recommended)

Runs entirely in the browser, no backend, no database.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and choose **Continue as guest**. Everything persists in
IndexedDB and remains in that browser with no cross-device sync. Development can set
`VITE_AUTO_GUEST=true` to skip the explicit choice.

### 2. Full stack (Docker)

Adds auth and server-side persistence.

```bash
npm run docker:up            # MongoDB + backend + frontend
npm run docker:up:attached   # same, but attached so you see logs
npm run docker:seed          # optional sample data
npm run docker:down          # stop, keep data
npm run docker:down:volumes  # stop and wipe data
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| MongoDB | localhost:27017 |

### 3. Manual backend (no Docker)

```bash
# Terminal 1: MongoDB (needs a local install)
mongod --dbpath ./data/db

# Terminal 2: backend
cd server && npm install && npm run dev

# Terminal 3: frontend
npm run dev
```

## Environment variables

Only needed when running the backend. In local mode you can skip all of this.

**Frontend**: `.env.local` in the project root:

```env
VITE_API_URL=http://localhost:3001/api
VITE_AUTO_GUEST=false
```

**Backend**: `server/.env`:

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/table-canvas

JWT_ACCESS_SECRET=<32+ char secret>
JWT_REFRESH_SECRET=<32+ char secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:5173   # must match the frontend origin for CORS
COOKIE_SAME_SITE=lax

# Optional — enables Google Sign-In (get from Google Cloud Console → Credentials)
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

**Frontend**: also add the same Google client ID in the project-root `.env`:

```env
VITE_API_URL=http://localhost:3001/api
VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

Generate secrets with `openssl rand -base64 32`.

Google Sign-In is optional in every environment. The client hides the Google button
when its client ID is absent.

## Build

```bash
npm run build   # tsc + vite, output in dist/
```

`dist/` can be served by any static file server. Configure it to fall back to `index.html` for
client-side routing.

For the hosted Vercel frontend and production backend checklist, see
[Production deployment](production.md).

## Gotchas

- **Backend reachability** is checked during authentication. When it is unavailable,
  users can explicitly continue with a guest workspace.
- **CORS errors** usually mean `FRONTEND_URL` doesn't match the actual frontend origin (including port).
- **Reset local data**: `indexedDB.deleteDatabase('table-canvas-v2')` in the browser console, or
  clear site data.
