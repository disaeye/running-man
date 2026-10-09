"""Reading per-activity pace series for running load.

Sources express distance two ways: some emit an accumulating ``distance``
stream, Intervals.icu emits ``speed``. Reading only ``distance`` meant no run
ever had a pace series — so :func:`estimate_tss` never reached the rTSS branch
and every activity fell back to heart-rate TSS, with confidence still recorded
as 1.0. Measured before the fix: 44 of 44 activities were hrTSS.

Speed is integrated to reconstruct distance, using the actual interval between
samples rather than an assumed one second, so a device sampling at 2 s or 5 s is
handled correctly. Verified against this deployment: for activities above 1 km
the integrated distance matches ``activity_summary.distance_m`` within 0.2-2.7%.

Split out of ``recompute.py`` to stay within the repository's file-size limit.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

from .constants import MAX_SPEED_GAP_SECONDS, MIN_PACE_STREAM_SAMPLES


async def pace_streams(
    conn: psycopg.AsyncConnection[DictRow],
    athlete_id: UUID,
    activity_ids: set[str] | None = None,
) -> dict[str, tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]]]:
    """Per-activity (distances, altitudes, times) for running rTSS/GAP.

    Distance is the quantity the pace model needs, and sources express it two
    ways: some emit an accumulating ``distance`` stream, Intervals.icu emits a
    ``speed`` stream instead. Reading only ``distance`` meant no run ever had a
    pace series, so :func:`estimate_tss` never reached the rTSS branch and every
    activity fell back to heart-rate TSS — with ``confidence`` still recorded as
    1.0.

    Speed is integrated to reconstruct distance, and the sample interval is
    taken from consecutive timestamps rather than assumed to be one second, so a
    device sampling at 2 s or 5 s is handled correctly. Verified against this
    deployment's data: for activities above 1 km the integrated distance matches
    ``activity_summary.distance_m`` within 0.2-2.7%.
    """
    if activity_ids is not None and not activity_ids:
        return {}
    query = (
        "SELECT activity_id, metric_type, sample_time, value FROM activity_streams "
        "WHERE athlete_id = %s AND metric_type IN ('distance', 'speed', 'altitude') "
        "AND (%s::text[] IS NULL OR activity_id = ANY(%s)) "
        "ORDER BY activity_id, metric_type, sample_time"
    )
    ids = sorted(activity_ids) if activity_ids is not None else None
    async with conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, ids, ids))
        rows = await cur.fetchall()

    paired: dict[str, dict[datetime, dict[str, float]]] = {}
    for row in rows:
        aid = _as_text(row["activity_id"])
        mtype = _as_text(row["metric_type"])
        st = row["sample_time"]
        if not isinstance(st, datetime):
            continue
        paired.setdefault(aid, {}).setdefault(st, {})[mtype] = float(row["value"])

    out: dict[str, tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]]] = {}
    for aid, samples in paired.items():
        times_sorted = sorted(samples)
        if not times_sorted:
            continue
        tries = _distance_series(times_sorted, samples)
        if tries is None:
            continue
        distances, altitudes, times = tries
        if len(distances) >= MIN_PACE_STREAM_SAMPLES:
            out[aid] = (tuple(distances), tuple(altitudes), tuple(times))
    return out


def _distance_series(
    times_sorted: list[datetime], samples: dict[datetime, dict[str, float]]
) -> tuple[list[float], list[float], list[float]] | None:
    """Cumulative distance, altitude and elapsed seconds, from either source.

    Prefers an explicit ``distance`` stream. Falls back to integrating
    ``speed``, which is what Intervals.icu provides.
    """
    base = times_sorted[0]
    distances: list[float] = []
    altitudes: list[float] = []
    times: list[float] = []

    has_distance = any("distance" in samples[st] for st in times_sorted)
    if has_distance:
        for st in times_sorted:
            entry = samples[st]
            if "distance" not in entry:
                continue
            distances.append(entry["distance"])
            altitudes.append(entry.get("altitude", 0.0))
            times.append((st - base).total_seconds())
        return distances, altitudes, times

    if not any("speed" in samples[st] for st in times_sorted):
        return None

    # Trapezoidal integration over the actual sample interval: using a fixed
    # 1 s step would mis-scale a device that samples less often.
    cumulative = 0.0
    previous: datetime | None = None
    previous_speed: float | None = None
    for st in times_sorted:
        entry = samples[st]
        speed = entry.get("speed")
        if speed is None:
            continue
        if previous is not None and previous_speed is not None:
            dt = (st - previous).total_seconds()
            if dt > 0:
                # Clamp a gap between samples so a pause or a dropped packet does
                # not integrate as if the athlete kept moving at full speed.
                cumulative += (previous_speed + speed) / 2.0 * min(dt, MAX_SPEED_GAP_SECONDS)
        previous, previous_speed = st, speed
        distances.append(cumulative)
        altitudes.append(entry.get("altitude", 0.0))
        times.append((st - base).total_seconds())
    return distances, altitudes, times


def _as_text(value: object) -> str:
    """Decode a possibly-bytes column value.

    psycopg returns text columns as ``str``, but a raw driver or a test double
    may hand back ``bytes``; normalising here keeps activity ids comparable.
    """
    return value.decode() if isinstance(value, bytes) else str(value)
