from domain.run_classification.quality import compare_quality


def _plan_segment(role: str, order: int) -> dict[str, object]:
    return {
        "order": order,
        "role": role,
        "start_s": float(order * 120),
        "end_s": float(order * 120 + 100),
        "duration_s": 100.0,
        "distance_m": 500.0,
        "pace_s_km": 250.0,
        "avg_hr": 165.0,
        "repetitions": 1,
        "target": {
            "distance_m": 500.0,
            "duration_s": 100.0,
            "pace_s_km": 250.0,
            "hr_bpm": 165.0,
        },
    }


def _measured_segment(role: str, order: int) -> dict[str, object]:
    return {
        "order": order,
        "role": role,
        "start_s": float(order * 90),
        "end_s": float(order * 90 + 80),
        "duration_s": 80.0,
        "distance_m": 450.0,
        "pace_s_km": 255.0,
        "avg_hr": 163.0,
        "measured": {
            "distance_m": 450.0,
            "duration_s": 80.0,
            "pace_s_km": 255.0,
            "avg_hr": 163.0,
        },
    }


def test_original_plan_and_execution_report_honest_difference() -> None:
    # Six planned work bouts, nine measured work bouts: the plan and the
    # recording keep their own boundaries. The comparison must report 9/6 and
    # the role-count overlap, never a perfect match obtained by rewriting one
    # segment list into the other.
    plan_roles = ["warmup"] + ["work", "recovery"] * 5 + ["work", "cooldown"]
    measured_roles = (
        ["warmup", "warmup"]
        + ["work", "recovery"] * 7
        + ["work", "work", "cooldown"]
        + ["transition"] * 4
    )
    plan = [_plan_segment(role, index) for index, role in enumerate(plan_roles, 1)]
    execution = [_measured_segment(role, index) for index, role in enumerate(measured_roles, 1)]
    result = compare_quality({}, {"segments": plan}, {"segments": execution})
    assert result["repetition_match"] == 1.5
    assert result["structure_match"] == 0.565
    differences = result["per_segment_differences"]
    assert isinstance(differences, list)
    assert len(differences) >= max(len(plan), len(execution))
    assert result["paired_segment_count"] == sum(1 for row in differences if row["paired"])
    assert result["unpaired_segment_count"] == sum(1 for row in differences if not row["paired"])
    assert all("distance_delta_m" in row and "role_match" in row for row in differences)
    assert all(
        row["target_order"] is not None and row["measured_order"] is not None
        for row in differences
        if row["paired"]
    )
    assert all(
        row["target_order"] is not None or row["measured_order"] is not None for row in differences
    )
    assert all(row["overlap_s"] is not None for row in differences if row["paired"])
    assert all(row["target_role"] == row["measured_role"] for row in differences if row["paired"])
    assert result["work_distance_match"] is not None
