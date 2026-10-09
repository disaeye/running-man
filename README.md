# Running Man

Personal running and fitness platform for activity import, training load, PMC charts,
calendar planning, strength training, physiology estimation, and backup-safe operations.

## Quickstart

Prerequisites: PostgreSQL 15+ reachable at localhost, Python 3.12+, Node.js 22+ (via nvm).

```bash
# Backend (terminal 1)
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Edit .env to set DATABASE_URL
uvicorn main:app --reload --port 8000

# Frontend (terminal 2)
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Verify health:
```bash
curl http://localhost:31001/health
```

Expected response:

```json
{"status":"ok"}
```

## Architecture overview

```
Intervals.icu / FIT
       |
       v
+----------------+      +--------------------------+
| FastAPI API    | ---> | PostgreSQL               |
| presentation   |      | athletes, activity_summary|
| application    |      | derived_metric_facts     |
| domain         |      | current_* views          |
+-------+--------+      | contracts/v1 registry    |
        |               +--------------------------+
        v
+----------------+
| Next.js Web    |
| PMC, calendar  |
+----------------+
```

Backend layers: `presentation` routers, `application` use cases, `domain` pure
load math, `infrastructure` repositories and external API clients. All load
and physiology facts are stored in `derived_metric_facts` (idempotent
computation runs) and surfaced through `current_activity_facts` /
`current_daily_facts` / `current_athlete_facts` views; the API contract is
registered in `contracts/v1`.

## Development commands

```bash
# Backend local
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn main:app --reload --port 8000
ruff check . && mypy src tests

# Frontend local (development — localhost only, no CDN)
cd apps/web
npm install
npm run dev
npm run lint && npm run test

# Frontend production (systemd, port 31000)
cd apps/web && npm run build && systemctl --user restart running-man-web.service
# See CLAUDE.md "Public access topology" and docs/operations.md

# Backend on this host (systemd, port 31001)
systemctl --user status running-man-api.service

# Data operations
./scripts/backup.sh
./scripts/restore.sh backups/<file>.sql
python scripts/verify_restore.py "$DATABASE_URL" "$TEST_DATABASE_URL"
python scripts/bench_pmc.py
python scripts/reconcile_intervals_icu.py --athlete-id <uuid> --days 90
```

> **⚠️ Production deployment**: Both services run on this host under systemd —
> the API as `running-man-api.service` on port 31001, the frontend as
> `running-man-web.service` on port 31000. The browser reaches everything through
> a single origin (default `running.532333.xyz`), so the frontend's server-side
> rewrites keep `/api/*` same-origin and the HttpOnly auth cookie works without CORS.
> See [docs/operations.md](docs/operations.md#frontend-deployment) and CLAUDE.md.

## Key paths

| Path | Purpose |
|---|---|
| `apps/api/src/domain/load/` | TSS, CTL, ATL, TSB, ACWR math |
| `apps/api/src/domain/physiology/` | HRmax/LTHR/threshold pace estimation (pure Python) |
| `apps/api/src/application/load/` | Recompute orchestration |
| `apps/api/src/infrastructure/repositories/` | Raw psycopg SQL repositories |
| `apps/api/src/infrastructure/integrations/` | Strava + Intervals.icu API clients and sync |
| `apps/api/src/infrastructure/parsing/` | FIT/GPX/TCX parsers and writers |
| `apps/web/app/` | Next.js App Router pages (thin assembly) |
| `apps/web/features/` | Feature-organized components + hooks + lib (pmc, today, activity, analysis, etc.) |
| `apps/web/shared/` | Cross-feature primitives (ui, layout, lib, types, config, hooks) |
| `apps/web/shared/config/sport-config.ts` | Single source of truth for sport labels |
| `apps/web/shared/lib/chart-tokens.ts` | Runtime CSS variable utility for chart colors (Claude editorial dual-mode) |
| `infra/db/` | Retired schema location — DDL authority lives in `apps/api/alembic/versions` (see `infra/db/schema/README.md`) |
| `scripts/` | Backup, restore, benchmark, reconciliation tools |

See `docs/architecture.md`, `docs/api-versioning.md`, `docs/clean-code.md`, and `docs/operations.md`.
