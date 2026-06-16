# LatexSpace: Independent fork of Overleaf initially created for use in a peer review system

Independent Overleaf CE fork adapted for journal peer review systems and advanced self-hosted installations.

This project is based on the Overleaf CE architecture, but this branch adds custom capabilities and removes limits/subscription-related logic that is not relevant for this fork.

## What this version is

- Base platform: `overleaf/overleaf` (Community Edition).
- Purpose: collaborative LaTeX editing platform with peer-review workflow integration.
- Fork additions:
  - Service-to-Service API (`/service/*`, Basic Auth, no browser session required).
  - Review panel and comments API extensions.
  - Project/file protection and user permission controls.
  - Improved localization (including Russian language support).

Important: resources from the upstream Overleaf repository are useful only as a reference for the base platform. For this fork, prioritize documentation from this repository.

## Architecture (short)

This is a monorepo with microservices:

- `services/web` - main HTTP service (UI, API, orchestration).
- `services/real-time` - WebSocket layer for collaboration.
- `services/document-updater` - applies document updates (OT pipeline).
- `services/docstore` and `services/filestore` - document and file storage.
- `services/clsi` - LaTeX to PDF compilation (via Docker TeX Live image).
- `services/chat`, `services/project-history`, etc. - comments, history, related features.
- `libraries/*` - shared libraries used by services.

Basic edit flow:
1. Client edits go to `real-time`.
2. `document-updater` applies updates and persists them.
3. Updates are broadcast to connected clients.

## Repository structure

```text
.
|-- services/                    # microservices
|-- libraries/                   # shared libraries
|-- develop/                     # dev environment (docker compose + bin/* scripts)
|-- server-ce/                   # production image build files
|-- scripts/
|   |-- prepare_install.sh       # build deployment package
|   `-- install_overleaf.sh      # install package on server
|-- api_doc/                     # API docs for this fork
|-- CLAUDE.md                    # AI-facing development guidance
`-- README.deployment.md         # deployment process details
```

## Run mode 1: local development

Recommended mode for development with hot reload.

1) Build images:
```bash
cd develop
bin/build
```

2) (Optional, but usually needed for compilation) build TeX Live image:
```bash
docker build texlive -t texlive-full
```

3) Start services:
```bash
# all services in dev mode
bin/dev

# minimal setup for UI/backend work
bin/dev web webpack
```

4) First login:
- open `http://localhost/launchpad`
- create the first admin account

Useful commands:
```bash
bin/down
bin/logs
bin/logs web
bin/shell web
```

Additional docs: `SETUP_RU.md`, `README_DEV.md`, `TESTING.md`.

## Run mode 2: deployment package for server install

### On build machine

```bash
./scripts/prepare_install.sh
```

The script builds and packages everything into `overleaf-custom.tar.gz` (including Docker images and runtime configuration).

### On target server

1) Prepare `config.json` (you can start from `overleaf_config.json.example`).

2) Install:
```bash
./scripts/install_overleaf.sh overleaf-custom.tar.gz config.json
```

After installation, services are managed via `docker compose` in `installDir` (from `config.json`, default `/opt/overleaf`):

```bash
cd <installDir>
docker compose up -d
docker compose down
docker compose logs -f
```

Details: `README.deployment.md`.

## Fork documentation

- `CLAUDE.md` - overview of custom features and architecture details.
- `api_doc/API_INDEX.md` - full API documentation index.
- `api_doc/SERVICE_TO_SERVICE_API.md` - key document for `/service/*` API.
- `api_doc/API_DOCUMENTATION_RU.md` - extended API reference (Russian).
- `TESTING.md` - deployment testing scenarios.
- `CODE_TESTS_RU.md` - automated code tests (unit/component): how to run, what's covered, review-panel bug diagnosis.

## Compatibility and security

- This is an independent codebase, not an official Overleaf Community Edition or Server Pro release. It will not be synchronized with the upstream repository. Even though some features may look similar to the Server Pro (e.g. sandboxed compilation), the implementation may turn out to be completely different. Therefore, it is not recommended to rely on the Server Pro documentation if you are using these features.
- Production concerns (TLS, reverse proxy, backup, monitoring, hardening) must be configured for your infrastructure.
- Before public deployment in untrusted environments, validate compilation isolation model and container security policies. 

## License

The code is released under AGPL-3.0. See `LICENSE`.

The base platform and a significant part of the code originate from Overleaf (c) Overleaf, 2014-2025.
