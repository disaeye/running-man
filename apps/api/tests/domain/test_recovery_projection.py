"""休息投影使用 PMC 的相同逐日衰减规则。"""

from __future__ import annotations

import pytest

from domain.insights.recovery_projection import (
    MAX_HORIZON_DAYS,
    project_recovery,
)

pytestmark = pytest.mark.no_db


def test_tsb_at_zero_is_already_recovered() -> None:
    result = project_recovery(80.0, 80.0)
    assert result.days == 0
    assert result.current_tsb == 0.0
    assert result.projected_tsb == 0.0
    assert result.reachable is True


def test_negative_tsb_crosses_zero_using_daily_pmc_decay() -> None:
    result = project_recovery(40.0, 60.0)
    assert result.days == 4
    assert result.current_tsb == -20.0
    assert result.projected_tsb == pytest.approx(3.9378782503)
    assert result.reachable is True


def test_projection_that_stays_below_zero_through_horizon_is_empty() -> None:
    result = project_recovery(0.0, 1000.0)
    assert result.days is None
    assert result.reachable is False
    assert result.projected_tsb == result.current_tsb


def test_requested_horizon_is_bounded_to_supported_window() -> None:
    result = project_recovery(20.0, 100.0, horizon_days=MAX_HORIZON_DAYS * 3)
    bounded = project_recovery(20.0, 100.0, horizon_days=MAX_HORIZON_DAYS)
    assert result == bounded
