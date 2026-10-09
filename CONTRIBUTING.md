# Contributing

## Iron Rules

### 1. UTC TIMESTAMPTZ — non-negotiable

All timestamps **must** be stored as `TIMESTAMPTZ` (TIMESTAMP WITH TIME ZONE) in UTC.
Never use local time, `TIMESTAMP WITHOUT TIME ZONE`, or Unix integers.

### 2. Clean code

| Rule | Constraint |
|---|---|
| File size | ≤ 250 LOC (excluding blanks/comments, excluding `__init__.py`) |
| Function size | ≤ 30 lines |
| Complexity | `cyclomatic_complexity < 10` |
| No AI slop | No generic names (`data`, `result`, `manager`, `handler`), no excessive comments, no dead code, no over-engineering |

### 3. TDD

Write a failing test **first**, then implement. Every PR must include tests.

### 4. Imports

- Python: absolute imports only
- TypeScript: use `@shared/*` and `@features/*` path aliases (see `tsconfig.json`); legacy `@/*` is discouraged

### 5. Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.
