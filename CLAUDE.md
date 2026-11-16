# CLAUDE.md — AI Agent Guide

> This file gives any AI agent the context needed to work effectively in this project.
> For human-facing docs, see [README.md](README.md) and [docs/](docs/).

## Public access topology

```
Browser
   │
   ▼
https://running.532333.xyz     ← single origin (CDN/gateway in front of this host)
   │
   ▼
openresty on this host (:80/:443)
   ├── /api/*  /auth/*  /webhooks/*  →  127.0.0.1:31001  (FastAPI)
   └── /*                           →  127.0.0.1:31000  (Next.js `next start`)
```

Both services run on this machine as systemd **user** units:

| Unit | Port | Command |
|---|---|---|
| `running-man-api.service` | 31001 | `.venv/bin/python -m uvicorn main:app --host 127.0.0.1` |
| `running-man-web.service` | 31000 | `node node_modules/next/dist/bin/next start -p 31000` |

**Every port this project binds stays inside 31000–31099.**

| Port | Used by |
|---|---|
| 31000 | production frontend |
| 31001 | production API |
| 31002 | gate frontend for the Playwright suite (`scripts/gate_server.py`) |
| 31003 | local development frontend (`npm run dev`) |
| 31004 | local development API (`uvicorn --reload`) |

```bash
systemctl --user status  running-man-api.service running-man-web.service
systemctl --user restart running-man-web.service    # only after scripts/deploy-web.sh
journalctl --user -u running-man-api.service -f
```

**Same-origin is the point.** The frontend's server-side rewrites (`apps/web/next.config.js`, target from `API_URL` in `apps/web/.env`) keep `/api/*` on this one domain, so the HttpOnly auth cookie works with no CORS configuration — the API registers no CORS middleware on purpose.

Key facts:

- **Production must use `next start`, never `next dev`.** `next dev` behind a CDN silently breaks React hydration (WebSocket HMR cannot be proxied) — see docs/operations.md.
- **Kill Next.js by port, never by process name** (see below).
- **Python version is managed by pyenv.** `.python-version` pins 3.12.15; build/sync from `apps/api` with `uv sync --frozen --extra dev --all-groups` against that interpreter.
- **Test database** is `wind_runner_test` on the same PostgreSQL instance. `TEST_DATABASE_URL` overrides it; otherwise `apps/api/testsupport.py` derives it from `DATABASE_URL` by replacing the database name, so no credential lives in version control. Plain TCP 5432, no unix-socket indirection.
- **PostgreSQL runs in Docker** (`1Panel-postgresql-*`), published on host port 5432.
- **Never install system packages, create databases/roles, change permissions or start long-running services without asking first.**

## Project: Running Man

Personal running/fitness platform: activity import (Intervals.icu/Strava), training load (PMC), recovery insights, calendar planning, goals, strength training, and physiology estimation (HRmax/LTHR/threshold pace).

- **Backend**: FastAPI (Python 3.12+) at `apps/api/`, port 31001
- **Frontend**: Next.js 16 (React, TypeScript) at `apps/web/`, port 31000
- **Database**: PostgreSQL 18 in Docker, host port 5432
- **Edge**: gateway/CDN → this host, domain `running.532333.xyz`

## Critical deployment rule

**Both services run on this host under systemd.** Rebuild and restart the frontend after any change under `apps/web`:

```bash
scripts/deploy-web.sh          # build into a private dir, swap, restart, verify assets
scripts/deploy-web.sh --check  # verify the live service without rebuilding
```

**Never run `npm run build` in `apps/web` against a running service.** `next start` reads its chunk manifest once at boot; overwriting `.next` under it leaves the process advertising chunk files the build just deleted. The page still returns 200 with correct server-rendered HTML, but every `/_next/static` request 500s and the browser renders it with no CSS. `deploy-web.sh` builds into `.next-build`, swaps it in only after the build completes, and then probes every asset the served HTML references. The gates build into `.next-gate` for the same reason.

Backend changes only need `systemctl --user restart running-man-api.service`. Use `scripts/run_gates.py` before restarting — see "Common tasks" below.

> Historical note: the frontend was briefly deployed to Vercel while only the API ran here. That split is retired because it forced cross-site cookies; running both sides on one origin removes the problem. `next dev` behind a CDN still causes silent React hydration failure (WebSocket HMR cannot be proxied), so production must stay on `next start`.

### Killing local Next.js servers: by port, never by name

**Never run `pkill -f "next-server"` or `pkill -f "next start"`.** `pkill -f` matches every process on the host whose full command line contains the pattern, and all Next.js servers share the identical `next-server (v16.3.1)` cmdline regardless of project or port. This has already taken down the local **pi-web** UI (port 30141), which exits with `Next.js exited unexpectedly (signal SIGKILL)`.

To restart a local `next start` (e2e, manual QA), kill the port instead:

```bash
cd apps/web
npm run qa:kill-port -- 31002                      # SIGTERM, then SIGKILL after 5s
node scripts/kill-port.mjs 31002 --timeout 2000    # custom escalation window
```

`scripts/kill-port.mjs` resolves the PID via `fuser -n tcp <port>`, so it only ever touches the process holding that exact port. For the systemd unit, prefer `systemctl --user restart running-man-web.service`, which signals only that unit's cgroup.

## Architecture

```
Browser → running.532333.xyz (gateway/CDN)
            │
            ▼
openresty on this host
   ├── /api/*  /auth/*  /webhooks/*  →  uvicorn :31001 (FastAPI) ─┐
   └── /*                            →  next start :31000        │
                                          │                      │
                                          └──── PostgreSQL 18 :5432
```

Next.js rewrites `/api/*`, `/auth/*` and `/webhooks/*` to the FastAPI backend (see `apps/web/next.config.js`).

Backend layers: `presentation` (routers) → `application` (use cases) → `domain` (pure math) → `infrastructure` (psycopg repos, external clients).

## Code structure

The frontend (`apps/web/`) is organized by **feature**, not by technical layer:

```
apps/web/
  app/                 # Next.js App Router — routes only (thin page.tsx assembly)
  features/            # One directory per feature (components + hooks + lib colocated)
    pmc/               # PMC chart, PmcChipRow, usePmcData, pmc-format, pmcSemantics
    today/             # TodayHero, MetricBar, TodayActionCard, readiness/recommendation hooks, metrics/
    activity/          # ActivityListItem, ActivityMiniChart, GpsTrack, useActivities, gps-track lib
    analysis/          # AnalysisLoad, AnalysisAbility, AnalysisIntensity, metric-taxonomy
    health/            # HealthChart, RecoveryScoreCard, recovery lib, useWellness
    goals/             # GoalCard, GoalForm, MilestoneList, useGoals
    strength/          # StrengthWorkoutEditor, ExerciseLogCard, useExercises
    calendar/          # WorkoutBuilder, CalendarListView, CalendarTabContent
    plan/              # PlanWeekView, PlanMonthView, PlanForecast, usePlanQuality
    performance/       # PerformanceLoad, PerformanceAbility, RacePredictor
    trends/            # TrendsView, PmcTrendChart, BodyMetricsTrend
    data/               # DataSources, SyncStatus, DataHealthSummary, DataQuality, useDataHealth/useDataQuality
    settings/            # SettingsProfile, SettingsZones, SettingsTrainingParams, useProfile
    auth/              # LoginForm, RegisterForm
  shared/              # Cross-feature primitives (depended on BY features/, never depends on features/)
    ui/                # Card, Button, Dialog, Tabs, KpiCard, Sparkline, ZoneScale (shadcn/ui)
    layout/            # AppShell, TopTabBar（MobileTabBar 通吃全断点）
    lib/               # format, api, auth, swr, utils, chart-tokens, motion
    types/             # TypeScript type definitions
    config/            # sport-config, nav-config, terms
    hooks/             # useChartConfig, useECharts (infra hooks)
    ai/                # AiPlaceholder
```

**Import aliases** (`tsconfig.json`):
- `@shared/*` → `./shared/*`
- `@features/*` → `./features/*`
- `@/*` → `./*` (legacy, prefer specific aliases)

**Rules**:
- `features/` depends on `shared/`, never the reverse.
- Features consume each other via explicit imports (e.g., `features/today` imports `@features/pmc/components/PmcChipRow`).
- `app/` route files (`page.tsx`) are thin assembly — they import from `features/` and compose, never contain feature logic.
- Frontend unit tests were removed (commit `1aa2d3f`); the only web test is the `apps/web/scripts/hex-ban.test.ts` design-token gate (runs under `npm run test`). There is no per-component `.test.tsx` convention anymore.
- The old `components/`, `hooks/`, and `lib/` directories are **gone** — do not recreate them.

Backend (`apps/api/src/`) keeps its 4-layer architecture. External integrations live under `infrastructure/`:
- `infrastructure/integrations/strava/` — Strava API client + sync (**deprecated — Strava support is no longer wanted; removal is pending**)
- `infrastructure/integrations/intervals/` — Intervals.icu client + sync
- `infrastructure/parsing/` — FIT/GPX/TCX parsers and writers

## Key conventions

- **Frontend**: all sport labels go through `getSportConfig()` in `apps/web/shared/config/sport-config.ts` — never hardcode sport label maps
- **File size**: no file > 250 LOC (enforced by `scripts/lint_file_size.py`, see [docs/clean-code.md](docs/clean-code.md))
- **Navigation**: bottom tab bar (`apps/web/shared/layout/TopTabBar.tsx` MobileTabBar export) serves all breakpoints with 5 entries: 今天/训练/分析/目标/我的. Single source of truth: `apps/web/shared/config/nav-config.ts`.
- **Today page**: Dashboard-merged status bar (readiness ring + PMC CTL/ATL/TSB/ACWR chips, see `apps/web/features/today/components/TodayHero.tsx` and `apps/web/features/pmc/components/PmcChipRow.tsx`)
- **Data hooks**: all data hooks use SWR (`useSWR`). Mutation hooks (useIntegrations, useStrengthWorkout) use `apiFetch` for mutations + `mutate()` for cache invalidation. Global `revalidateOnFocus: false`.
- **Auth**: cookie-based (HttpOnly, SameSite=lax), middleware at `apps/web/middleware.ts` checks `access_token`
- **Design system**: `apps/web/DESIGN.md` is normative and machine-checked. Tokens and the cinematic shell live in `apps/web/app/globals.css` (`.shell-atmosphere` / orbs / horizon / grain, chrome-only `.glass-surface`). Dark single theme with accent `#caf300` (oklch(0.9 0.19 122)), sunken canvas `oklch(0.16 0.012 250)`, content column `42rem`. **AppShell is the fixed mobile/desktop layout framework** (`--shell-content-max`, `.shell-main`, `.page-stack`); pages do not re-declare max-width/safe-area/tab padding. `scripts/check_design_tokens.py` fails the gate when DESIGN.md disagrees with the stylesheet; `scripts/check_web_tokens.py` fails it on panel glass, off-scale radii, raw palette colours and Chinese at `text-caption2`. `apps/web/scripts/hex-ban.test.ts` bans raw hex.
- **Strength training**: exercise library (`exercise_library` table) is read-only; workout CRUD via `/api/strength/*` endpoints; physiology auto-calculation via `POST /api/athletes/me/auto-calculate`
- **Physiology estimation**: `apps/api/src/domain/physiology/` contains pure-Python algorithms (tangent method KDE for HRmax, best-effort window for LTHR, critical speed model for threshold pace). No numpy/scipy dependency.

## Sport label registry

Single source of truth: `apps/web/shared/config/sport-config.ts`. Key mappings:

| Key | Label |
|---|---|
| Run | 跑步 |
| VirtualRun | 室内跑步 |
| TrailRun | 越野跑 |
| Ride | 骑行 |
| VirtualRide | 室内骑行 |
| Bike | 骑行 (backend alias) |
| Workout | 健身 |
| unknown | 其他运动 |

Never create duplicate `SPORT_LABEL` maps elsewhere. Always `import { getSportConfig } from "@shared/config/sport-config"`.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `apps/api/.env` | PostgreSQL connection |
| `JWT_SECRET` | `apps/api/.env` | Token signing and stored integration credential encryption (min 32 bytes, required) |
| `WEBHOOK_SECRET` | `apps/api/.env` | Shared secret the Intervals.icu webhook must echo (min 16 bytes, required) |
| `API_URL` | `apps/web/.env` | Server-side rewrite target for `/api/*` (default `http://127.0.0.1:31001`) |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env` | Legacy fallback, used only when `API_URL` is unset |
| `TEST_DATABASE_URL` | shell env (optional) | Overrides the derived `wind_runner_test` DSN for pytest / `run_gates.py` |

## Common tasks

```bash
# Deploy: one step, build + swap + restart + asset verification
scripts/deploy-web.sh

systemctl --user status  running-man-api.service running-man-web.service
systemctl --user restart running-man-api.service  # restart without rebuild
journalctl --user -u running-man-api.service -f   # tail logs

# Sync Intervals.icu data
curl -X POST http://localhost:31001/api/integrations/intervals_icu/sync -b "access_token=<token>"

# Full quality gates (web eslint/tsc/vitest, api ruff/mypy/openapi/pytest,
# contract registries, browser smoke tier — run in parallel, memoised by
# content hash):
python3 scripts/run_gates.py            # default: fast groups + browser smoke
python3 scripts/run_gates.py web        # one fast group
python3 scripts/run_gates.py e2e        # next build + @smoke browser subset
python3 scripts/run_gates.py e2e-full   # next build + every browser test
python3 scripts/run_gates.py --no-cache # re-run every gate and refresh stored passes
# Stored passes live in .gate-cache/ (gitignored); delete it to forget them.
```
