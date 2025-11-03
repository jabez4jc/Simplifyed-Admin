## Purpose

Short actionable guidance to help AI coding agents be productive in this repository.

## Big picture (one-paragraph)

This project is a centralized Admin Dashboard for managing multiple OpenAlgo trading instances. The stack is Node.js/Express backend (backend/), a vanilla-JavaScript + Tailwind frontend (frontend/), and SQLite databases (backend/database/). The backend polls OpenAlgo endpoints (tradebook/positionbook/ping) to compute realized/unrealized/total P&L and exposes API endpoints under `/api/*` consumed by the frontend. Authentication is Google OAuth via Passport.js; sessions are stored using connect-sqlite3.

## Key files and where to look
- `backend/server.js` — main Express server and route wiring (P&L engine lives here).
- `backend/auth.js` — Google OAuth setup and role handling.
- `backend/package.json` & `ecosystem.config.js` — scripts (dev, pm2) and production config.
- `backend/database/` — SQLite DB files and schema (instances, users, sessions).
- `frontend/app.js` & `index.html` — frontend entry points; uses Fetch API and polling.
- `CLAUDE.md` — the authoritative technical doc; contains P&L algorithms and API mapping (use as single-source-of-truth).
- `DATABASE_SCHEMA.md` & `DEPLOYMENT.md` — DB and deployment specifics.
- `install-ubuntu.sh` — automated production install (useful for deployment examples).

## Architecture & data flow (concise)
- Frontend (vanilla JS) calls backend APIs (`/api/*`).
- Backend polls OpenAlgo instance endpoints (`/api/v1/tradebook`, `/api/v1/positionbook`, `/api/v1/ping`) to compute P&L and health.
- Computed values are stored in SQLite `instances` table fields: `realized_pnl`, `unrealized_pnl`, `total_pnl`.
- Safe-switch workflow: close positions -> cancel orders -> verify -> toggle analyzer mode (endpoints under `POST /api/instances/:id/*`).

## Project conventions agents should follow
- Frontend is intentionally framework-free; prefer small, explicit DOM + Fetch edits over introducing frameworks.
- Polling cadence: 30s for P&L updates (frontend), 20min for health checks (backend). Preserve these intervals unless a matching change is made everywhere.
- Auth pattern: Passport.js + Google OAuth; sessions use SQLite. Do not replace session storage with another store unless updating wiring in `auth.js` and `server.js`.
- Database schema is canonical: when adding fields, update `DATABASE_SCHEMA.md`, migration scripts, and any code that aggregates P&L (see CLAUDE.md P&L functions).

## How to run locally (short)
1. Backend: `cd backend && npm install && cp .env.example .env && npm start` (or `npm run dev` for nodemon).
2. Frontend: `cd frontend && python3 -m http.server 8080` (serves `index.html` on :8080). Frontend expects backend at `http://localhost:3000` by default.
3. OAuth: place `client_secret_SimplifyedAdmin.apps.googleusercontent.com.json` into `backend/` and populate `.env` variables (see CLAUDE.md ENV section).

## Useful scripts & commands (from `backend/package.json`)
- `npm start` — start backend production server.
- `npm run dev` — start backend with auto-reload.
- `npm run pm2:start` / `pm2:restart` / `pm2:logs` — PM2 helpers used in production (see `ecosystem.config.js`).
- DB helpers: `npm run db:backup`, `npm run db:migrate`, `npm run db:seed` when present.

## API/Endpoints to reference in edits
- Instance list & controls: `GET /api/instances`, `POST /api/instances`, `PUT /api/instances/:id`, `DELETE /api/instances/:id`.
- Trading ops: `POST /api/instances/:id/analyzer-toggle`, `/close-positions`, `/cancel-orders`, `/safe-switch`.
- OpenAlgo endpoints polled by backend: `/api/v1/tradebook`, `/api/v1/positionbook`, `/api/v1/ping`.

## Code patterns and examples to reuse
- P&L grouping logic: see `CLAUDE.md` -> `calculateRealizedPnL(trades)` and `getAccountPnL(instance)`. If you change trade aggregation, update every caller and DB fields.
- Safe-switch steps: implemented as a sequence of API calls; preserve order (close positions -> cancel orders -> toggle analyzer).

## When changing DB schema or auth
- Update `DATABASE_SCHEMA.md` and add a migration or backup script.
- If changing auth flow (Google OAuth), update `backend/auth.js`, environment docs in CLAUDE.md, and deployment `install-ubuntu.sh` if necessary.

## Tests, linting, and quality gates
- Available npm scripts (see `backend/package.json`): `npm run test`, `npm run lint`. Run these locally after changes.
- Quick sanity: run backend and a simple frontend static server to exercise API surface; verify OAuth flows and one instance P&L calculation.

## Small things agents should not do
- Don't introduce frontend frameworks (React/Vue) without a repo-wide plan — the UI is intentionally framework-free.
- Don't change polling/health intervals in a single place; update both frontend and backend semantics and README/CLAUDE.md.

## Where to ask questions / follow up
- If unclear about P&L logic or intended behavior, point to `CLAUDE.md` first. For missing details, ask maintainers and include a reference to the specific file/line you inspected.

---

If you want, I can now commit this file and run `npm run lint` and `npm test` in `backend/` to validate there are no immediate script errors; tell me which validation you prefer next.
