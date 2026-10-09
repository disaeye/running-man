# Database Schema Authority

Alembic is the only authoritative schema source for tables, views, functions,
extensions, constraints, indexes, and retained maintenance objects.

Do not add standalone SQL files here. Use forward revisions under
`apps/api/alembic/versions/` and verify a fresh disposable database with
`scripts/verify_fresh_schema.sh`.
