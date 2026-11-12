"""rTSS 近似：小时数 × IF² × 100，IF 以阈值配速为分母。"""

import pytest

from domain.workout.tss_estimate import (
    TSS_ESTIMATE_ALGORITHM_VERSION,
    estimate_session_tss,
)


def test_easy_hour_below_threshold_gives_moderate_tss() -> None:
    # 阈值 240 s/km，轻松 360 s/km：IF = 2/3，一小时 ≈ 44.4。
    assert estimate_session_tss(60, 360, 240) == pytest.approx(44.4)


def test_threshold_pace_hour_is_hundred() -> None:
    assert estimate_session_tss(60, 240, 240) == pytest.approx(100.0)


def test_faster_than_threshold_scales_quadratically() -> None:
    # 间歇 200 s/km：IF = 1.2，一小时 = 144。
    assert estimate_session_tss(60, 200, 240) == pytest.approx(144.0)


def test_intensity_factor_is_capped() -> None:
    # 冲刺 100 s/km 时 IF 按 1.3 封顶，不再放大。
    assert estimate_session_tss(60, 100, 240) == pytest.approx(169.0)


def test_duration_scales_linearly() -> None:
    assert estimate_session_tss(90, 360, 240) == pytest.approx(66.7)


def test_non_positive_inputs_fail_loudly() -> None:
    with pytest.raises(ValueError):
        estimate_session_tss(0, 360, 240)
    with pytest.raises(ValueError):
        estimate_session_tss(60, 0, 240)
    with pytest.raises(ValueError):
        estimate_session_tss(60, 360, 0)


def test_algorithm_version_is_semver() -> None:
    parts = TSS_ESTIMATE_ALGORITHM_VERSION.split(".")
    assert len(parts) == 3 and all(part.isdigit() for part in parts)
