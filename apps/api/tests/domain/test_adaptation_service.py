from datetime import datetime
from uuid import uuid4

import pytest

from application.plan.adaptation_service import adapt_plan_for_recovery


@pytest.mark.no_db
def test_adapt_plan_for_recovery_fatigue() -> None:
    events = [
        {"event_id": str(uuid4()), "predicted_tss": 100.0, "start_time": datetime.now()},
        {"event_id": str(uuid4()), "predicted_tss": 50.0, "start_time": datetime.now()},
    ]
    adjusted, reason = adapt_plan_for_recovery(events, readiness_score=35.0, current_tsb=-30.0)
    assert "Fatigue detected" in reason
    assert adjusted[0]["predicted_tss"] == 70.0
    assert adjusted[1]["predicted_tss"] == 35.0


@pytest.mark.no_db
def test_adapt_plan_for_recovery_normal() -> None:
    events = [
        {"event_id": str(uuid4()), "predicted_tss": 80.0, "start_time": datetime.now()},
    ]
    adjusted, reason = adapt_plan_for_recovery(events, readiness_score=65.0, current_tsb=5.0)
    assert "Normal training load" in reason
    assert adjusted[0]["predicted_tss"] == 80.0
