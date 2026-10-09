# OMH / Activity Schema Mapping

Running Man stores high-frequency activity samples in `activity_streams` as one row per `(sample_time, activity_id, metric_type)` value. Source adapters normalize vendor-specific stream names into the `metric_type` values below before persistence.

All timestamps are UTC `TIMESTAMPTZ`. Units are stored as canonical SI or training-domain units to keep calculations deterministic.

## `activity_streams.metric_type` mappings

| metric_type | OMH schema / activity concept | Stored unit | Source examples | Notes |
|---|---|---:|---|---|
| `heart_rate` | `heart-rate-1.1` | beats/min | Intervals `heartrate`, FIT heart_rate, TCX HeartRateBpm | Instantaneous heart rate sample. |
| `power` | Activity power | watts | Intervals `watts`, FIT power, TCX TPX Watts | Used for NP/TSS when present. |
| `speed` | Activity speed | m/s | Intervals `velocity_smooth`, FIT speed, GPX derived speed | Prefer smoothed API speed where available. |
| `cadence` | Activity cadence | rpm | Intervals `cadence`, FIT cadence, TCX RunCadence | Running steps/min or cycling rpm as supplied by source. |
| `distance` | Activity distance | meters | Intervals `distance`, FIT distance | Cumulative distance from activity start. |
| `altitude` | Activity elevation | meters | Intervals `altitude`, FIT altitude, GPX elevation | Also copied to `alt` when paired with location. |
| `grade` | Activity grade | percent | Intervals `grade_smooth`, derived elevation/distance | Optional derived climbing metric. |
| `temperature` | Body/ambient temperature concept | °C | FIT temperature | Ambient unless source explicitly identifies body temperature. |
| `left_right_balance` | Cycling power balance | percent left | FIT left_right_balance | Optional cycling metric. |
| `vertical_oscillation` | Running dynamics | centimeters | FIT vertical_oscillation | Optional running dynamics metric. |
| `ground_contact_time` | Running dynamics | milliseconds | FIT stance_time | Optional running dynamics metric. |
| `stride_length` | Running dynamics | meters | FIT step_length / derived | Optional running dynamics metric. |

## Location fields

| Column | Activity concept | Stored unit | Notes |
|---|---|---:|---|
| `lat` | Latitude | decimal degrees | Nullable; populated when a sample has GPS position. |
| `lon` | Longitude | decimal degrees | Nullable; populated when a sample has GPS position. |
| `alt` | Altitude | meters | Nullable; mirrors altitude for position-bearing samples. |

## Summary table mappings

| Table column | Activity schema concept | Stored unit / type | Notes |
|---|---|---:|---|
| `activity_summary.start_time` | Activity start instant | UTC `TIMESTAMPTZ` | No local time persisted. |
| `activity_summary.sport` | Activity type | text | Normalized by application adapters. |
| `activity_summary.distance_m` | Total distance | meters | Nullable for non-distance activities. |
| `activity_summary.duration_s` | Moving/elapsed duration | seconds | Source-specific policy handled in adapter. |
| `activity_summary.avg_hr` | Average heart rate | beats/min | Derived or source-provided. |
| `activity_summary.max_hr` | Maximum heart rate | beats/min | Derived or source-provided. |
| `activity_summary.avg_power` | Average power | watts | Source-provided or computed. |
| `current_activity_facts.normalized_power` | Normalized Power | watts | Computed by domain load module. |
| `current_activity_facts.intensity_factor` | Intensity Factor | ratio | `normalized_power / ftp` when FTP is known. |
| `current_activity_facts.tss` | Training Stress Score | points | Power TSS or hrTSS depending on available data. |
| `activity_summary.source_weighted_power_w` | Source weighted power | watts | Source-provided only when raw provenance proves it. |
| `activity_summary.source_training_load` | Source training load | points | Source-provided only when raw provenance proves it. |

## Wellness mappings

| Table column | OMH schema / wellness concept | Stored unit | Notes |
|---|---|---:|---|
| `health_wellness.weight` | Body weight | kg | Daily wellness value. |
| `health_wellness.resting_hr` | `heart-rate-1.1` resting context | beats/min | Resting heart rate. |
| `health_wellness.hrv` | Heart-rate variability | ms | Source adapter must preserve source HRV definition. |
| `health_wellness.sleep_secs` | Sleep duration | seconds | Total sleep duration. |
| `health_wellness.sleep_score` | Sleep quality score | score | Source-normalized score where available. |
| `health_wellness.fatigue` | Subjective fatigue | score | Athlete-entered or source wellness metric. |
| `health_wellness.soreness` | Subjective soreness | score | Athlete-entered or source wellness metric. |
| `health_wellness.stress` | Subjective stress | score | Athlete-entered or source wellness metric. |
| `health_wellness.mood` | Subjective mood | score | Athlete-entered or source wellness metric. |
| `health_wellness.motivation` | Subjective motivation | score | Athlete-entered or source wellness metric. |
| `health_wellness.readiness` | Readiness score | score | Source-normalized readiness. |
