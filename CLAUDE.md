# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About this customized version of Overleaf

Overleaf is an open-source online real-time collaborative LaTeX editor. This is the customized version of Overleaf Community Edition repository adopted for integration with peer-review system.

## Repository Structure

This is a **monorepo** containing multiple microservices and shared libraries managed via npm workspaces:

- **`services/`** - Microservices that make up Overleaf
  - `web` - Main HTTP frontend (Express + React)
  - `clsi` - LaTeX compilation service (Common LaTeX Service Interface)
  - `document-updater` - Real-time document update processing
  - `real-time` - WebSocket layer using socket.io
  - `filestore` - File storage service
  - `docstore` - Document storage service
  - `chat` - Chat/comments service
  - `contacts` - User contacts management
  - `notifications` - Notifications service
  - `project-history` - Project version history
  - `history-v1` - Legacy history service

- **`libraries/`** - Shared libraries used across services
  - `logger` - Logging utilities
  - `metrics` - Metrics collection
  - `settings` - Settings management
  - `redis-wrapper` - Redis client wrapper
  - `mongo-utils` - MongoDB utilities
  - `object-persistor` - Object storage abstraction
  - `overleaf-editor-core` - Core editor functionality
  - `ranges-tracker` - Track ranges in documents
  - And more...

- **`server-ce/`** - Docker build files for Community Edition
- **`develop/`** - Development environment configuration

## Development Commands

### Initial Setup

```bash
# From develop/ directory
cd develop
bin/build                    # Build all Docker images (15-30 min first time)
docker build texlive -t texlive-full  # Build TeX Live image for compilation (1-2 hours, optional)
```

**macOS note**: Create `develop/.env` with `DOCKER_SOCKET_PATH=/var/run/docker.sock.raw` if needed for compilation.

### Running Services

```bash
# From develop/ directory
bin/up                       # Start all services in production mode
bin/dev                      # Start all services in development mode (auto-reload)
bin/dev web webpack          # Start only web + webpack (recommended for frontend work)
bin/dev web clsi document-updater  # Start specific services in dev mode
bin/down                     # Stop all services
```

After starting services, navigate to http://localhost/launchpad to create the first admin account.

### Development Mode Features

- **Backend auto-restart**: Services use `node --watch` to restart on code changes
- **Frontend hot reload**: The `webpack` service provides Hot Module Replacement for React
- **Debug ports exposed**: Each service exposes a debug port (see Debugging section)
- **Volume mounts**: Code is mounted into containers for live updates

### Testing

**Web service** (`services/web/`):
```bash
npm run test:unit:all              # All unit tests (Mocha + Vitest)
npm run test:unit:app              # Backend unit tests
npm run test:unit:esm              # ESM unit tests (Vitest)
npm run test:unit:esm:watch        # Vitest watch mode
npm run test:frontend              # Frontend tests (Mocha)
npm run test:frontend:coverage     # Frontend tests with coverage
npm run test:acceptance:app        # Acceptance tests
npm run cypress:run-ct             # Cypress component tests
MOCHA_GREP="pattern" npm run test:unit:all  # Run tests matching pattern
```

**Other services** (e.g., `services/clsi/`, `services/document-updater/`):
```bash
npm run test:unit                  # Unit tests
npm run test:acceptance            # Acceptance tests
npm run test:unit -- --grep="pattern"  # Run specific tests
```

### Linting and Formatting

**Root level**:
```bash
npm run lint                 # Lint all JavaScript
npm run lint:fix             # Auto-fix lint issues
npm run format               # Check formatting
npm run format:fix           # Auto-fix formatting
```

**Web service** (supports TypeScript):
```bash
npm run lint                 # Lint JS/TS/JSX/TSX
npm run lint:fix             # Auto-fix lint issues
npm run lint:styles          # Lint SCSS
npm run lint:styles:fix      # Auto-fix SCSS
npm run format               # Check JS/TS/JSON formatting
npm run format:fix           # Auto-fix formatting
npm run format:styles        # Check CSS/SCSS formatting
npm run format:styles:fix    # Auto-fix CSS/SCSS
npm run format:pug           # Check Pug templates
npm run format:pug:fix       # Auto-fix Pug templates
npm run type-check           # TypeScript type checking (frontend)
npm run type-check:backend   # TypeScript type checking (backend)
```

### Other Useful Commands

```bash
# From develop/
bin/logs                     # View all service logs
bin/logs web                 # View specific service logs
bin/shell web                # Open shell in web container

# Web service specific
cd services/web
npm run webpack              # Run webpack dev server
npm run webpack:production   # Production webpack build
npm run migrations           # Run database migrations
npm run routes               # Display all routes
npm run storybook            # Start Storybook for component development
```

## Architecture Overview

### Service Communication

Overleaf uses a **microservices architecture** with services communicating via HTTP APIs and Redis pub/sub:

1. **web** - Main entry point, handles HTTP requests, renders UI, coordinates other services
2. **real-time** - WebSocket connections for live collaboration (socket.io)
3. **document-updater** - Applies real-time updates to documents, manages operational transforms
4. **docstore** - Persistent storage for documents (MongoDB)
5. **filestore** - Handles file uploads and storage
6. **clsi** - Compiles LaTeX documents to PDF using Docker containers running TeX Live
7. **project-history** - Tracks project changes over time
8. **chat** - Manages project comments/chat

### Web Service Architecture

The `web` service is organized by features in [services/web/app/src/Features/](services/web/app/src/Features/):

- **Authentication** - User auth, sessions, SSO
- **Project** - Project CRUD operations
- **Compile** - Compilation coordination
- **Editor** - Editor-specific functionality
- **Subscription** - Subscription/billing logic
- **History** - Project history management
- **Collaborators** - Managing project collaborators
- **Documents** - Document operations
- **FileStore** - File operations
- Each feature typically contains: `{Feature}Controller.js`, `{Feature}Handler.js`, `{Feature}Manager.js`

**Frontend** is in [services/web/frontend/js/](services/web/frontend/js/):
- **features/** - Feature-specific React components and logic
- **ide/** - Core IDE functionality
- **infrastructure/** - App infrastructure
- **shared/** - Shared components
- **utils/** - Utility functions

### Real-Time Collaboration

1. User edits in browser → **real-time** service (WebSocket)
2. **real-time** → **document-updater** (applies operational transforms)
3. **document-updater** → **docstore** (persists to MongoDB)
4. **document-updater** → **project-history** (records for version history)
5. Changes broadcast back to all connected clients via **real-time**

### LaTeX Compilation

1. User requests compile → **web** → **clsi**
2. **clsi** fetches resources, creates temporary directory
3. **clsi** spawns Docker container with TeX Live, runs LaTeX compilation
4. Output PDF and logs returned through **clsi** → **web** → user

### Database and Persistence

- **MongoDB** - Primary database (documents, projects, users)
- **Redis** - Pub/sub for real-time updates, caching, session storage
- **Docker volumes** - File storage, caches

### Dynamic Settings

The web service loads dynamic settings from MongoDB on startup ([app.mjs:82-116](services/web/app.mjs#L82-L116)):
- Settings like `disableChat`, `disableLinkSharing`, `adminEmail`, `maxDocLength`, `maxUploadSize`
- These override compile-time settings from `@overleaf/settings`

## Development Workflow

### Frontend Development

1. Start services: `cd develop && bin/dev web webpack`
2. Edit files in [services/web/frontend/js/](services/web/frontend/js/)
3. Browser auto-refreshes with changes (HMR)
4. View at http://localhost

### Backend Development

1. Start services: `cd develop && bin/dev web` (or specific services)
2. Edit files in [services/web/app/src/](services/web/app/src/) or other service's `app/` directory
3. Service auto-restarts on changes (1-3 seconds)
4. Refresh browser to see changes

### Running a Single Test

```bash
# Web service
cd services/web
MOCHA_GREP="test name" npm run test:unit:app
MOCHA_GREP="test name" npm run test:frontend

# Other services
cd services/clsi  # or other service
npm run test:unit -- --grep="test name"
```

## Debugging

When services run in development mode (`bin/dev`), debug ports are exposed on localhost:

| Service            | Debug Port |
|--------------------|------------|
| web                | 9229       |
| clsi               | 9230       |
| chat               | 9231       |
| contacts           | 9232       |
| docstore           | 9233       |
| document-updater   | 9234       |
| filestore          | 9235       |
| notifications      | 9236       |
| real-time          | 9237       |
| history-v1         | 9239       |
| project-history    | 9240       |

**Chrome DevTools**: Navigate to `chrome://inspect`, configure `localhost:[port]`, then inspect the remote target.

## Key Technologies

- **Backend**: Node.js, Express
- **Frontend**: React, Bootstrap 5
- **Real-time**: Socket.io
- **Testing**: Mocha, Chai, Sinon, Vitest, Cypress
- **Build**: Webpack
- **Databases**: MongoDB, Redis
- **Containerization**: Docker, Docker Compose
- **LaTeX**: TeX Live (in Docker)

## Important Notes

- This is a **monorepo**: Changes to libraries affect all services
- Services are **loosely coupled**: Each service can be developed/tested independently
- **Development mode mounts source code**: Changes reflect immediately in containers
- **macOS specific**: May need to configure Docker socket path for CLSI compilation
- **First build is slow**: Building all services and TeX Live can take 1-2 hours
- **Testing in isolation**: Many services have acceptance tests that can run independently

## CLSI Compilation Cache Configuration

The CLSI service has configurable cache settings that control how long compilation results are stored. These can be configured via environment variables in your `develop/.env` file or docker-compose configuration:

### Environment Variables

```bash
# Output file cache settings
OUTPUT_CACHE_LIMIT=10                    # Max number of cached builds per project (default: 10)
OUTPUT_CACHE_MAX_AGE_MS=604800000        # Max age for cached files in ms (default: 7 days)

# In-memory compilation cache settings
# Note: Cache is automatically cleared when output files are deleted
# This is just a safety timeout for abandoned projects
COMPILATION_CACHE_MAX_AGE_MS=604800000   # Max age for in-memory cache in ms (default: 7 days, same as output)
```

### What is `CACHE_LIMIT`?

**`CACHE_LIMIT`** (controlled by `OUTPUT_CACHE_LIMIT` env var) determines the **maximum number of build directories** stored per project.

- Each time you compile, a new build directory is created with a unique `buildId` (e.g., `19a64fb105a-33e4f5d189d683a4`)
- Build directories are stored in `develop/output/{projectId}/generated-files/{buildId}/`
- When the number of builds exceeds `CACHE_LIMIT`, the **oldest builds are deleted**
- Higher limit = more disk space used, but better chance of cache hit when switching between different versions

**Example**: With `CACHE_LIMIT=10`, the system keeps the 10 most recent compilation results. If you compile 11 times, the oldest build is deleted.

### What is `CACHE_AGE`?

**`CACHE_AGE`** (controlled by `OUTPUT_CACHE_MAX_AGE_MS` env var) determines the **maximum age** of cached build files.

- Build directories older than `CACHE_AGE` are automatically deleted during cleanup
- Age is calculated from the `buildId` timestamp (encoded in the first part of buildId)
- Cleanup runs periodically in the background

**Example**: With `CACHE_AGE=7 days`, any build directory older than 7 days is deleted, regardless of `CACHE_LIMIT`.

### Recommended Settings

For **development** (frequent changes, limited disk space):
```bash
OUTPUT_CACHE_LIMIT=5
OUTPUT_CACHE_MAX_AGE_MS=86400000          # 1 day
COMPILATION_CACHE_MAX_AGE_MS=3600000      # 1 hour
```

For **production-like** (persistent cache, more disk space):
```bash
OUTPUT_CACHE_LIMIT=20
OUTPUT_CACHE_MAX_AGE_MS=2592000000        # 30 days
COMPILATION_CACHE_MAX_AGE_MS=86400000     # 24 hours
```

For **true persistent cache** (never expire based on time, only on limit):
```bash
OUTPUT_CACHE_LIMIT=100                    # Very high limit
OUTPUT_CACHE_MAX_AGE_MS=31536000000       # 1 year (effectively never)
COMPILATION_CACHE_MAX_AGE_MS=2592000000   # 30 days
```

### Current Defaults (as of this implementation)

- `OUTPUT_CACHE_LIMIT` = **10 builds** per project
- `OUTPUT_CACHE_MAX_AGE_MS` = **7 days** (604,800,000 ms)
- `COMPILATION_CACHE_MAX_AGE_MS` = **7 days** (604,800,000 ms) - same as output cache

These are significantly higher than the original Overleaf CE defaults (2 builds, 90 minutes) to support better caching and reduce unnecessary recompilations.

### How the Two Caches Work Together

The in-memory **Compilation Cache** is automatically synchronized with the on-disk **Output Cache**:

1. **When files change** - both caches are cleared (via MD5 hash check)
2. **When output files are deleted** - compilation cache is also cleared automatically
3. **Time-based cleanup** - both use the same timeout (7 days by default)

This means you typically only need to configure `OUTPUT_CACHE_LIMIT` and `OUTPUT_CACHE_MAX_AGE_MS`. The compilation cache will stay in sync automatically.

### Compile Directory and Concurrent Compilations

**Important**: All compilations for a project use the **same compile directory** (`compiles/{projectId}/`), regardless of compilation settings (draft mode, compiler, etc.). This allows LaTeX's incremental compilation to work efficiently - auxiliary files (.aux, .toc, .bbl) are preserved between compilations.

**Handling conflicts**: The `CompilationQueueManager` prevents conflicts when multiple users try to compile with different settings:
- If a compilation is running with config A, and someone requests compilation with config B, the second request **waits in queue**
- Only one compilation runs at a time per project
- Requests with the **same config** join the existing compilation (multiple users see the same result)
- This ensures auxiliary files aren't corrupted by simultaneous writes

**Future enhancement**: Smart cleanup could be implemented to:
- Save MD5 hash with each build
- On cleanup, compare current MD5 with saved MD5
- If MD5 matches (files unchanged): keep PDF and synctex, delete auxiliary files
- If MD5 differs: delete entire build (results are outdated)
- This would preserve PDFs for archived projects without unnecessary recompilation
