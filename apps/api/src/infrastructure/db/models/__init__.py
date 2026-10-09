"""ORM models — re-exports from core and platform modules."""

from infrastructure.db.models import domain_constraints as domain_constraints
from infrastructure.db.models.athlete import Athlete, LoginAttempt, RevokedToken
from infrastructure.db.models.core import (
    ActivityRecomputeJob,
    ActivitySummary,
    AthleteThreshold,
    HealthWellness,
    TrainingCalendar,
    UserIntegration,
    activity_streams_t,
)
from infrastructure.db.models.definitions import (
    SourceDefinition,
    SportDefinition,
    StreamMetricDefinition,
)
from infrastructure.db.models.derived_metrics import (
    ComputationRun,
    DerivedMetricFact,
    MetricDefinition,
)
from infrastructure.db.models.plan_entities import Goal, Milestone, TrainingPhase, WebhookEvent
from infrastructure.db.models.platform import (
    ActivityLap,
    Notification,
    WorkoutTemplate,
    ZoneOverride,
)
from infrastructure.db.models.sharing import (
    GearAssignment,
    GearShoe,
    NotificationRule,
    ShareToken,
)
from infrastructure.db.models.strength import ExerciseLibrary, WorkoutExercise, WorkoutSet
from infrastructure.db.models.sync import IntegrationSyncError, IntegrationSyncRun, SourceRecord

__all__ = [
    "ActivityLap",
    "ActivityRecomputeJob",
    "ActivitySummary",
    "Athlete",
    "AthleteThreshold",
    "ComputationRun",
    "DerivedMetricFact",
    "ExerciseLibrary",
    "GearAssignment",
    "GearShoe",
    "Goal",
    "HealthWellness",
    "IntegrationSyncError",
    "IntegrationSyncRun",
    "LoginAttempt",
    "MetricDefinition",
    "Milestone",
    "Notification",
    "NotificationRule",
    "RevokedToken",
    "ShareToken",
    "SourceDefinition",
    "SourceRecord",
    "SportDefinition",
    "StreamMetricDefinition",
    "TrainingCalendar",
    "TrainingPhase",
    "UserIntegration",
    "WebhookEvent",
    "WorkoutExercise",
    "WorkoutSet",
    "WorkoutTemplate",
    "ZoneOverride",
    "activity_streams_t",
]
