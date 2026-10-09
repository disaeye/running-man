from infrastructure.parsing.models import FitSample


def fit_samples_to_stream_rows(samples: list[FitSample]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for sample in samples:
        for metric_type, value in sample_metrics(sample):
            rows.append(
                {
                    "sample_time": sample.timestamp,
                    "metric_type": metric_type,
                    "value": value,
                    "lat": sample.lat,
                    "lon": sample.lon,
                    "alt": sample.altitude,
                }
            )
    return rows


def sample_metrics(sample: FitSample) -> list[tuple[str, float]]:
    metrics: list[tuple[str, float | None]] = [
        ("heart_rate", sample.heart_rate),
        ("power", sample.power),
        ("cadence", sample.cadence),
        ("speed", sample.speed),
        ("distance", sample.distance),
        ("latitude", sample.lat),
        ("longitude", sample.lon),
        ("altitude", sample.altitude),
    ]
    return [
        (metric, float(value))
        for metric, value in metrics
        if value is not None and not (metric == "heart_rate" and float(value) < 1)
    ]
