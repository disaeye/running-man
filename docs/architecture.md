# Architecture

## Layered backend

```
+--------------------------------------------------+
| presentation                                      |
| FastAPI routers, auth dependencies, Pydantic IO   |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
| application                                      |
| use cases: recompute load, calendar, auth flows   |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
| domain                                           |
| pure rules: TSS, normalized power, PMC, ACWR, FTP |
+------------------------+-------------------------+
                         |
+------------------------v-------------------------+
| infrastructure                                   |
| psycopg repos, Intervals.icu clients, SQL schema  |
+--------------------------------------------------+
```

Rules:
- Domain has no database, HTTP, or framework dependency.
- Application coordinates domain functions and repository ports.
- Infrastructure owns SQL and external API details.
- Presentation converts HTTP/auth concerns into application calls.

## Data flow

```
Intervals.icu activities/wellness
        |
        v
backfill / webhook / import / Strava sync
        |
        v
activity_summary + activity_streams + health_wellness   ← 原始输入(源列只存原始值)
        |
        v
application.load.recompute()  (pmc_facts / activity_metric_facts)
        |
        v
derived_metric_facts  ← 唯一派生事实表(版本化,带 lineage)
        |
        +--> current_activity_facts / current_daily_facts 视图
        |         |
        |         +--> get_athlete_daily_facts / get_athlete_weekly_facts
        |         |        (聚合引擎:源输入指标 + 事实 + 健康,运动员本地日分桶)
        |         |
        +--> GET /api/v1/pmc?from=&to= --> Next.js PMC chart
        |
        +--> GET /api/v1/insights/readiness --> Today page
        |
        +--> POST /api/v1/athletes/me/auto-calculate --> Physiology estimation
        |
        +--> scripts/bench_pmc.py and reconcile_intervals_icu.py
```

**数据链契约(v9 收敛后,单一读路径)**:派生值只存在于 `derived_metric_facts`;`activity_summary` 源列只保留原始输入(如 `icu_ctl`、`source_training_load`);`current_*` 视图与 `get_athlete_*_facts` 函数是同一事实层的两种读法(视图=物化投影,函数=按运动员本地日分桶的聚合引擎),二者共享同一 `metric_key/unit` 注册表(`contracts/v1` 生成)。禁止在源列上新增派生值列。

## Persistence

Primary database is PostgreSQL/Supabase. SQLAlchemy models exist for Alembic
autogenerate, but runtime reads and writes use hand-written psycopg SQL.

Important tables:

| Table | Purpose |
|---|---|
| `athletes` | Auth identity and profile fields |
| `activity_summary` | Per-activity summary, TSS, IF, sport metadata |
| `activity_streams` | Time-series samples by activity |
| `health_wellness` | Daily wellness and Intervals.icu CTL reference |
| `training_calendar` | Planned workouts and events |
| `ftp_history` | FTP effective-date lookup |
| `derived_metric_facts` | 唯一派生事实表(TSS/CTL/ATL/TSB/ACWR 等,版本化带 lineage) |
| `current_daily_facts` / `current_activity_facts` | 事实投影视图,PMC/洞察统一读路径 |
| `webhook_events` | Idempotent external event ledger |
| `exercise_library` | Seeded strength exercises (20+ with Chinese names, muscle groups, instructions) |
| `workout_exercises` | Exercises within a strength training session (linked to `activity_summary`) |
| `workout_sets` | Individual sets: weight_kg, reps, rpe, estimated_1rm_kg |
| `goals` | Athlete goals (event/distance/time/consistency) |
| `milestones` | Goal milestones with target dates |
| `training_phases` | Training phase periods (base/build/peak/taper/recovery) |
| `user_integrations` | Data source connections (Intervals.icu, Strava) |
| `notifications` | User notification inbox |

## New API routes (v0)

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/athletes/me/physiology` | GET | Cached physiology snapshot (HRmax, LTHR, threshold pace) with 7-day staleness |
| `/api/v1/athletes/me/auto-calculate` | POST | Recalculate and persist physiology from activity data |

New `activity_summary` columns: `has_gps`, `has_hr`, `has_power`, `has_cadence` (BOOLEAN, default FALSE). These act as capability flags for data availability cards on the activity detail page. The schema automatically maps `None` → `False` via Pydantic field_validator.

A per-athlete GET response cache (5s TTL) sits in `middleware.py` as `GetResponseCacheMiddleware`. It caches successful GET responses scoped to `(app_id, path, query_string, access_token_subject)` and clears on any non-GET request or dependency override detection.
## Data health and quality flow

The settings data section reads two authenticated, versioned endpoints:

| Route | Method | Source of truth | Consumer |
|---|---|---|---|
| `/api/v1/data/health` | GET | `activity_summary`, `activity_streams`, `health_wellness`, `current_daily_facts`, athlete timezone | `useDataHealth` → sync status and health summary |
| `/api/v1/data/quality` | GET | the same coverage facts plus freshness rules in `application.data_quality` | `useDataQuality` → coverage meters and actionable issue list |

`data/health` executes its coverage queries in a fixed order and normalizes empty or
NULL aggregates to safe zero/empty values. `data/quality` reuses that health result
for coverage counts and runs rule checks in the same database connection, so the
frontend does not combine independently cached partial payloads. The frontend
validates both responses against generated Zod schemas, renders loading/error/empty
states explicitly, and invalidates both keys after a sync mutation.

## Technology stack

| Area | Technology | Notes |
|---|---|---|
| API | FastAPI, Pydantic | Authenticated JSON API on port 31001 |
| Domain | Python 3.12 | Pure functions for load math, physiology estimation |
| Physiology | Pure Python (stdlib only) | Tangent method KDE (HRmax), Dmax (LTHR), critical speed (threshold pace) |
| Database | PostgreSQL/Supabase | `TIMESTAMPTZ` for all timestamps |
| DB access | psycopg 3 | Raw SQL, dict rows in repos |
| Migrations | Alembic (Python) | Single authority in `apps/api/alembic/versions`; fresh-schema + lifecycle gates in `scripts/` |
| Web | Next.js 16, React 19 | App Router, production on port 31000 |
| Charts | ECharts, uPlot | ECharts for PMC/radar/donut; uPlot for activity multi-stream chart |
| Tests | pytest, Vitest, Playwright | Backend unit, frontend unit/component, E2E + visual baseline |
| Ops | shell + Python scripts | Backup, restore, archive, benchmark |

## Performance path

PMC reads query `current_daily_facts` by `(athlete_id, day)` and return ordered rows.
The supporting index is `idx_dl_athlete_day (athlete_id, day DESC)`. The
benchmark contract is `python scripts/bench_pmc.py` with P99 below 2000 ms.

## Frontend structure

The Next.js app (`apps/web/`) is organized by **feature**, not by technical layer:

```
app/          Next.js App Router — route files only (thin page.tsx assembly)
features/     One directory per feature, each with colocated components/ + hooks/ + lib/
              pmc, today, activity, analysis, health, goals, strength, calendar,
              plan, performance, trends, data, settings, auth
shared/       Cross-feature primitives depended on BY features/, never the reverse
              ui (shadcn/ui), layout, lib, types, config, hooks, marketing
```

Path aliases (`tsconfig.json`): `@shared/*` → `./shared/*`, `@features/*` → `./features/*`.

Rules: `features/` depends on `shared/`, never the reverse. `app/` route files are thin assembly — they import from `features/` and compose, never contain feature logic. Tests are colocated with source.
