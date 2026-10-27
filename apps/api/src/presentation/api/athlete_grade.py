from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from pathlib import Path
from typing import Annotated, cast

# PyYAML 是 uvicorn[standard] 带进来的，本身不带 type stub，所以局部忽略 import-untyped。
import yaml  # type: ignore[import-untyped]
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from domain.grading import compute_grade
from infrastructure.auth.models import Athlete
from infrastructure.repositories.athlete_profiles import AthleteProfileRepo
from infrastructure.repositories.race_results import RaceResultRepo
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights", tags=["insights"])

# grading.yaml 在仓库根的 contracts/v1 下：src/presentation/api 往上数五层。
_GRADING_CONTRACT = Path(__file__).resolve().parents[5] / "contracts" / "v1" / "grading.yaml"
_NO_THRESHOLDS = "门槛表未填"
_NO_RESULT = "还没有比赛成绩"
_SEXES = frozenset({"male", "female"})


class GradeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    tier: str
    event: str
    age_group: int
    time_s: int
    race_date: date
    event_name: str
    a1_certified: bool


class AthleteGradeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    configured: bool
    grade: GradeResponse | None = None
    age_graded_pct: float | None = None
    reason: str | None = None


def grading_document() -> Mapping[str, object]:
    """每次请求现读门槛表：表迟早要手填，读缓存只会让改了文件的人以为没生效。"""
    loaded = yaml.safe_load(_GRADING_CONTRACT.read_text(encoding="utf-8"))
    if not isinstance(loaded, Mapping):
        raise TypeError(f"{_GRADING_CONTRACT} 不是 mapping")
    return cast(Mapping[str, object], loaded)


def as_date(value: object) -> date | None:
    return value if isinstance(value, date) else None


def as_sex(value: object) -> str | None:
    """sex 只认 male / female；别的写法进不了门槛表，等于没填。"""
    return value if isinstance(value, str) and value in _SEXES else None


@router.get("/athlete-grade", response_model=AthleteGradeResponse)
async def athlete_grade(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> AthleteGradeResponse:
    profile, _, _ = await AthleteProfileRepo().get_me(athlete.id)
    row = profile or {}
    dob = as_date(row.get("dob"))
    sex = as_sex(row.get("sex"))
    if dob is None or sex is None:
        absent = "、".join(
            name for name, value in (("出生日期", dob), ("性别", sex)) if value is None
        )
        return AthleteGradeResponse(configured=False, reason=f"{absent}没填，年龄组定不下来")
    result = await RaceResultRepo().latest_for_athlete(athlete.id)
    if result is None:
        return AthleteGradeResponse(configured=True, reason=_NO_RESULT)
    event = str(result["distance_category"])
    time_s = cast(int, result["time_s"])
    race_date = cast(date, result["race_date"])
    grade = compute_grade(
        document=grading_document(),
        dob=dob,
        sex=sex,
        event=event,
        time_s=time_s,
        race_date=race_date,
    )
    if grade.tier is None:
        reason = "成绩未达门槛表任何档位" if grade.thresholds_known else _NO_THRESHOLDS
        return AthleteGradeResponse(
            configured=True, age_graded_pct=grade.age_graded_pct, reason=reason
        )
    return AthleteGradeResponse(
        configured=True,
        grade=GradeResponse(
            tier=grade.tier,
            event=event,
            age_group=cast(int, grade.age_group),
            time_s=time_s,
            race_date=race_date,
            event_name=str(result["event_name"]),
            a1_certified=bool(result["a1_certified"]),
        ),
        age_graded_pct=grade.age_graded_pct,
    )
