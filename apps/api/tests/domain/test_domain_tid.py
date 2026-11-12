from datetime import date, datetime, timedelta
from typing import Any, cast

from domain.insights.domain_tid import (
    classify_domain_distribution,
    classify_weekly_distribution,
    domain_intensity_score,
    domain_percentages,
)
from domain.insights.plan_quality import compute_plan_quality
from domain.insights.zones import ActivityDistribution, weekly_breakdown


def test_domain_percentages_group_four_physiological_domains() -> None:
    percentages = domain_percentages(
        {
            "below_mt1": 4500.0,
            "low_unspecified": 300.0,
            "mt1_mt2": 300.0,
            "mt2_wmax": 800.0,
            "above_wmax": 100.0,
        }
    )
    assert percentages is not None
    assert percentages["low"] == 80.0
    assert percentages["mid"] == 5.0
    assert percentages["high"] == 15.0


def test_domain_classification_prefers_measured_domains_over_zone_proxy() -> None:
    zone_minutes = {"z1": 40.0, "z2": 20.0, "z3": 30.0, "z4": 5.0, "z5": 5.0}
    measured = {
        "below_mt1": 4800.0,
        "mt1_mt2": 300.0,
        "mt2_wmax": 900.0,
        "above_wmax": 0.0,
        "low_unspecified": 0.0,
    }
    assert classify_domain_distribution(measured) == "high-volume"
    assert classify_weekly_distribution(zone_minutes, measured) == "high-volume"


def test_polarized_domains_beat_five_zone_classification() -> None:
    zone_minutes = {"z1": 80.0, "z2": 10.0, "z3": 5.0, "z4": 3.0, "z5": 2.0}
    measured = {
        "below_mt1": 7600.0,
        "mt1_mt2": 400.0,
        "mt2_wmax": 1600.0,
        "above_wmax": 400.0,
        "low_unspecified": 0.0,
    }
    assert classify_domain_distribution(measured) == "polarized"
    assert classify_weekly_distribution(zone_minutes, measured) == "polarized"


def test_weekly_breakdown_uses_stored_domains_for_distribution_type() -> None:
    distribution = ActivityDistribution(
        start_date=date(2026, 2, 2),
        by_zone={"z1": 80.0, "z2": 10.0, "z3": 5.0, "z4": 3.0, "z5": 2.0},
        source="heart_rate",
    )
    classifications = [
        {
            "local_day": date(2026, 2, 2),
            "quality": {
                "work_domain_residence_s": {
                    "below_mt1": 7600.0,
                    "mt1_mt2": 400.0,
                    "mt2_wmax": 1600.0,
                    "above_wmax": 400.0,
                    "low_unspecified": 0.0,
                }
            },
        }
    ]
    rows = weekly_breakdown([distribution], classifications)
    seconds = cast(dict[str, Any], rows[0]["work_domain_seconds"])
    assert rows[0]["distribution_type"] == "polarized"
    assert seconds["below_mt1"] == 7600.0


def test_domain_intensity_score_penalizes_excessive_mid_and_high_time() -> None:
    easy = domain_intensity_score({"below_mt1": 4800.0, "mt1_mt2": 300.0, "mt2_wmax": 900.0})
    hard = domain_intensity_score({"below_mt1": 2400.0, "mt1_mt2": 1800.0, "mt2_wmax": 1800.0})
    assert easy is not None and hard is not None
    assert easy == 25.0
    assert hard < easy


def test_plan_quality_scores_from_measured_domains_when_available() -> None:
    start = date(2026, 10, 12)
    events = [
        {
            "start_time": datetime(2026, 10, 12 + offset, 6, 0),
            "predicted_tss": 100.0,
            "training_type": "easy",
            "workout_prescription": {"duration_min": 60},
        }
        for offset in range(4)
    ]
    measured = [
        {
            "local_day": start,
            "quality": {
                "work_domain_residence_s": {
                    "below_mt1": 2400.0,
                    "mt1_mt2": 1800.0,
                    "mt2_wmax": 1800.0,
                    "above_wmax": 0.0,
                    "low_unspecified": 0.0,
                }
            },
        }
    ]
    legacy = compute_plan_quality(events, [], start, start + timedelta(days=6))
    domain = compute_plan_quality(events, [], start, start + timedelta(days=6), measured)
    assert domain["score"] < legacy["score"]
