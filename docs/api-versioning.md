# API Versioning

## Current version

**Version: `1`**

Application JSON and authentication endpoints are served only under
`/api/v1/*`, for example `/api/v1/athletes/me` and `/api/v1/auth/login`.
Intervals.icu sends events only to `/webhooks/v1/intervals`. `/health` remains
unversioned. Every response carries `X-API-Version: 1`.

## Philosophy

The API follows an **additive-only** compatibility policy within a version:

- New endpoints, fields, and parameters may be added at any time.
- Existing fields and responses are never removed or renamed.
- Optional request parameters may be added; existing required parameters
  remain required.
- Response JSON may gain new keys; consumers **must ignore unknown keys**.

## Breaking changes

A change is **breaking** when it removes, renames, or changes the semantics
of an existing field or endpoint.

### Process

1. **New boundary** — Introduce the next major boundary under `/api/vN` and,
   where needed, `/webhooks/vN`.
2. **Version bump** — Set the FastAPI/OpenAPI version and `X-API-Version`
   header to the matching major version.
3. **Migration plan** — Publish migration guidance before deploying a breaking
   path change. The server does not retain undeclared legacy aliases.

### URI path versioning

Versioned URI paths are the public boundary. Flat draft paths such as
`/api/pmc`, `/api/insights/readiness`, `/auth/login`, and
`/webhooks/intervals` are not aliases and return 404. Unsupported webhook
versions, such as `/webhooks/v2/intervals`, also return 404.

## Consumers

All clients (frontend, scripts, third-party integrations) **SHOULD**:

1. Inspect the `X-API-Version` response header.
2. Log a warning if the version is unexpected.
3. Fail gracefully if the version is unknown.

Clients **MUST NOT**:

- Hard-code assumptions about response shape without ignoring unknown keys.
- Rely on undocumented or deprecated fields.
- Send an `Accept-Version` request header (not supported).

## Version history

| Version | Notes |
|---------|-------|
| 1       | Initial formal `/api/v1` and `/webhooks/v1` boundary. |
