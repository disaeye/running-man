from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from infrastructure.auth.models import Athlete
from infrastructure.repositories.strength import StrengthRepo
from presentation.api.workout_schemas import (
    ExerciseLibraryItem,
    SetCreate,
    SetResponse,
    SetUpdate,
    WorkoutCreate,
    WorkoutCreateResponse,
    WorkoutExerciseCreate,
    WorkoutExerciseResponse,
    WorkoutExerciseUpdate,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/strength", tags=["strength"])


def get_strength_repo() -> StrengthRepo:
    return StrengthRepo()


@router.get("/exercises", response_model=list[ExerciseLibraryItem])
async def list_exercises(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
    category: str | None = None,
    query: str | None = None,
) -> list[ExerciseLibraryItem]:
    _ = athlete
    rows = await repo.list_exercises(category, query)
    return [ExerciseLibraryItem.model_validate(row) for row in rows]


@router.get("/exercises/{exercise_id}", response_model=ExerciseLibraryItem)
async def get_exercise(
    exercise_id: int,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> ExerciseLibraryItem:
    _ = athlete
    row = await repo.get_exercise(exercise_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="exercise not found")
    return ExerciseLibraryItem.model_validate(row)


@router.post("/workouts", response_model=WorkoutCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_workout(
    payload: WorkoutCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> WorkoutCreateResponse:
    activity_id = await repo.create_workout(athlete.id, payload.date, payload.name)
    return WorkoutCreateResponse(activity_id=activity_id)


@router.get("/workouts/{activity_id}/exercises", response_model=list[WorkoutExerciseResponse])
async def list_workout_exercises(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> list[WorkoutExerciseResponse]:
    rows = await repo.list_exercises_in_workout(activity_id)
    return [
        WorkoutExerciseResponse.model_validate(row)
        for row in rows
        if row["athlete_id"] == athlete.id
    ]


@router.post(
    "/workouts/{activity_id}/exercises",
    response_model=WorkoutExerciseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_workout_exercise(
    activity_id: str,
    payload: WorkoutExerciseCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> WorkoutExerciseResponse:
    row = await repo.add_exercise(
        activity_id, athlete.id, payload.exercise_id, payload.order_index, payload.notes
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="workout not found")
    return WorkoutExerciseResponse.model_validate(row)


@router.put("/workout-exercises/{workout_exercise_id}", response_model=WorkoutExerciseResponse)
async def update_workout_exercise(
    workout_exercise_id: int,
    payload: WorkoutExerciseUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> WorkoutExerciseResponse:
    row = await repo.update_exercise(
        workout_exercise_id, athlete.id, payload.notes, payload.order_index
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="workout exercise not found"
        )
    return WorkoutExerciseResponse.model_validate(row)


@router.get("/workout-exercises/{workout_exercise_id}/sets", response_model=list[SetResponse])
async def list_sets(
    workout_exercise_id: int,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> list[SetResponse]:
    if not await repo.owns_workout_exercise(workout_exercise_id, athlete.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="workout exercise not found"
        )
    return [SetResponse.model_validate(row) for row in await repo.list_sets(workout_exercise_id)]


@router.post(
    "/workout-exercises/{workout_exercise_id}/sets",
    response_model=SetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_set(
    workout_exercise_id: int,
    payload: SetCreate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> SetResponse:
    row = await repo.add_set(
        workout_exercise_id,
        athlete.id,
        payload.weight_kg,
        payload.reps,
        payload.rpe,
        payload.set_type,
        payload.rest_seconds,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="workout exercise not found"
        )
    return SetResponse.model_validate(row)


@router.put("/workout-exercises/{workout_exercise_id}/sets/{set_id}", response_model=SetResponse)
async def update_set(
    workout_exercise_id: int,
    set_id: int,
    payload: SetUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> SetResponse:
    if not await repo.owns_workout_exercise(workout_exercise_id, athlete.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="workout exercise not found"
        )
    row = await repo.update_set(set_id, athlete.id, payload.model_dump(exclude_unset=True))
    if row is None or row["workout_exercise_id"] != workout_exercise_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="set not found")
    return SetResponse.model_validate(row)


@router.delete(
    "/workout-exercises/{workout_exercise_id}/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_set(
    workout_exercise_id: int,
    set_id: int,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> Response:
    if not await repo.owns_workout_exercise(workout_exercise_id, athlete.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="workout exercise not found"
        )
    if not await repo.delete_set(set_id, athlete.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="set not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/workouts/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[StrengthRepo, Depends(get_strength_repo)],
) -> Response:
    if not await repo.delete_workout(activity_id, athlete.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="workout not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
