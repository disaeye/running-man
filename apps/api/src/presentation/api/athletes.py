"""Athlete profile: stable identity fields plus current thresholds.

Thresholds come from ``athlete_thresholds`` (time-versioned) rather than from
columns on ``athletes``. The merge below is deliberate about precedence:

* a value the athlete recorded wins;
* failing that, a measured value from their own data is offered as a fallback
  (resting HR from a wellness upload, maximum observed HR from an activity);
* failing that, the field is ``null`` — never a hard-coded default, because a
  plausible-looking invented threshold silently drives zone boundaries, TSS and
  training advice.

A write to ``PUT /athletes/me`` records a new threshold step dated today,
leaving the value in force for past activities untouched.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from application.thresholds.effective import resolve_effective_thresholds
from domain.thresholds.resolver import ThresholdField
from infrastructure.auth.models import Athlete
from infrastructure.repositories.athlete_profiles import AthleteProfileRepo
from infrastructure.repositories.thresholds import ThresholdRepo
from presentation.api.schemas import AthleteMe
from presentation.api.schemas_core import AthleteProfileUpdate
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/athletes", tags=["athletes"])

_PROFILE_COLS = (
    "name",
    "timezone",
    "dob",
    "sex",
    "weight_goal",
    "weekly_training_days",
    "max_session_duration_min",
    "preferred_sport",
)
_THRESHOLD_COLS: tuple[ThresholdField, ...] = (
    "hr_max",
    "resting_hr",
    "lthr",
    "threshold_pace",
)


@router.get("/me", response_model=AthleteMe)
async def me(athlete: Annotated[Athlete, Depends(get_current_athlete)]) -> AthleteMe:
    row, wellness, _activity_hr = await AthleteProfileRepo().get_me(athlete.id)
    thresholds = await resolve_effective_thresholds(athlete.id)
    data: dict[str, object] = dict(row) if row else {}
    data["id"] = str(athlete.id)
    data.setdefault("email", athlete.email)
    data.update(
        {field: getattr(thresholds, field).value for field in _THRESHOLD_COLS}
    )

    # Wellness supplies body weight for the goal field; the resting-HR and
    # observed-HR fallbacks already live in the shared resolver, so they are not
    # re-applied here (that duplication is what made this endpoint and
    # /insights/zones disagree about HRmax).
    measured = wellness or {}
    if data.get("weight_goal") is None:
        data["weight_goal"] = measured.get("weight")
    return AthleteMe.model_validate(data)


@router.put("/me", response_model=AthleteMe)
async def update_me(
    body: AthleteProfileUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> AthleteMe:
    supplied = body.model_dump(exclude_unset=True)
    notif_prefs = supplied.pop("notification_prefs", None)
    profile_values: dict[str, object] = {
        column: supplied[column]
        for column in _PROFILE_COLS
        if column in supplied
    }
    if notif_prefs is not None:
        profile_values["notification_prefs"] = notif_prefs
    _ = await AthleteProfileRepo().update(athlete.id, profile_values)
    _ = await _record_thresholds(athlete.id, body)
    return await me(athlete)


async def _record_thresholds(athlete_id: object, body: AthleteProfileUpdate) -> int:
    """Persist any threshold fields present in the payload as today's step.

    Uses ``exclude_unset`` so an unrelated profile edit (changing a name, say)
    does not stamp a duplicate threshold row.
    """
    supplied: dict[str, object] = {
        field: value
        for field in _THRESHOLD_COLS
        if (value := getattr(body, field, None)) is not None
    }
    if not supplied:
        return 0
    repo = ThresholdRepo()
    _ = await repo.upsert(
        athlete_id,  # type: ignore[arg-type]
        date.today(),
        supplied,
        source="manual",
    )
    # Also fill earlier rows where this threshold is still empty. Without it a
    # first-ever threshold_pace applies only from today onward, leaving every
    # past run without pace-based TSS (measured: 28 of 29 runs fell back to
    # heart-rate TSS for exactly this reason). Existing readings are not
    # touched, so this widens coverage rather than rewriting history.
    _ = await repo.backfill_earlier_gaps(
        athlete_id,  # type: ignore[arg-type]
        date.today(),
        supplied,
    )
    return len(supplied)
