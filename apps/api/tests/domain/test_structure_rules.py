from domain.run_classification.analysis import StreamFeatures
from domain.run_classification.rules import detect_structure


def _features(*, speed_cv: float = 0.2, alternating: bool = True) -> StreamFeatures:
    return StreamFeatures(
        speed_bins=[],
        third_speeds=(3.0, 3.0, 3.0),
        speed_increase_pct=0.0,
        monotonic=False,
        alternating=alternating,
        speed_cv=speed_cv,
        grade_median_pct=0.0,
        high_blocks=[],
        low_blocks=[],
    )


def _work(start: float, duration: float, distance: float, speed: float) -> dict[str, object]:
    return {
        "role": "work",
        "start_s": start,
        "end_s": start + duration,
        "duration_s": duration,
        "distance_m": distance,
        "pace_s_km": duration / (distance / 1000.0) if distance > 0 else 0.0,
        "domain": "mt2_wmax",
        "measured": {"speed_m_s": speed},
    }


def _recovery(start: float, duration: float) -> dict[str, object]:
    return {
        "role": "recovery",
        "start_s": start,
        "end_s": start + duration,
        "duration_s": duration,
        "distance_m": 200.0,
        "pace_s_km": 360.0,
        "domain": "below_mt1",
        "measured": {"speed_m_s": 2.0},
    }


def test_uneven_alternating_work_bouts_are_fartlek() -> None:
    work = [
        _work(0, 180, 700.0, 3.9),
        _work(240, 240, 1100.0, 4.6),
        _work(540, 150, 520.0, 3.5),
        _work(750, 300, 1500.0, 5.0),
    ]
    recovery = [_recovery(180, 60), _recovery(480, 60), _recovery(690, 60)]
    segments = [*work[:1], recovery[0], *work[1:2], recovery[1], *work[2:3], recovery[2], *work[3:]]
    assert detect_structure(work, recovery, _features(), segments) == "fartlek"


def test_equal_length_repeats_are_interval_instead_of_fartlek() -> None:
    work = [_work(index * 300, 180, 1000.0, 5.5) for index in range(4)]
    recovery = [_recovery(index * 300 + 180, 120) for index in range(3)]
    segments = [item for pair in zip(work, [*recovery, None]) for item in pair if item]
    assert detect_structure(work, recovery, _features(speed_cv=0.4), segments) == "interval"


def test_single_work_bout_with_surges_is_unclear() -> None:
    work = [_work(0, 1800, 8000.0, 4.4)]
    assert detect_structure(work, [], _features(speed_cv=0.45), work) == "unclear"


def test_progression_requires_strictly_rising_thirds() -> None:
    work = [_work(0, 1800, 8000.0, 4.4)]
    falling_middle = StreamFeatures(
        speed_bins=[],
        third_speeds=(2.877, 2.836, 3.243),
        speed_increase_pct=12.7,
        monotonic=False,
        alternating=False,
        speed_cv=0.14,
        grade_median_pct=0.0,
        high_blocks=[],
        low_blocks=[],
    )
    assert detect_structure(work, [], falling_middle, work) == "continuous"
