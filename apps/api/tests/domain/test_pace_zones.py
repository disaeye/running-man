"""Pace zones, pinned to the table the module cites.

The failures these tests guard against are the ones an athlete notices: an easy
aerobic run reported as a threshold effort, or a zone table whose bands do not
match the reference it claims to implement.
"""

import itertools

from domain.insights.pace_zones import pace_zones, zone_for_pace

THRESHOLD = 294.0  # 4:54/km
OPEN_CAP = 1e9


def test_zone_boundaries_match_friel_run_zones() -> None:
    zones = {zone.zone: zone for zone in pace_zones(THRESHOLD)}

    # Z4 is the threshold band: from threshold pace to 6% slower, not
    # "anything within 10%".
    assert zones[4].min_pace_s_km == THRESHOLD * 1.00
    assert zones[4].max_pace_s_km == THRESHOLD * 1.06
    assert zones[3].min_pace_s_km == THRESHOLD * 1.06
    assert zones[3].max_pace_s_km == THRESHOLD * 1.14
    assert zones[2].min_pace_s_km == THRESHOLD * 1.14
    assert zones[2].max_pace_s_km == THRESHOLD * 1.29


def test_an_easy_run_one_tenth_slower_than_threshold_is_not_a_threshold_run() -> None:
    """108% of threshold pace is tempo, not threshold.

    With the rounded 1.00-1.10 band this landed in Z4 and an easy aerobic run
    was labelled as a threshold effort.
    """
    easy_pace = THRESHOLD * 1.08

    assert zone_for_pace(easy_pace, THRESHOLD) == 3


def test_zones_are_contiguous_from_slow_to_fast() -> None:
    zones = pace_zones(THRESHOLD)

    assert [zone.zone for zone in zones] == [1, 2, 3, 4, 5]
    assert zones[0].min_pace_s_km == zones[1].max_pace_s_km
    assert zones[0].max_pace_s_km >= OPEN_CAP
    # Zones are ordered slowest first, so each zone's fast edge is the next
    # zone's slow edge.
    for slower, faster in itertools.pairwise(zones[1:]):
        assert slower.min_pace_s_km == faster.max_pace_s_km


def test_every_bounded_zone_contains_its_own_midpoint() -> None:
    for zone in pace_zones(THRESHOLD):
        if zone.max_pace_s_km >= OPEN_CAP:
            continue
        midpoint = (zone.min_pace_s_km + zone.max_pace_s_km) / 2
        assert zone_for_pace(midpoint, THRESHOLD) == zone.zone


def test_threshold_pace_itself_is_a_threshold_effort() -> None:
    assert zone_for_pace(THRESHOLD, THRESHOLD) == 4
    assert zone_for_pace(THRESHOLD * 0.99, THRESHOLD) == 5
