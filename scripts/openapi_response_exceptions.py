from __future__ import annotations

from typing import Final

APPROVED_EMPTY_SUCCESS_RESPONSES: Final = frozenset(
    {
        ("/api/v1/activities/{activity_id}", "delete", "204"),
        ("/api/v1/activities/{activity_id}/share", "delete", "204"),
        ("/api/v1/calendar/{event_id}", "delete", "204"),
        ("/api/v1/gear/shoes/{shoe_id}", "delete", "204"),
        ("/api/v1/gear/shoes/{shoe_id}/assign/{activity_id}", "delete", "204"),
        ("/api/v1/goals/{goal_id}", "delete", "204"),
        ("/api/v1/insights/zones", "delete", "204"),
        ("/api/v1/integrations/{source}/disconnect", "delete", "204"),
        ("/api/v1/strength/workout-exercises/{workout_exercise_id}/sets/{set_id}", "delete", "204"),
        ("/api/v1/strength/workouts/{activity_id}", "delete", "204"),
        ("/api/v1/workouts/templates/{template_id}", "delete", "204"),
    }
)
APPROVED_GENERIC_COMPONENT_PATHS: Final = frozenset(
    {
        "/components/schemas/HTTPValidationError/properties/detail/items/properties/ctx",
        "/components/schemas/HTTPValidationError/properties/detail/items/properties/input",
        "/components/schemas/ValidationError/properties/ctx",
        "/components/schemas/ValidationError/properties/input",
        "/components/schemas/WebhookPayload/properties/data",
    }
)
APPROVED_COMPONENT_MAP_SCHEMA_PATHS: Final = frozenset(
    {
        "/components/schemas/CoachContextResponse/properties/data_freshness",
        "/components/schemas/IntensityDistributionResponse/properties/by_zone",
        "/components/schemas/JsonDocument/anyOf/0",
        "/components/schemas/JsonDocument/anyOf/0/additionalProperties/anyOf/0",
        "/components/schemas/JsonDocument/anyOf/1/items/anyOf/0",
        "/components/schemas/AccountExportDocument/properties/athlete/anyOf/0",
        "/components/schemas/AccountExportDocument/properties/resources/items/properties/records/items/anyOf/0",
        "/components/schemas/AccountExportResource/properties/records/items/anyOf/0",
        "/components/schemas/ActivityDetail/properties/raw_data/anyOf/0/anyOf/0",
        "/components/schemas/IntegrationResponse/properties/last_sync_detail/anyOf/0/anyOf/0",
        "/components/schemas/LocalReadinessProvenanceResponse/properties/factor_sources",
        "/components/schemas/LocalReadinessResponse/properties/provenance/properties/factor_sources",
        "/components/schemas/ReadinessResponse/properties/local_readiness/properties/provenance/properties/factor_sources",
        "/components/schemas/SyncRunResponse/properties/detail/anyOf/0/anyOf/0",
        "/components/schemas/WorkoutPredictionRequest/properties/historical_daily_tss",
        "/components/schemas/WorkoutPredictionRequest/properties/planned_workouts",
    }
)
APPROVED_RESPONSE_MAP_SCHEMA_PATHS: Final = frozenset(
    {
        "/content/application/json/schema/properties/raw_data/anyOf/0/anyOf/0",
        "/content/application/json/schema/properties/athlete/anyOf/0",
        "/content/application/json/schema/properties/resources/items/properties/records/items/anyOf/0",
        "/content/application/json/schema/properties/data_freshness",
        "/content/application/json/schema/items/properties/by_zone",
        "/content/application/json/schema/properties/local_readiness/properties/provenance/properties/factor_sources",
        "/content/application/json/schema/items/properties/last_sync_detail/anyOf/0/anyOf/0",
        "/content/application/json/schema/items/properties/detail/anyOf/0/anyOf/0",
        "/content/application/json/schema/properties/last_sync_detail/anyOf/0/anyOf/0",
    }
)
