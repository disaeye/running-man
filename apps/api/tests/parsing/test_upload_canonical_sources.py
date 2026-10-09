from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest

from infrastructure.parsing.models import FitSample
from infrastructure.repositories.activity_sql import _summary_params
from presentation.api._upload_helpers import summary_from_samples

pytestmark = pytest.mark.no_db

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000001011")


@pytest.mark.parametrize("file_type", ["fit", "gpx", "tcx"])
def test_uploaded_file_source_is_canonical_file_type(file_type: str) -> None:
    samples = [
        FitSample(
            timestamp=datetime(2026, 7, 15, 10, tzinfo=UTC),
            heart_rate=150,
            distance=5140.0,
        )
    ]

    summary = summary_from_samples(samples, file_type, f"activity.{file_type}", {})
    params = _summary_params(ATHLETE_ID, summary)

    assert summary["source"] == file_type
    assert params[3] == "run"
    assert params[4] == 5140.0
    assert params[14] == file_type
