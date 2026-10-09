"""Synthetic FIT file generator using fit_tool.

Produces a valid .FIT byte stream that can be round-tripped through fitdecode.
"""

import datetime

from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.event_message import EventMessage
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.lap_message import LapMessage
from fit_tool.profile.messages.record_message import RecordMessage
from fit_tool.profile.messages.session_message import SessionMessage
from fit_tool.profile.profile_type import (
    Event,
    EventType,
    FileType,
    Intensity,
    LapTrigger,
    Manufacturer,
    Sport,
    SubSport,
)


def generate_fit_stream(
    duration_seconds: int = 3600,
    hr: int = 150,
    power: int = 200,
    lat: float = 25.06,
    lon: float = 121.63,
    cadence: int = 85,
) -> bytes:
    """Produce a valid .FIT byte stream with file_id, record, lap, session.

    Parameters match common cycling/running record shapes.
    Output can be parsed by fitdecode.FitReader.
    """
    builder = FitFileBuilder(auto_define=True, min_string_size=16)

    now = datetime.datetime(2026, 6, 16, 10, 0, 0)
    start_ts = int(now.timestamp() * 1000)

    # file_id
    msg = FileIdMessage()
    msg.type = FileType.ACTIVITY
    msg.manufacturer = Manufacturer.DEVELOPMENT.value
    msg.product = 1
    msg.time_created = start_ts
    msg.serial_number = 42
    builder.add(msg)

    # timer start
    msg = EventMessage()
    msg.event = Event.TIMER
    msg.event_type = EventType.START
    msg.timestamp = start_ts
    builder.add(msg)

    # lap — fit_tool expects lat/lon in degrees (it encodes internally)
    lap_msg = LapMessage()
    lap_msg.message_index = 0
    lap_msg.start_time = start_ts
    lap_msg.timestamp = start_ts + duration_seconds * 1000
    lap_msg.start_position_lat = lat
    lap_msg.start_position_long = lon
    lap_msg.end_position_lat = lat + 0.01
    lap_msg.end_position_long = lon + 0.01
    lap_msg.lap_trigger = LapTrigger.MANUAL
    lap_msg.sport = Sport.CYCLING
    lap_msg.sub_sport = SubSport.GENERIC
    lap_msg.intensity = Intensity.ACTIVE
    lap_msg.avg_heart_rate = hr
    lap_msg.max_heart_rate = hr + 10
    lap_msg.avg_power = power
    lap_msg.max_power = power + 50
    lap_msg.avg_cadence = cadence
    lap_msg.max_cadence = cadence + 5
    lap_msg.total_elapsed_time = duration_seconds * 1000
    lap_msg.total_timer_time = duration_seconds * 1000
    lap_msg.total_distance = duration_seconds * 10_000
    builder.add(lap_msg)

    # records
    records = []
    lat_drift = 0.01 / duration_seconds
    lon_drift = 0.01 / duration_seconds

    for i in range(duration_seconds):
        ts = start_ts + i * 1000
        rec = RecordMessage()
        rec.timestamp = ts
        rec.heart_rate = hr
        rec.power = power
        rec.cadence = cadence
        rec.position_lat = lat + lat_drift * i
        rec.position_long = lon + lon_drift * i
        rec.enhanced_speed = 10.0
        rec.enhanced_altitude = 100.0
        records.append(rec)

    builder.add_all(records)

    # timer stop
    msg = EventMessage()
    msg.event = Event.TIMER
    msg.event_type = EventType.STOP
    msg.timestamp = start_ts + duration_seconds * 1000
    builder.add(msg)

    # session
    session = SessionMessage()
    session.message_index = 0
    session.start_time = start_ts
    session.timestamp = start_ts + duration_seconds * 1000
    session.start_position_lat = lat
    session.start_position_long = lon
    session.sport = Sport.CYCLING
    session.sub_sport = SubSport.GENERIC
    session.total_elapsed_time = duration_seconds * 1000
    session.total_timer_time = duration_seconds * 1000
    session.total_distance = duration_seconds * 10_000
    session.avg_heart_rate = hr
    session.max_heart_rate = hr + 10
    session.avg_power = power
    session.max_power = power + 50
    session.avg_cadence = cadence
    session.max_cadence = cadence + 5
    builder.add(session)

    fit_file = builder.build()
    return fit_file.to_bytes()
