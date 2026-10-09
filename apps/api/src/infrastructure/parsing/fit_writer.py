"""Inverse of :mod:`parsing.fit_parser` — serialize ``FitSample`` list to .FIT bytes.

Reads stream rows from the database (via :meth:`ActivityRepo.get_streams`) and
emits a Garmin FIT activity file containing file_id, records, lap, and session
messages. The output is round-trip parseable by ``fitdecode.FitReader``.

Design notes
------------
* ``fit_tool`` writes coordinates in degrees (it converts to semicircles
  internally), matching what ``fit_parser`` reads back via
  ``SEMICIRCLES_TO_DEGREES``.
* Timestamps are stored in the DB as timezone-aware ``timestamptz``; we
  normalize to UTC before serializing to epoch millis.
* Optional fields (hr/power/cad/lat/lon/alt/speed) are only set when present —
  a record with just a timestamp is valid FIT.
* Lap and session aggregate fields (avg_hr, total_distance, etc.) are derived
  from the samples rather than from DB summary columns so that the writer
  stays pure — given samples in, FIT bytes out.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone

from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.lap_message import LapMessage
from fit_tool.profile.messages.record_message import RecordMessage
from fit_tool.profile.messages.session_message import SessionMessage
from fit_tool.profile.profile_type import FileType, Manufacturer, Sport, SubSport

from infrastructure.parsing.models import FitSample

_SPORT_MAP: dict[str, Sport] = {
    "Ride": Sport.CYCLING,
    "Bike": Sport.CYCLING,
    "VirtualRide": Sport.CYCLING,
    "Run": Sport.RUNNING,
    "VirtualRun": Sport.RUNNING,
    "TrailRun": Sport.RUNNING,
}


def write_fit(samples: Sequence[FitSample], sport: str = "Run") -> bytes:
    """Serialize ``samples`` to a valid .FIT byte stream.

    Raises ``ValueError`` for an empty sample list — a FIT activity file with
    no records is meaningless.
    """
    if not samples:
        raise ValueError("cannot write FIT file with zero samples")

    builder = FitFileBuilder(auto_define=True, min_string_size=16)
    timing = _timing_for(samples)
    fit_sport = _SPORT_MAP.get(sport, Sport.GENERIC)

    _add_file_id(builder, timing.start_ms)
    _add_records(builder, samples)
    _add_lap(builder, samples, fit_sport, timing)
    _add_session(builder, samples, fit_sport, timing)

    return builder.build().to_bytes()


@dataclass(frozen=True)
class _Timing:
    start_ms: int
    end_ms: int
    duration_ms: int


def _timing_for(samples: Sequence[FitSample]) -> _Timing:
    start_ms = _to_ms(samples[0].timestamp)
    end_ms = _to_ms(samples[-1].timestamp)
    return _Timing(start_ms, end_ms, max(0, end_ms - start_ms))


def _add_file_id(builder: FitFileBuilder, created_ms: int) -> None:
    msg = FileIdMessage()
    msg.type = FileType.ACTIVITY
    msg.manufacturer = Manufacturer.DEVELOPMENT.value
    msg.product = 1
    msg.time_created = created_ms
    msg.serial_number = 42
    builder.add(msg)


def _add_records(builder: FitFileBuilder, samples: Sequence[FitSample]) -> None:
    for sample in samples:
        rec = RecordMessage()
        rec.timestamp = _to_ms(sample.timestamp)
        if sample.heart_rate is not None:
            rec.heart_rate = int(sample.heart_rate)
        if sample.power is not None:
            rec.power = int(sample.power)
        if sample.cadence is not None:
            rec.cadence = int(sample.cadence)
        if sample.lat is not None and sample.lon is not None:
            rec.position_lat = float(sample.lat)
            rec.position_long = float(sample.lon)
        if sample.speed is not None:
            rec.enhanced_speed = float(sample.speed)
        if sample.altitude is not None:
            rec.enhanced_altitude = float(sample.altitude)
        builder.add(rec)


def _add_lap(
    builder: FitFileBuilder,
    samples: Sequence[FitSample],
    sport: Sport,
    timing: _Timing,
) -> None:
    lap_msg = LapMessage()
    lap_msg.message_index = 0
    lap_msg.start_time = timing.start_ms
    lap_msg.timestamp = timing.end_ms
    first, last = samples[0], samples[-1]
    if first.lat is not None and first.lon is not None:
        lap_msg.start_position_lat = float(first.lat)
        lap_msg.start_position_long = float(first.lon)
    if last.lat is not None and last.lon is not None:
        lap_msg.end_position_lat = float(last.lat)
        lap_msg.end_position_long = float(last.lon)
    lap_msg.sport = sport
    lap_msg.sub_sport = SubSport.GENERIC
    _apply_aggregates(lap_msg, samples)
    lap_msg.total_elapsed_time = timing.duration_ms
    lap_msg.total_timer_time = timing.duration_ms
    builder.add(lap_msg)


def _add_session(
    builder: FitFileBuilder,
    samples: Sequence[FitSample],
    sport: Sport,
    timing: _Timing,
) -> None:
    session = SessionMessage()
    session.message_index = 0
    session.start_time = timing.start_ms
    session.timestamp = timing.end_ms
    session.sport = sport
    session.sub_sport = SubSport.GENERIC
    _apply_aggregates(session, samples)
    session.total_elapsed_time = timing.duration_ms
    session.total_timer_time = timing.duration_ms
    builder.add(session)


def _apply_aggregates(msg: LapMessage | SessionMessage, samples: Sequence[FitSample]) -> None:
    """Populate hr/power/cadence/distance aggregates from the sample list.

    Done defensively — only set a field when samples actually carry that metric,
    so the writer tolerates sparse data (e.g. indoor rides without GPS).
    """
    distances = [s.distance for s in samples if s.distance is not None]
    if distances:
        msg.total_distance = float(max(distances))
    hrs = [s.heart_rate for s in samples if s.heart_rate is not None]
    if hrs:
        msg.avg_heart_rate = round(sum(hrs) / len(hrs))
        msg.max_heart_rate = max(hrs)
    powers = [s.power for s in samples if s.power is not None]
    if powers:
        msg.avg_power = round(sum(powers) / len(powers))
        msg.max_power = max(powers)
    cads = [s.cadence for s in samples if s.cadence is not None]
    if cads:
        msg.avg_cadence = round(sum(cads) / len(cads))


def _to_ms(ts: datetime) -> int:
    if ts.tzinfo is None:
        return int(ts.replace(tzinfo=timezone.utc).timestamp() * 1000)
    return int(ts.astimezone(timezone.utc).timestamp() * 1000)
