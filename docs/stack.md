# Technology stack

This page is the technology inventory. The design choices and runtime boundaries are explained in [Architecture](architecture.md).

## Client

| Responsibility | Technology | Role |
|---|---|---|
| Application | React 18, TypeScript, Vite | SPA runtime, type safety, and builds |
| Styling | Tailwind CSS | Shared design tokens and component styling |
| Routing | React Router | Project and view navigation |
| State | Zustand, Immer | Project graph, editing history, and runtime state |
| Canvas | ReactFlow, Dagre | Node graph interaction and automatic layout |
| Grid | TanStack Virtual | Windowed rendering for large tables |
| Charts | Recharts | Bar, line, pie, and scatter charts |
| Reports | TipTap, pdfmake | Rich text editing and PDF generation |

## Data and computation

| Responsibility | Technology | Role |
|---|---|---|
| Query engine | DuckDB-WASM | SQL execution inside a Web Worker |
| Local persistence | IndexedDB, `idb` | Projects, files, reports, and durable sync queues |
| CSV parsing | PapaParse | CSV import |
| Workbook handling | SheetJS `xlsx` | Excel import and export |
| Project archives | JSZip | Self-contained project bundles |

## Optional backend

| Responsibility | Technology | Role |
|---|---|---|
| HTTP API | Express | Authentication, project, and file endpoints |
| Database | MongoDB, Mongoose | Users, project snapshots, and GridFS file storage |
| Authentication | JWT cookies, bcrypt, Google Auth Library | Password and Google sign-in |
| API protection | Helmet, CORS, CSRF middleware, rate limiting | Browser and request security controls |
| Observability | Sentry | Client and server error reporting |

The backend is not part of the computation path. DuckDB, project editing, and local persistence continue to work when the API is unavailable.

## Tooling and delivery

| Responsibility | Technology |
|---|---|
| Unit and integration tests | Vitest, Testing Library |
| Browser tests | Playwright, axe-core |
| Static analysis | ESLint, TypeScript, Knip |
| Local full stack | Docker Compose |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Continuous integration | GitHub Actions |

Continue with [Architecture](architecture.md) for runtime behavior or [Repository structure](repository-structure.md) for the code map.
