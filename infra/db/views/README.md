# Database Views And Maintenance

Authoritative DDL for materialized views, archive tables, partition functions,
and pg_cron cleanup now lives in Alembic:

- `apps/api/alembic/versions/b7c8d9e0f1a2_centralize_database_maintenance.py`

Systemd user timers invoke `scripts/maintain_database.py` for recurring
maintenance. Do not add standalone SQL files here as a second schema source.
