from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Integer, Numeric, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP, UUID

from infrastructure.db import Base


class ExerciseLibrary(Base):
    __tablename__ = "exercise_library"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name_cn = Column(Text, nullable=False)
    name_en = Column(Text, nullable=False, unique=True)
    category = Column(Text, nullable=False)
    primary_muscles: Column[list[str]] = Column(ARRAY(Text), nullable=False)
    secondary_muscles: Column[list[str]] = Column(ARRAY(Text), nullable=True)
    equipment = Column(Text, nullable=True)
    movement_pattern = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    common_mistakes = Column(Text, nullable=True)
    difficulty = Column(Text, nullable=True, server_default="intermediate")


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_id = Column(Text, nullable=False)
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercise_library.id"), nullable=True)
    order_index = Column(Integer, nullable=True, server_default="0")
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint(
            "set_number > 0 AND reps > 0 "
            "AND (weight_kg IS NULL OR weight_kg >= 0) "
            "AND (estimated_1rm_kg IS NULL OR estimated_1rm_kg >= 0) "
            "AND (rpe IS NULL OR rpe BETWEEN 1 AND 10) "
            "AND (rest_seconds IS NULL OR rest_seconds >= 0)",
            name="ck_workout_sets_physical",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workout_exercise_id = Column(
        Integer,
        ForeignKey("workout_exercises.id", ondelete="CASCADE"),
        nullable=False,
    )
    athlete_id = Column(UUID(as_uuid=True), ForeignKey("athletes.id"), nullable=False)
    set_number = Column(Integer, nullable=False)
    weight_kg = Column(Numeric(6, 2), nullable=True)
    reps = Column(Integer, nullable=False)
    rpe = Column(Numeric(3, 1), nullable=True)
    set_type = Column(Text, nullable=True, server_default="working")
    rest_seconds = Column(Integer, nullable=True)
    completed = Column(Boolean, nullable=True, server_default=text("true"))
    estimated_1rm_kg = Column(Numeric(6, 2), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=text("now()"))
