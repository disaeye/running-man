# Data Semantics Contract Schema v1

`contracts/v1` is the only machine-readable vocabulary for persisted source data,
stream samples, derived metric facts, and their presentation metadata. All canonical
keys are lower snake case. Adapter-only aliases are parsed at ingestion and must not
be stored or exposed as canonical keys.

Each YAML file has `version: 1` and a top-level collection named after the file.

| File | Collection | Required entry fields |
| --- | --- | --- |
| `sources.yaml` | `sources` | `key`, `display_name`, `aliases`, `adapter_only_aliases`, `input_metrics` |
| `sports.yaml` | `sports` | `key`, `display_name`, `aliases`, `family` |
| `stream-metrics.yaml` | `stream_metrics` | `key`, `storage_unit`, `display_unit`, `null_semantics`, `legal_range.minimum`, `legal_range.maximum`, `adapter_only_aliases` |
| `metrics.yaml` | `metrics` | `key`, `display_name`, `classification`, `category`, `storage_unit`, `display_unit`, `null_semantics`, `legal_range.minimum`, `legal_range.maximum`, `materialization`, `ui_precision` |
| `algorithms.yaml` | `algorithms` | `key`, `version`, positive `input_window_days`, `materialization`, `outputs` |
| `readiness-bands.yaml` | `readiness_bands` | `min_score`, `level`, `label`, `max_intensity`, `color`, `recommendation` |

`classification: source_input` is an opaque provider value. `classification:
local_computation` is produced by Running Man. `materialization: source_input` keeps
the provider value separate from local facts; `stored_fact` is historical, versioned
output; `on_the_fly` is reproducible but deliberately not persisted. `null_semantics`
must state why a value is absent, never merely `null`.

`storage_unit` is the canonical persisted/transport unit. `display_unit` and
`ui_precision` control presentation only. Legal ranges are inclusive. Algorithm
windows are product parameters: changing a window requires a corresponding algorithm
version bump. PMC has `history_policy: full_available_history`; its positive window
field exists for the calculation trigger, not as a truncation rule.

### Optional metric fields

`category` classifies metrics along a semantic dimension orthogonal to `classification`:
`volume`, `load`, `load_balance`, `recovery`, `wellness_input`, `ability`, `body`,
`intensity`, or `environment`. This drives front-end grouping and metric selection.

`zones` (optional, list of `{ min?, max?, label, tone, description }`) defines
ordered semantic ranges for display. Zones must be contiguous and monotonically
increasing. `tone` is one of `safe`, `caution`, `danger`, `neutral`. Both front-end
and back-end read zones from the generated registry—never hardcode thresholds.

`source` (optional, `{ table, column, aggregation }`) declares how a wide-table
column maps into the EAV fact stream. `table` is `activity_summary` or
`health_wellness`. `aggregation` is `sum`, `avg`, `latest`, or `max`. The
`get_athlete_daily_facts()` SQL function reads these declarations to project wide
columns into EAV rows dynamically—no hardcoded `LATERAL VALUES`.

`note` (optional, string) provides scientific annotation shown in tooltips.

### Readiness bands

`readiness-bands.yaml` defines the score-to-level mapping for the local readiness
score (`local_readiness`). Bands are ordered by descending `min_score`. Each band
specifies a `level` (`high`, `moderate`, `recovery`, `rest`), display `label`,
`max_intensity` for training recommendations, semantic `color` (`good`, `moderate`,
`poor`), and a human-readable `recommendation`. Both front-end and back-end consume
the generated registry to ensure threshold consistency.
Run `python scripts/validate_data_contract.py contracts/v1 --json` to validate this
schema and the authoritative twelve-key stream set extracted from
`infra/db/omh_mapping.md`.
