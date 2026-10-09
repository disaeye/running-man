# Clean code

## AI slop defense checklist

1. Generic names: reject `data`, `result`, `manager`, `handler` when a domain
   noun exists.
2. Dead code: remove unused branches, imports, flags, and old compatibility
   shims.
3. Over-abstraction: do not introduce factories, registries, or base classes for
   one implementation.
4. Comment noise: keep comments for rationale, invariants, and SQL risk only.
5. Variant chains: replace long `if/elif` mode ladders with typed maps or small
   functions only when variants are real.
6. Unsafe defaults: require explicit env vars for secrets, DSNs, and API keys.
7. Silent failures: raise or return typed errors; never swallow HTTP or DB errors.
8. Mixed layers: keep HTTP and SQL out of domain modules.
9. Oversized modules: split files before they become dumping grounds.
10. Test theater: tests must assert behavior and failure modes, not only imports.

## Size gates

| Unit | Limit |
|---|---:|
| File | 250 LOC excluding blanks/comments, except `__init__.py` |
| Function | 30 lines |
| Cyclomatic complexity | `< 10` |
| Public methods per class | 5 |
| Python line length | 100 chars |

Small task-specific scripts in `scripts/` should stay below 100 LOC when their
scope is one query, one API reconciliation, or one operational check.

## Import and dependency rules

- Python project imports are absolute.
- TypeScript imports use `@shared/*` and `@features/*` path aliases (see `tsconfig.json`); the legacy `@/*` alias is discouraged for new code.
- Domain modules must not import FastAPI, psycopg, httpx, or settings.
- Runtime database access uses psycopg; SQLAlchemy is for models/migrations.

## CI commands

```bash
# Backend
cd apps/api
ruff check .
mypy src tests
pytest

# Frontend
cd apps/web
npm run lint
npm run test
npm run build

# Repository hygiene
python scripts/lint_file_size.py
python scripts/bench_pmc.py
```

## Review gate

Before merge: tests pass, file-size lint passes, no stale docs, no secrets in
diff, and all changed docs describe current code rather than intended code.
