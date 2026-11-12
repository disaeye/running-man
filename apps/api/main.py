from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Final, Literal

import anyio
from fastapi import FastAPI
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict

from application.computation.queue_worker import start_recompute_worker
from application.integrations.sync_jobs import retire_abandoned_jobs
from infrastructure.db.pool import close_pool, close_sync_pool, open_pool
from presentation.api import (
    activities,
    activity_analysis,
    activity_flags,
    activity_rpe,
    activity_stats,
    athlete_grade,
    athletes,
    auto_calculate,
    calendar,
    coach_context,
    data_health,
    export,
    gear,
    goal_result_api,
    goals,
    insights,
    insights_ability,
    integrations,
    manual_activity,
    metrics,
    personal_range,
    plan,
    plan_adjustments,
    plan_state,
    pmc,
    race,
    race_results,
    run_classifications,
    share,
    strength,
    sync_runs,
    weight,
    wellness,
    workouts,
)
from presentation.api.notifications import router as notifications_router
from presentation.api.strength_analytics import router as strength_analytics_router
from presentation.api.zones import router as zones_router
from presentation.auth.routes import router as auth_router
from presentation.errors import register_error_handlers
from presentation.middleware import ApiVersionHeaderMiddleware, ErrorHandlingMiddleware
from presentation.webhooks.routes import router as webhooks_router

API_V1_PREFIX: Final = "/api/v1"
WEBHOOKS_V1_PREFIX: Final = "/webhooks/v1"


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: Literal["ok"] = "ok"


def _operation_id(route: APIRoute) -> str:
    path = route.path_format.strip("/").replace("/", "_").replace("{", "").replace("}", "")
    method = "_".join(sorted(route.methods or ())).lower()
    return f"{route.name}_{path}_{method}"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    await open_pool()
    # No sync executor survives a restart, so any job still marked queued or
    # running belongs to the previous process and has to be retired before this
    # one starts serving; otherwise it would refuse every new trigger.
    _ = await retire_abandoned_jobs()
    async with anyio.create_task_group() as task_group:
        await start_recompute_worker(task_group)
        try:
            yield
        finally:
            task_group.cancel_scope.cancel()
    close_sync_pool()
    await close_pool()


app = FastAPI(
    title="Running Man API",
    version="1.0.0",
    lifespan=lifespan,
    generate_unique_id_function=_operation_id,
)
register_error_handlers(app)
# The error layer is added last, which makes it the outermost user middleware: it
# sees every exception the inner stack raises, including one thrown by another
# middleware, and answers with the shared envelope plus the version header.
app.add_middleware(ApiVersionHeaderMiddleware)
app.add_middleware(ErrorHandlingMiddleware)
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(webhooks_router, prefix=WEBHOOKS_V1_PREFIX)
app.include_router(athletes.router, prefix=API_V1_PREFIX)
app.include_router(pmc.router, prefix=API_V1_PREFIX)
app.include_router(race.router, prefix=API_V1_PREFIX)
app.include_router(plan.router, prefix=API_V1_PREFIX)
app.include_router(plan_state.router, prefix=API_V1_PREFIX)
app.include_router(plan_adjustments.router, prefix=API_V1_PREFIX)
app.include_router(activity_stats.router, prefix=API_V1_PREFIX)
app.include_router(activity_flags.router, prefix=API_V1_PREFIX)
app.include_router(activity_rpe.router, prefix=API_V1_PREFIX)
app.include_router(run_classifications.router, prefix=API_V1_PREFIX)
app.include_router(activities.router, prefix=API_V1_PREFIX)
app.include_router(manual_activity.router, prefix=API_V1_PREFIX)
app.include_router(activity_analysis.router, prefix=API_V1_PREFIX)
app.include_router(share.router, prefix=API_V1_PREFIX)
app.include_router(calendar.router, prefix=API_V1_PREFIX)
app.include_router(goals.router, prefix=API_V1_PREFIX)
app.include_router(goal_result_api.router, prefix=API_V1_PREFIX)
app.include_router(coach_context.router, prefix=API_V1_PREFIX)
app.include_router(data_health.router, prefix=API_V1_PREFIX)
app.include_router(insights_ability.router, prefix=API_V1_PREFIX)
app.include_router(personal_range.router, prefix=API_V1_PREFIX)
app.include_router(insights.router, prefix=API_V1_PREFIX)
app.include_router(zones_router, prefix=API_V1_PREFIX)
app.include_router(sync_runs.router, prefix=f"{API_V1_PREFIX}/integrations")
app.include_router(integrations.router, prefix=API_V1_PREFIX)
app.include_router(metrics.router, prefix=API_V1_PREFIX)
app.include_router(notifications_router, prefix=API_V1_PREFIX)
app.include_router(workouts.router, prefix=API_V1_PREFIX)
app.include_router(strength.router, prefix=API_V1_PREFIX)
app.include_router(strength_analytics_router, prefix=API_V1_PREFIX)
app.include_router(wellness.router, prefix=API_V1_PREFIX)
app.include_router(weight.router, prefix=API_V1_PREFIX)
app.include_router(export.router, prefix=API_V1_PREFIX)
app.include_router(gear.router, prefix=API_V1_PREFIX)
app.include_router(race_results.router, prefix=API_V1_PREFIX)
app.include_router(athlete_grade.router, prefix=API_V1_PREFIX)
app.include_router(auto_calculate.router, prefix=API_V1_PREFIX)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()
