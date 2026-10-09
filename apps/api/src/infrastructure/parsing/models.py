"""Shared data models for parsing FIT / TCX / GPX into a uniform record."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class FitSample:
    """A single point-in-time record from any fitness-file format.

    Fields common to FIT / TCX / GPX are included; extras go into ``extra``.
    """

    timestamp: datetime
    heart_rate: int | None = None
    power: int | None = None
    cadence: int | None = None
    speed: float | None = None
    altitude: float | None = None

    # Coordinates (TCX/GPX provide directly; FIT decodes from semicircles).
    lat: float | None = None
    lon: float | None = None

    # TCX-specific
    distance: float | None = None

    # FIT-specific running dynamics（解析时已归一到契约单位：cm / ms / m）与环境温度
    vertical_oscillation: float | None = None
    stance_time: float | None = None
    stride_length: float | None = None
    temperature: float | None = None

    # Allow arbitrary extra fields for format-specific data.
    extra: dict[str, object] = field(default_factory=dict)
