"""Sport-family helpers for the presentation layer.

Thin re-export of ``domain.sports`` so routers do not each re-derive their own
running-sport set (which is how four modules ended up with four spellings).
"""

from __future__ import annotations

from domain.sports import (
    canonical_sport,
    is_riding,
    is_running,
    is_strength,
    is_swimming,
    is_walking,
)

__all__ = [
    "canonical_sport",
    "is_riding",
    "is_running",
    "is_strength",
    "is_swimming",
    "is_walking",
]
