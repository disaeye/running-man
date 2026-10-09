# Operations

## Required environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL/Supabase connection string |
| `TEST_DATABASE_URL` | Restore target used by `restore.sh` |
| `BACKUP_AGE_RECIPIENTS_FILE` | 0600 file containing public age recipients for off-host backup encryption |
| `BACKUP_AGE_IDENTITY_FILE` | 0600 runtime-only private age identity file used for restore decrypts |
| `RCLONE_CONFIG` | 0600 rclone config file for the backup remote |
| `RCLONE_REMOTE` | Remote path prefix for encrypted backup ciphertext and manifests |
| `INTERVALS_ICU_API_KEY` | Basic auth password for Intervals.icu API |
| `INTERVALS_ICU_ATHLETE_ID` | Intervals.icu athlete id for reconciliation |
| `JWT_SECRET` | API token signing secret |

Load application values from `apps/api/.env`. Keep backup encryption and rclone
secrets in runtime-only files, not in the repo, not in `.env`, and not in normal
app service environments.

## Backup

```bash
export DATABASE_URL='postgresql://...'
./scripts/backup.sh
```

The script writes `backups/backup_<timestamp>.sql` using `pg_dump`. Keep at
least one recent off-host copy before running migrations or bulk imports.

Encrypted off-host backups use `age` major version 1 and `rclone` major version
1 or 3. The current production NAS has `rclone v3.67.5-DEV`; test fixtures
exercise the same command contract. Configure a public-recipient file and rclone
remote, then run:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_AGE_RECIPIENTS_FILE='/run/secrets/running-man/backup-age-recipients.txt'
export RCLONE_CONFIG='/run/secrets/running-man/rclone.conf'
export RCLONE_REMOTE='remote:running-man/backups'
./scripts/backup.sh --encrypted-offsite
```

`BACKUP_AGE_RECIPIENTS_FILE` and `RCLONE_CONFIG` must be regular files with
mode `0600`. `backup.sh --encrypted-offsite` creates a private `mktemp`
directory, writes the plaintext dump only there, encrypts it with age, deletes
the plaintext before upload, uploads only ciphertext plus manifest, verifies the
remote ciphertext size and SHA-256 with rclone, and removes temp files on
success, failure, or SIGINT. The manifest contains only ciphertext remote path,
ciphertext SHA-256, ciphertext size, schema revision, timestamp, and format; it
must never contain database URLs, credentials, age identities, or plaintext dump
paths.

## Restore drill

```bash
export TEST_DATABASE_URL='postgresql://user:pw@127.0.0.1:5432/test_running_man'
./scripts/restore.sh backups/<file>.sql
python scripts/verify_restore.py "$DATABASE_URL" "$TEST_DATABASE_URL"
```

Encrypted restore drills download the manifest and ciphertext, verify the
ciphertext hash and size before decrypting, decrypt only with a runtime private
identity file, restore into the disposable `TEST_DATABASE_URL`, then run schema
lifecycle verification against the manifest revision:

```bash
export TEST_DATABASE_URL='postgresql://user:pw@127.0.0.1:5432/todo12_restore_schema'
export BACKUP_AGE_IDENTITY_FILE='/run/secrets/running-man/backup-age-identity.txt'
export RCLONE_CONFIG='/run/secrets/running-man/rclone.conf'
./scripts/restore.sh --encrypted-offsite 'remote:running-man/backups/<file>.manifest.json'
python scripts/verify_restore.py "$DATABASE_URL" "$TEST_DATABASE_URL"
```

`BACKUP_AGE_IDENTITY_FILE` and `RCLONE_CONFIG` must be `0600`. The private age
identity is supplied at restore runtime only; never store it in the repo, `.env`,
or a normal app process environment. `verify_restore.py` compares row counts for
core tables. `scripts/verify_schema_lifecycle.py` additionally checks Alembic
head, metadata parity, seed definition rows, and retained SQL functions. A
mismatch in either verifier blocks promotion of the backup.

Fresh-schema lifecycle drill:

```bash
uv run --project apps/api python scripts/verify_schema_lifecycle.py \
  --create-fresh \
  --admin-database-url 'postgresql://user:pw@127.0.0.1:5432/postgres' \
  --database-name todo12_schema_lifecycle \
  --exercise-reversibility \
  --json
```

The `--create-fresh` database name must begin with `rm_`, `todo12_`, or `test_`
and include `schema`, so the verifier cannot target the audit or production DB
by accident.

## Load maintenance

```bash
python apps/api/scripts/recompute_load.py <athlete-uuid>
python scripts/reconcile_intervals_icu.py --athlete-id <uuid> --days 90
python scripts/bench_pmc.py
```

Recompute updates `derived_metric_facts` (projected via `current_daily_facts`). Reconciliation compares local CTL/ATL/TSB
against Intervals.icu `/athlete/{id}/fitness`. PMC benchmark must keep P99 below
2000 ms for the June range.

## Database maintenance

Alembic owns retained database DDL: extensions, partitioned parents,
materialized views, the archive table, and the `create_future_partitions`
helper. The legacy SQL files under `infra/db/views/` are intentionally retired
so schema drift cannot bypass migrations.

Recurring database maintenance is owned by `systemd --user` timers, not
`pg_cron`. Production does not require the `pg_cron` extension; cleanup no-ops
when the extension or jobs are absent.

```bash
uv --project apps/api run python scripts/maintain_database.py partitions --database-url "$TEST_DATABASE_URL" --months-ahead 24 --json
uv --project apps/api run python scripts/maintain_database.py partition-hash --database-url "$TEST_DATABASE_URL" --months-ahead 24 --json
uv --project apps/api run python scripts/maintain_database.py stale-audit --database-url "$TEST_DATABASE_URL" --json
uv --project apps/api run python scripts/maintain_database.py cleanup-pg-cron --database-url "$TEST_DATABASE_URL" --json
```

The partition command creates monthly partitions for `health_wellness`,
`activity_summary`, and `activity_streams` at least 24 future months ahead.
It is idempotent: a second run reports `changes: 0` when all expected partition
children already exist. Use `--dry-run` before applying to a new database.

Checked-in user-systemd templates live in `infra/systemd/user/`:

| Unit | Schedule | Purpose |
|---|---|---|
| `running-man-sync.timer` | every 30 min | sync each athlete whose stored frequency says they are due |
| `running-man-stale-audit.timer` | daily | emit stale computation audit JSON |
| `running-man-db-partitions.timer` | monthly | create 24 future months of partitions |
| `running-man-e2e.service` | on demand | serve the frontend on 28801 for the Playwright gate |

Install by copying to `~/.config/systemd/user/`, then `systemctl --user
daemon-reload` and `systemctl --user enable --now` each timer plus
`running-man-e2e.service`.

Two constraints apply to every unit, both learned from units that silently did
nothing:

- **Use an absolute interpreter path**, as the templates do
  (`%h/workspace/code/running-man/apps/api/.venv/bin/python`). A bare `uv` or
  `python` is not on systemd's user `PATH`, so the unit exits 127 and the only
  symptom is an absent result — the stale audit reported nothing for months and
  the partition set stayed ahead of today only because it had been created by
  hand. `python` in particular is absent on this host; only `python3` exists.
- **WorkingDirectory must match the real path**, `%h/workspace/...`. The
  templates previously said `%h/Workspace/...`, which does not exist here, so
  copying them verbatim would have replaced one failure with another.

`running-man-e2e.service` is not a timer: it serves the built frontend on port
28801 so the Playwright gate has something to drive. The gate restarts it when
`next build` has rewritten `.next` underneath a running server.
Do not start uvicorn, Next.js, or any project port manually while installing
maintenance timers.

## Monitoring checks

| Check | Command | Expected |
|---|---|---|
| API health | `curl http://localhost:18000/health` | `{"status":"ok"}` |
| DB connectivity | `psql "$DATABASE_URL" -c 'select 1'` | one row |
| PMC data | `python scripts/bench_pmc.py` | P99 `< 2000ms` |
| Restore validity | `python scripts/verify_restore.py ...` plus schema lifecycle verifier | all `OK` and `ok: true` |
| Disk pressure | `./scripts/disk_alert.sh` | below threshold |

Investigate empty `current_daily_facts` (or missing `derived_metric_facts`)
before frontend chart issues; the web app reads API output derived from that
projection. The legacy `daily_load` table was removed — do not recreate it.
## Data health and quality smoke checks

The settings data page is only as trustworthy as its two source endpoints. After
an import or Intervals.icu sync, verify both responses for the authenticated user:

```bash
curl -i http://localhost:18000/api/v1/data/health -b "access_token=<token>"
curl -i http://localhost:18000/api/v1/data/quality -b "access_token=<token>"
```

Both responses must be `200`, include `X-API-Version: 1`, and expose numeric
coverage fields rather than `null`. A quality warning or error is an actionable
data condition, not a frontend rendering failure. Check `activity_summary`,
`activity_streams`, `health_wellness`, and `current_daily_facts` before debugging
the web page. The web component provides an explicit retry for a failed quality
request; a fresh sync invalidates both health and quality caches.

## Archive and recovery

```bash
python scripts/archive_old_streams.py --dry-run
python scripts/archive_old_streams.py --commit
python scripts/restore_archive.py --activity-id <id> --dry-run
python scripts/restore_archive.py --activity-id <id>
```

Run dry-run first. Archive copies rows, verifies counts, then deletes hot rows.
Restore moves selected activities back from `activity_summary_archive`.

## Frontend deployment

### Production vs development server

**Production must use `next start`, never `next dev`.**

| Mode | Command | WebSocket HMR | CDN compatible |
|---|---|---|---|
| Development | `npm run dev` (`next dev`) | Required for hot reload | **NO** — CDN returns 404 for `wss://`, blocking React hydration |
| Production | `npm run start` (`next start`) | Not used | **YES** — pure HTTP, no WebSocket dependency |

**The bug**: `next dev` behind a CDN (EdgeOne, Cloudflare, etc.) causes React hydration to silently fail. The page renders server-side HTML (form is visible), but client-side JavaScript never attaches. The login form's `onSubmit` handler is never bound, so clicking "Sign in" triggers the browser's default GET form submission instead of the JavaScript POST to `/api/v1/auth/login`. The credentials leak into the URL query string (`/login?email=...&password=...`), no auth cookie is set, and the middleware redirects back to `/login` — infinite loop.

### How to deploy (Vercel-managed)

The production frontend lives on **Vercel** at `https://running-man-ten.vercel.app` (project `disaeyes/running-man`). It is NOT hosted on this machine. Deploy from `apps/web/` with the vercel CLI (authed as `disaeye`; reachable via the local HTTP proxy `127.0.0.1:7890`):

```bash
cd apps/web
vercel --prod        # deploy to production
vercel ls running-man   # list deployments and aliases
```

The Vercel build reads `vercel.json` (framework `nextjs`, `API_URL=https://running-man.mysour.world`) — the backend is reached via server-side rewrites in `next.config.js`, so the browser only ever sees the Vercel domain.

> Historical note: the frontend previously ran under systemd as `running-man-web.service` on port 28801 (`scripts/deploy-web.sh`). That unit is retired — do not start it, do not deploy via `deploy-web.sh`. Keeping `next start` on 28801 is irrelevant to the live site.

### Never kill Next.js by process name

When you need to restart a local `next start` (e2e, manual QA, rebuild), **kill by port, never by name**:

```bash
cd apps/web
npm run qa:kill-port -- 28801     # SIGTERM, escalates to SIGKILL after 5s
node scripts/kill-port.mjs 28801 --signal SIGKILL --timeout 2000
```

**Do not use `pkill -f "next-server"` or `pkill -f "next start"`.** `pkill -f` matches the full command line of *every* process on the host, and every Next.js server reports the identical `next-server (v16.3.1)` cmdline — regardless of project or port. Those patterns take down unrelated servers, including the local **pi-web** UI on port 30141, which then exits with `Next.js exited unexpectedly (signal SIGKILL)`.

A port is the only unique handle for a listening server, which is why `kill-port.mjs` resolves the PID via `fuser -n tcp <port>` instead of a name pattern. For the systemd-managed `running-man-web.service`, prefer `systemctl --user restart` — it scopes the signal to the unit's own cgroup.

### Production environment variables

| Variable | Scope | Purpose | Example |
|---|---|---|---|
| `API_URL` | Server only (Vercel) | Backend base URL used by `next.config.js` rewrites. Reached via server-side rewrite, so the browser stays same-origin and the backend address is **not** leaked to the client bundle. | `https://running-man.mysour.world` |
| `NEXT_PUBLIC_API_URL` | Server only (legacy) | Fallback for the retired systemd deployment's `.env`. Prefer `API_URL`. | `http://localhost:18000` |

`API_URL` is set in `apps/web/vercel.json` and must be reachable from Vercel's build/edge network, **not** from the end-user's browser.

### Auth cookie notes

- Backend sets `access_token` and `refresh_token` as `HttpOnly; SameSite=lax; Path=/` cookies
- `secure=False` in current config — acceptable when TLS is terminated at the edge (Vercel, EdgeOne) and forwarded to origin over HTTP
- Under the Vercel same-origin rewrite topology, the browser only sees the Vercel domain, so `SameSite=lax` cookies flow normally; the backend need not enable CORS
- Next.js `middleware.ts` checks `access_token` cookie; missing → redirect to `/login`
- `middleware.ts` matcher excludes `/api/*`, `/auth/*`, `/webhooks/*`, `/_next/*` — API/auth endpoints bypass the middleware

## Strength training

### Exercise library

The `exercise_library` table is seeded with 20+ exercises via Alembic migration.
It is read-only through the API — no POST/PUT/DELETE on exercise_library.

### Physiology estimation

`POST /api/v1/athletes/me/auto-calculate` runs three algorithms and persists results to the `athletes` table (`hr_max`, `lthr`, `threshold_pace`, `physiology_updated_at`):

| Metric | Method | Data requirement |
|---|---|---|
| HRmax | Tangent method (KDE density estimate) | ≥30 activities with HR; fallback to rolling max with ≥5 |
| LTHR | Best-effort window (98% of best 20-min HR vs best 60-min HR) | ≥5 hard efforts with HR streams |
| Threshold pace | Critical speed model (linear regression on distance-time) | ≥4 running activities with distance >1000m |

All algorithms are pure Python (no numpy/scipy). Returns `data_sufficient: false` when data is insufficient.

`GET /api/v1/athletes/me/physiology` returns the cached physiology snapshot. Results are considered stale after 7 days. When stale or absent, the endpoint returns `data_sufficient: false` / `confidence: "stale"` and the frontend shows empty states rather than stale numbers.

## Security hardening

- Rotate `JWT_SECRET` and Intervals.icu credentials after exposure.
- Use least-privilege database users for app runtime and backup jobs.
- Keep Supabase connection strings out of shell history and logs.
- Enforce HTTPS at the edge; do not send bearer tokens over HTTP in production.
- Keep webhook ingestion idempotent via `webhook_events.event_key`.
- Review row-level access before exposing multi-athlete endpoints.
- Never restore production dumps into shared developer databases without consent.
