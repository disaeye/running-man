from domain.run_classification.analysis import stream_features
from tests.domain.run_classification_fixtures import evidence


def test_missing_speed_stream_does_not_invent_whole_session_speed() -> None:
    item = evidence(streams={"heart_rate": [(0.0, 150.0)]})
    features = stream_features(item)
    assert features.speed_bins == []
    assert features.third_speeds == (0.0, 0.0, 0.0)
    assert features.speed_cv == 0.0
    assert features.monotonic is False


def test_speed_stream_drives_third_speeds() -> None:
    item = evidence(
        streams={
            "speed": [(float(second), 3.0 + float(second) / 1800.0) for second in range(1800)],
            "heart_rate": [(float(second), 150.0) for second in range(1800)],
        }
    )
    features = stream_features(item)
    assert features.speed_bins
    assert features.third_speeds[0] < features.third_speeds[2]
