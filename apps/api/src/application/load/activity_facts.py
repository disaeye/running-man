import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from domain.insights.zone_schemes import HR_SCHEMES, hr_zones_for_scheme
from domain.load.decoupling import aerobic_decoupling
from domain.load.normalized_power import normalized_power
from domain.load.tss import (
    hr_tss,
    pace_intensity_factor,
    pace_tss,
)
from domain.physiology.graded_pace import average_gap, normalized_graded_pace

from .hr_zones import compute_hr_zone_times, compute_hr_zone_times_from_samples

ALGORITHM_VERSION: Final = "1.0.0"

# hrTSS is defined against LTHR-derived zones, so load computation pins this
# scheme regardless of which scheme the athlete views their zones through.
LTHR_SCHEME: Final = HR_SCHEMES["lthr"]

# Decoupling / EF / pace-derived effort need at least two paired samples.
MIN_PAIRED_SAMPLES = 2


@dataclass(frozen=True, slots=True)
class ActivityLoadInput:
    activity_id: str
    start_time: datetime
    duration_s: int
    sport: str | None
    avg_hr: int | None
    hr_samples: tuple[float, ...]  # per-second HR stream, empty if unavailable
    lthr: int | None
    pace_streams: tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]] | None
    threshold_pace: float | None  # s/km, resolved for the activity date


@dataclass(frozen=True, slots=True)
class ActivityMetricFact:
    subject_key: str
    metric_key: str
    unit: str
    value: float
    effective_at: datetime
    method: str
    confidence: float


def compute_activity_metric_facts(
    activity: ActivityLoadInput,
) -> tuple[ActivityMetricFact, ...]:
    facts: list[ActivityMetricFact] = []
    # --- Pace path (running): rTSS from grade-adjusted pace ---
    # Running is the primary discipline, and pace relative to threshold is its
    # first-class dose because pace is the external work. Power is not used: no
    # supported source in this deployment emits a power stream, so a power path
    # would only ever produce nothing.
    if activity.threshold_pace is not None and activity.pace_streams is not None:
        distances, altitudes, times = activity.pace_streams
        ngp = normalized_graded_pace(
            distances=distances, altitudes=altitudes, times=times
        )
        gap_value = average_gap(
            distances=distances, altitudes=altitudes, times=times
        )
        if gap_value is not None:
            facts.append(
                _fact(activity, "gap_avg", "s_km", gap_value, "grade_adjusted_pace")
            )
        if ngp is not None:
            facts.append(
                _fact(activity, "normalized_graded_pace", "s_km", ngp, "normalized_graded_pace")
            )
            rtss = pace_tss(
                activity.duration_s, ngp, activity.threshold_pace
            )
            facts.append(_fact(activity, "tss", "points", rtss, "rtss"))
            facts.append(
                _fact(
                    activity,
                    "intensity_factor",
                    "ratio",
                    pace_intensity_factor(ngp, activity.threshold_pace),
                    "rtss",
                )
            )
            _maybe_record_decoupling(facts, activity, effort="pace")
            return tuple(facts)

    # --- HR fallback (no pace stream or no threshold pace) ---
    hr_load = _hr_tss(activity)
    if hr_load is not None:
        facts.append(_fact(activity, "tss", "points", hr_load, "hr_tss"))
    return tuple(facts)


def _maybe_record_decoupling(
    facts: list[ActivityMetricFact], activity: ActivityLoadInput, *, effort: str
) -> None:
    """Record aerobic decoupling + efficiency factor when HR stream is available.

    EF and decoupling answer 'was the same external work more expensive over
    time?' — they are diagnostic, not load. Only meaningful for steady-state
    efforts ≥ 20 min with paired cardio.
    """
    if not activity.hr_samples:
        return
    effort_series = _effort_series(activity, effort)
    if effort_series is None:
        return
    n = min(len(effort_series), len(activity.hr_samples))
    if n < MIN_PAIRED_SAMPLES:
        return
    effort_values = effort_series[:n]
    cardio = activity.hr_samples[:n]
    ef = _efficiency_factor_public(effort_values, cardio)
    if ef is not None:
        facts.append(_fact(activity, "efficiency_factor", "ratio", ef, f"{effort}_ef"))
    decoupling = aerobic_decoupling(effort_values, cardio)
    if decoupling is not None:
        facts.append(
            _fact(
                activity,
                "aerobic_decoupling_pct",
                "percent",
                decoupling,
                f"{effort}_decoupling",
            )
        )


def _effort_series(
    activity: ActivityLoadInput, effort: str
) -> tuple[float, ...] | None:
    if effort == "pace" and activity.pace_streams is not None:
        distances, _altitudes, times = activity.pace_streams
        return _pace_effort_from_streams(distances, times)
    return None


def _pace_effort_from_streams(
    distances: tuple[float, ...], times: tuple[float, ...]
) -> tuple[float, ...] | None:
    """Convert cumulative distance/time into per-sample speed (m/s) effort."""
    n = min(len(distances), len(times))
    if n < MIN_PAIRED_SAMPLES:
        return None
    speeds: list[float] = [0.0]
    for i in range(1, n):
        dd = distances[i] - distances[i - 1]
        dt = times[i] - times[i - 1]
        speeds.append(dd / dt if dt > 0 and dd >= 0 else 0.0)
    return tuple(speeds)


def _efficiency_factor_public(
    effort_values: Sequence[float], cardio_values: Sequence[float]
) -> float | None:
    np_value = normalized_power(effort_values)
    if np_value is None or not cardio_values:
        return None
    avg_hr = sum(cardio_values) / len(cardio_values)
    if avg_hr <= 0:
        return None
    return np_value / avg_hr


def _hr_tss(activity: ActivityLoadInput) -> float | None:
    """Heart-rate TSS, always measured against the LTHR zone table.

    hrTSS is defined as time in zones *derived from lactate threshold heart
    rate* (TrainingPeaks), so the load kernel pins the LTHR scheme even when
    the athlete views their zones through a different one. Display and
    calculation are allowed to differ; silently letting a display preference
    change historical load would not be. Without an LTHR there is no
    LTHR-based zone table, so the answer is ``None`` rather than a number
    built from a borrowed threshold.
    """
    if activity.lthr is None:
        return None
    zones = hr_zones_for_scheme(
        LTHR_SCHEME, hr_max=None, lthr=activity.lthr, resting_hr=None
    )
    if not zones:
        return None
    # Prefer per-sample zone time when the HR stream is available — it captures
    # interval structure that avg_hr destroys (same mean, different distribution).
    if activity.hr_samples:
        zone_times = compute_hr_zone_times_from_samples(
            activity.hr_samples, activity.duration_s, zones
        )
    elif activity.avg_hr is not None:
        zone_times = compute_hr_zone_times(
            activity.avg_hr, activity.duration_s, zones
        )
    else:
        return None
    return hr_tss(zone_times) if zone_times else None


def _fact(
    activity: ActivityLoadInput,
    metric_key: str,
    unit: str,
    value: float,
    method: str,
) -> ActivityMetricFact:
    return ActivityMetricFact(
        subject_key=activity.activity_id,
        metric_key=metric_key,
        unit=unit,
        value=value,
        effective_at=activity.start_time,
        method=method,
        confidence=1.0,
    )


def fingerprint_inputs(activities: Sequence[ActivityLoadInput]) -> str:
    """Stable hash of everything that can change an activity's computed facts.

    Anything omitted here becomes a change the recompute will not notice. The
    previous version recorded only ``has_pace_streams`` — a boolean — so
    editing an activity's GPS track (added, removed, or corrected samples)
    left the fingerprint unchanged and the stale rTSS was silently kept. The
    stream contents are now hashed.

    Raw samples are reduced to a digest rather than included verbatim: the
    fingerprint is stored per computation run, and a 10k-sample JSON array per
    activity would bloat that row for no benefit.
    """
    payload = [
        {
            "activity_id": activity.activity_id,
            "start_time": activity.start_time.isoformat(),
            "duration_s": activity.duration_s,
            "sport": activity.sport,
            "avg_hr": activity.avg_hr,
            "lthr": activity.lthr,
            "threshold_pace": activity.threshold_pace,
            "hr_samples_digest": _series_digest(activity.hr_samples),
            "pace_streams_digest": _pace_digest(activity.pace_streams),
        }
        for activity in activities
    ]
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode()).hexdigest()


def _series_digest(values: Sequence[float]) -> str | None:
    if not values:
        return None
    joined = ",".join(f"{value:.3f}" for value in values)
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


def _pace_digest(
    streams: tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]] | None,
) -> tuple[str | None, int]:
    """Digest of (distances, altitudes, times) plus the sample count.

    The count is included alongside the digest so a truncation or a shift in
    sampling is visible even in the unlikely event of a hash collision.
    """
    if streams is None:
        return None, 0
    distances, altitudes, times = streams
    payload = json.dumps(
        [list(distances), list(altitudes), list(times)],
        ensure_ascii=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16], len(distances)
