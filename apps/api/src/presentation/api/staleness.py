"""How old the newest synced data is, decided in one place.

Two surfaces used to answer this question separately: the integration card
compared `data_as_of` against 24 and 72 hours, and the coach context compared
calendar days. The card therefore reported `missing` for an activity that was
five days old, and `missing` is the value the UI turns into "no data — connect
a source". An athlete who trained five days ago was told to connect an account
that was already connected.

`missing` now means exactly one thing: nothing has ever been synced.
"""

from datetime import date, datetime
from typing import Literal

StalenessBucket = Literal["fresh", "stale", "missing"]

# Data is fresh while it is at most one day old, in the athlete's day terms.
FRESH_WITHIN_DAYS = 1


def staleness_bucket(data_as_of: object, today: date) -> StalenessBucket:
    if data_as_of is None:
        return "missing"
    as_day = data_as_of.date() if isinstance(data_as_of, datetime) else data_as_of
    if isinstance(as_day, date) and (today - as_day).days <= FRESH_WITHIN_DAYS:
        return "fresh"
    return "stale"
