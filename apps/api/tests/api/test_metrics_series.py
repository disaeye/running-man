from dataclasses import dataclass, field
from datetime import date
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from domain.generated.metrics import Metric
from domain.metric_series import MetricSeriesGrain, MetricSeriesQuery, MetricSeriesRecord
from infrastructure.auth.models import Athlete
from infrastructure.repositories import metric_series as metric_series_repo
from infrastructure.repositories.metric_series import MetricSeriesRepo
from main import app
from presentation.api.metrics import get_metric_series_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "metrics@example.test", "hash")


@pytest.mark.no_db
async def test_daily_metric_series_returns_typed_contract() -> None:
    repo = FakeMetricSeriesRepo([
        MetricSeriesRecord(period=date(2026, 1, 1), value=50.0, samples=1),
        MetricSeriesRecord(period=date(2026, 1, 3), value=75.0, samples=1),
    ])
    _use_repo(repo)

    response = await _get("/api/v1/metrics/series?metric=daily_tss&grain=daily&from=2026-01-01&to=2026-01-03")

    assert response.status_code == 200
    # ``label`` is the registered ``display_name``. Before the semantic-metadata
    # migration was applied this table had no display_name column at all and
    # the label fell back to a shorter string; the contract (metrics.yaml)
    # defines it as "每日训练压力分数 (Daily TSS)".
    assert response.json() == {
        "metric": "daily_tss",
        "grain": "daily",
        "unit": "points",
        "label": "每日训练压力分数 (Daily TSS)",
        "coverage": {"expected": 3, "observed": 2, "ratio": pytest.approx(2 / 3)},
        "points": [
            {"period": "2026-01-01", "value": 50.0, "samples": 1},
            {"period": "2026-01-03", "value": 75.0, "samples": 1},
        ],
    }
    assert repo.queries == [
        MetricSeriesQuery(
            athlete_id=ATHLETE.id,
            metric=Metric.DAILY_TSS,
            grain=MetricSeriesGrain.DAILY,
            start=date(2026, 1, 1),
            end=date(2026, 1, 3),
            sport=None,
        )
    ]


@pytest.mark.no_db
async def test_weekly_coverage_counts_iso_weeks_intersecting_range() -> None:
    _use_repo(FakeMetricSeriesRepo([
        MetricSeriesRecord(period=date(2025, 12, 29), value=4000.0, samples=1),
        MetricSeriesRecord(period=date(2026, 1, 5), value=5000.0, samples=1),
    ]))

    response = await _get("/api/v1/metrics/series?metric=distance_m&grain=weekly&from=2026-01-04&to=2026-01-05")

    assert response.status_code == 200
    payload = response.json()
    assert payload["coverage"] == {"expected": 2, "observed": 2, "ratio": 1.0}
    assert [point["period"] for point in payload["points"]] == ["2025-12-29", "2026-01-05"]

@pytest.mark.no_db
async def test_batch_series_pivots_multiple_metrics() -> None:
    repo = FakeMetricSeriesRepo([
        MetricSeriesRecord(period=date(2026, 1, 1), value=50.0, samples=1),
        MetricSeriesRecord(period=date(2026, 1, 2), value=60.0, samples=1),
    ])
    _use_repo(repo)

    response = await _get(
        "/api/v1/metrics/series/batch?metrics=daily_tss,ctl&grain=daily&from=2026-01-01&to=2026-01-02"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["grain"] == "daily"
    by_metric = {entry["metric"]: entry for entry in payload["series"]}
    assert set(by_metric.keys()) == {"daily_tss", "ctl"}
    assert by_metric["daily_tss"]["points"] == [
        {"period": "2026-01-01", "value": 50.0, "samples": 1},
        {"period": "2026-01-02", "value": 60.0, "samples": 1},
    ]
    assert {q.metric for q in repo.queries} == {Metric.DAILY_TSS, Metric.CTL}


@pytest.mark.no_db
async def test_batch_series_skips_unknown_metrics() -> None:
    _use_repo(FakeMetricSeriesRepo([]))

    response = await _get(
        "/api/v1/metrics/series/batch?metrics=daily_tss,bogus_metric&from=2026-01-01&to=2026-01-02"
    )

    assert response.status_code == 200
    payload = response.json()
    assert {entry["metric"] for entry in payload["series"]} == {"daily_tss"}


@pytest.mark.no_db
async def test_unknown_metric_returns_422_before_sql(monkeypatch: pytest.MonkeyPatch) -> None:
    spy = SqlExecutionSpy()
    monkeypatch.setattr(metric_series_repo, "_connect", spy.connect)
    _use_repo(MetricSeriesRepo())

    response = await _get("/api/v1/metrics/series?metric=unknown&grain=daily&from=2026-01-01&to=2026-01-02")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert spy.executions == 0


@pytest.mark.no_db
async def test_unknown_grain_returns_422_before_sql(monkeypatch: pytest.MonkeyPatch) -> None:
    spy = SqlExecutionSpy()
    monkeypatch.setattr(metric_series_repo, "_connect", spy.connect)
    _use_repo(MetricSeriesRepo())

    response = await _get("/api/v1/metrics/series?metric=daily_tss&grain=monthly&from=2026-01-01&to=2026-01-02")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert spy.executions == 0


@pytest.mark.no_db
async def test_malicious_metric_returns_422_before_sql(monkeypatch: pytest.MonkeyPatch) -> None:
    spy = SqlExecutionSpy()
    monkeypatch.setattr(metric_series_repo, "_connect", spy.connect)
    _use_repo(MetricSeriesRepo())

    response = await _get(
        "/api/v1/metrics/series?metric=daily_tss%27%3Bdrop%20table%20activity_summary--&grain=daily&from=2026-01-01&to=2026-01-02"
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert spy.executions == 0


@pytest.mark.no_db
async def test_metric_series_repo_uses_composed_sql(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor([{"period": date(2026, 1, 1), "value": 123.0, "samples": 1}])
    monkeypatch.setattr(metric_series_repo, "_connect", lambda: FakeConnectionContext(cursor))
    query = MetricSeriesQuery(
        athlete_id=ATHLETE.id,
        metric=Metric.DAILY_TSS,
        grain=MetricSeriesGrain.DAILY,
        start=date(2026, 1, 1),
        end=date(2026, 1, 2),
    )

    records = await MetricSeriesRepo().fetch(query)

    assert records == [MetricSeriesRecord(period=date(2026, 1, 1), value=123.0, samples=1)]
    assert cursor.params == (ATHLETE.id, date(2026, 1, 1), date(2026, 1, 2), "daily_tss", None, None)
    assert cursor.query_type == "Composed"


@dataclass
class FakeMetricSeriesRepo:
    rows: list[MetricSeriesRecord]
    queries: list[MetricSeriesQuery] = field(default_factory=list)

    async def fetch(self, query: MetricSeriesQuery) -> list[MetricSeriesRecord]:
        self.queries.append(query)
        return list(self.rows)


class SqlExecutionSpy:
    def __init__(self) -> None:
        self.executions = 0

    def connect(self) -> "FakeConnectionContext":
        return FakeConnectionContext(FakeCursor([], spy=self))


class FakeConnectionContext:
    def __init__(self, cursor: "FakeCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeConnection":
        return FakeConnection(self._cursor)

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None


class FakeConnection:
    def __init__(self, cursor: "FakeCursor") -> None:
        self._cursor = cursor

    def cursor(self) -> "FakeCursorContext":
        return FakeCursorContext(self._cursor)


class FakeCursorContext:
    def __init__(self, cursor: "FakeCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeCursor":
        return self._cursor

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None


class FakeCursor:
    def __init__(self, rows: list[dict[str, object]], spy: SqlExecutionSpy | None = None) -> None:
        self.rows = rows
        self.spy = spy
        self.query_type = ""
        self.params: tuple[object, ...] = ()

    async def execute(self, query: object, params: tuple[object, ...]) -> None:
        if self.spy is not None:
            self.spy.executions += 1
        self.query_type = type(query).__name__
        self.params = params

    async def fetchall(self) -> list[dict[str, object]]:
        return list(self.rows)


def _use_repo(repo: FakeMetricSeriesRepo | MetricSeriesRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_metric_series_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)
