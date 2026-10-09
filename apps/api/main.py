from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Final, Literal

import anyio
from fastapi import FastAPI
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict

from application.computation.queue_worker import start_recompute_worker
from infrastructure.db.pool import close_pool, close_sync_pool, open_pool
from presentation.api import (
    activities,
    activity_analysis,
    activity_flags,
    activity_stats,
    athletes,
    auto_calculate,
    calendar,
    coach_context,
    data_health,
    export,
    gear,
    goals,
    insights,
    insights_ability,
    integrations,
    manual_activity,
    metrics,
    plan,
    pmc,
    race,
    recommendations,
    share,
    strength,
    strength_analytics,
    sync_runs,
    weight,
    wellness,
    workouts,
)
from presentation.api.notifications import router as notifications_router
from presentation.api.zones import router as zones_router
from presentation.auth.routes import router as auth_router
from presentation.errors import register_error_handlers
from presentation.middleware import ApiVersionHeaderMiddleware
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
app.add_middleware(ApiVersionHeaderMiddleware)
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(webhooks_router, prefix=WEBHOOKS_V1_PREFIX)
app.include_router(athletes.router, prefix=API_V1_PREFIX)
app.include_router(pmc.router, prefix=API_V1_PREFIX)
app.include_router(race.router, prefix=API_V1_PREFIX)
app.include_router(plan.router, prefix=API_V1_PREFIX)
app.include_router(activity_stats.router, prefix=API_V1_PREFIX)
app.include_router(activity_flags.router, prefix=API_V1_PREFIX)
app.include_router(activities.router, prefix=API_V1_PREFIX)
app.include_router(manual_activity.router, prefix=API_V1_PREFIX)
app.include_router(activity_analysis.router, prefix=API_V1_PREFIX)
app.include_router(share.router, prefix=API_V1_PREFIX)
app.include_router(calendar.router, prefix=API_V1_PREFIX)
app.include_router(goals.router, prefix=API_V1_PREFIX)
app.include_router(coach_context.router, prefix=API_V1_PREFIX)
app.include_router(data_health.router, prefix=API_V1_PREFIX)
app.include_router(insights_ability.router, prefix=API_V1_PREFIX)
app.include_router(insights.router, prefix=API_V1_PREFIX)
app.include_router(zones_router, prefix=API_V1_PREFIX)
app.include_router(sync_runs.router, prefix=f"{API_V1_PREFIX}/integrations")
app.include_router(integrations.router, prefix=API_V1_PREFIX)
app.include_router(metrics.router, prefix=API_V1_PREFIX)
app.include_router(notifications_router, prefix=API_V1_PREFIX)
app.include_router(recommendations.router, prefix=API_V1_PREFIX)
app.include_router(workouts.router, prefix=API_V1_PREFIX)
app.include_router(strength.router, prefix=API_V1_PREFIX)
app.include_router(strength_analytics.router, prefix=API_V1_PREFIX)
app.include_router(wellness.router, prefix=API_V1_PREFIX)
app.include_router(weight.router, prefix=API_V1_PREFIX)
app.include_router(export.router, prefix=API_V1_PREFIX)
app.include_router(gear.router, prefix=API_V1_PREFIX)
app.include_router(auto_calculate.router, prefix=API_V1_PREFIX)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()
