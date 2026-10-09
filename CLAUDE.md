# CLAUDE.md — AI Agent Guide

> This file gives any AI agent the context needed to work effectively in this project.
> For human-facing docs, see [README.md](README.md) and [docs/](docs/).

## Public access topology (verified 2026-08-20)

**Do NOT trust older notes below; this section is the current truth.**

```
Browser
   │
   ▼
https://running-man-ten.vercel.app     ← FRONTEND: Vercel (Next.js), production, online
   │   rewrite /api/*, /auth/*, /webhooks/* → API_URL (server-side, same-origin)
   ▼
https://running-man.mysour.world       ← vercel.json sets API_URL to this domain
   │   Tencent EdgeOne CDN (CNAME 3q3yezggb34a.mysour.world.eo.dnse0.com)
   ▼
openresty :80/:443 on this NAS        ← edge returns 404 for non-API paths (API-only origin)
   │   proxy_pass (config inside container, NOT visible on host)
   ▼
uvicorn :18000 (running-man-api.service)  ← FastAPI backend, /health /docs live
   ▼
PostgreSQL
```

Key facts (topology verified via `vercel` CLI / curl on 2026-08-20; git state verified 2026-09-01):

- **There is NO git remote**: the repository exists only on this NAS. `.github/workflows/ci.yml` is the gate manifest, not running automation — GitHub Actions never executes without pushing to GitHub. Run the same gates locally: `python3 scripts/run_gates.py` (`--fast` skips next build; pytest self-skips unless the 15434 test DB is up).
- **Frontend deploys to Vercel**: project `disaeyes/running-man` (team `disaeyes`, projectId `prj_wADGHlc5XOAn7jIBi52Uz7GkcD25`). Production aliases: `running-man-ten.vercel.app`, `running-man-disaeyes.vercel.app`, `running-man-disaeye-disaeyes.vercel.app`. Deploy via `vercel` CLI (installed at `~/.nvm/.../vercel`, authed as `disaeye`).
- **`running-man.mysour.world` is the API-only domain** (EdgeOne → this host). `/` returns 404 by design — no frontend there. API endpoints `/health`, `/docs` return 200.
- **Reaching vercel.app from this host requires the proxy** (`HTTP_PROXY=http://127.0.0.1:7890`); `curl --noproxy '*'` to vercel.app times out — do not mistake that for the site being down.
- The `running-man-web.service` systemd unit (port 28801) is **retired/not part of the live path** — do not restart it expecting to fix the public site.

## Project: Running Man

Personal running/fitness platform: activity import (Intervals.icu/Strava), training load (PMC), recovery insights, calendar planning, goals, strength training, and physiology estimation (HRmax/LTHR/threshold pace).

- **Backend**: FastAPI (Python 3.12+) at `apps/api/`, runs on port 18000
- **Frontend**: Next.js 16 (React, TypeScript) at `apps/web/`, production on port 28801
- **Database**: PostgreSQL with partitioned tables
- **CDN**: Tencent EdgeOne → origin (NAS), domain `running-man.mysour.world`

## Critical deployment rule

**Production frontend lives on Vercel (`running-man-ten.vercel.app`), NOT on this host.** Deploy it with the `vercel` CLI from `apps/web/`. See "Public access topology" at the top of this file — the systemd `running-man-web.service` unit (port 28801) below is **retired** and not part of the live path; do not restart it expecting to fix the public site.

> Historical note (pre-Vercel cutover): the frontend ran under systemd as `running-man-web.service` on port 28801. `next dev` behind a CDN caused silent React hydration failure (WebSocket HMR cannot be proxied), so production had to use `next start`. `scripts/deploy-web.sh` performed build + atomic systemd restart. This is kept for context only — the live frontend is Vercel, and `running-man-web.service` is currently `failed`/disabled without affecting the site.

### Killing local Next.js servers: by port, never by name

**Never run `pkill -f "next-server"` or `pkill -f "next start"`.** `pkill -f` matches every process on the host whose full command line contains the pattern, and all Next.js servers share the identical `next-server (v16.3.1)` cmdline regardless of project or port. This has already taken down the local **pi-web** UI (port 30141), which exits with `Next.js exited unexpectedly (signal SIGKILL)`.

To restart a local `next start` for e2e/manual QA, kill the port instead:

```bash
cd apps/web
npm run qa:kill-port -- 28801                      # SIGTERM, then SIGKILL after 5s
node scripts/kill-port.mjs 28801 --timeout 2000    # custom escalation window
```

`scripts/kill-port.mjs` resolves the PID via `fuser -n tcp <port>`, so it only ever touches the process holding that exact port. For the systemd unit, prefer `systemctl --user restart running-man-web.service`, which signals only that unit's cgroup.

## Architecture

```
Browser → running-man-ten.vercel.app (Next.js on Vercel)
               │ rewrite /api/*, /auth/*, /webhooks/* (server-side, API_URL)
               ▼
running-man.mysour.world (Tencent EdgeOne) → openresty → uvicorn :18000 (FastAPI) → PostgreSQL
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
    layout/            # AppShell, PageHeader, Sidebar, TopTabBar
    lib/               # format, api, auth, swr, utils, chart-tokens, motion
    types/             # TypeScript type definitions
    config/            # sport-config, nav-config, terms
    hooks/             # useChartConfig, useECharts (infra hooks)
    marketing/         # Landing page components
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
- **Navigation**: PC editorial sidebar (`apps/web/shared/layout/Sidebar.tsx`) with 5 pill entries: 今天/训练/分析/目标/设置. Mobile bottom tab bar (`apps/web/shared/layout/TopTabBar.tsx` MobileTabBar export) matches the same 5 tabs. Single source of truth: `apps/web/shared/config/nav-config.ts`.
- **Today page**: Dashboard-merged status bar (readiness ring + PMC CTL/ATL/TSB/ACWR chips, see `apps/web/features/today/components/TodayHero.tsx` and `apps/web/features/pmc/components/PmcChipRow.tsx`)
- **Data hooks**: all data hooks use SWR (`useSWR`). Mutation hooks (useIntegrations, useStrengthWorkout) use `apiFetch` for mutations + `mutate()` for cache invalidation. Global `revalidateOnFocus: false`.
- **Auth**: cookie-based (HttpOnly, SameSite=lax), middleware at `apps/web/middleware.ts` checks `access_token`
- **Design system (v8.5)**: 5cm Quiet Winter at `apps/web/DESIGN.md`. Tokens + cinematic shell in `apps/web/app/globals.css` (`.shell-atmosphere` / orbs / horizon / grain, sky-rim `.glass-surface`). Winter Sky Indigo `#5a6f9a`, overcast paper `#eef2f6`. **AppShell is the fixed PC/mobile layout framework** (`--shell-content-max`, `.shell-main`, `.page-stack`); pages do not re-declare max-width/safe-area/tab padding. Chart data colors unchanged. Raw-hex tokens outside `globals.css` are banned by `apps/web/scripts/hex-ban.test.ts`.
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
| `JWT_SECRET` | `apps/api/.env` | Token signing |
| `INTERVALS_ICU_API_KEY` | `apps/api/.env` | Intervals.icu sync |
| `INTERVALS_ICU_ATHLETE_ID` | `apps/api/.env` | Intervals.icu athlete |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env` | Backend URL (default `http://localhost:18000`) |

## Common tasks

```bash
# Deploy frontend (Vercel — live site: running-man-ten.vercel.app)
cd apps/web && vercel --prod
# Preview: vercel        (and check aliases with: vercel ls running-man)
# NOTE: vercel CLI from this host needs the HTTP proxy (127.0.0.1:7890).

# Backend stays on this host under systemd:
systemctl --user status running-man-api.service   # check health
systemctl --user restart running-man-api.service  # restart without rebuild
journalctl --user -u running-man-api.service -f   # tail logs

# Sync Intervals.icu data
curl -X POST http://localhost:18000/api/integrations/intervals_icu/sync -b "access_token=<token>"

# Full quality gates (the one command — web lint/typecheck/test/build,
# api ruff/mypy/openapi, contract registries):
python3 scripts/run_gates.py            # everything
python3 scripts/run_gates.py --fast     # skip next build
python3 scripts/run_gates.py web        # one group
```
