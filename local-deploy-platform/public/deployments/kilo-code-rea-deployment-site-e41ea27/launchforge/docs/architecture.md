# LaunchForge — Architecture

## Backend (server/)
- `index.ts` — Express app entry point, middleware, routes
- `config.ts` — Environment configuration with Zod validation
- `security.ts` — Path traversal prevention utilities
- `types.ts` — Shared TypeScript interfaces
- `db/index.ts` — SQLite database initialization and migrations
- `routes/` — HTTP route handlers
  - `projects.ts` — Project CRUD
  - `deployments.ts` — Deployment lifecycle
  - `envvars.ts` — Environment variable management
  - `domains.ts` — Domain alias records
  - `templates.ts` — Template listing
  - `analytics.ts` — Statistics
  - `preview.ts` — Preview file serving
  - `import.ts` — Archive import
- `services/`
  - `projects.ts` — Project business logic
  - `archive.ts` — Secure ZIP extraction
  - `build.ts` — Build execution pipeline
  - `envvars.ts` — Environment variable service
  - `domains.ts` — Domain service
  - `templates.ts` — Template definitions
  - `analytics.ts` — Analytics aggregation
  - `preview.ts` — Preview file resolution

## Frontend (client/)
- `App.tsx` — Router setup
- `components/` — Reusable UI components
- `pages/` — Dashboard pages
- `lib/` — API client, auth, utilities

## Data Flow
1. User uploads ZIP archive via frontend
2. Backend validates and extracts archive securely
3. Framework detected from project files
4. User configures build settings
5. Build executed in isolated process with timeout
6. Output copied to deployment directory
7. Preview served from deployment directory on 127.0.0.1