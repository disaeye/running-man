# Running Man API 接口文档（v1）

> 唯一事实来源：`contracts/v1/openapi.json`（OpenAPI 3.1.0，92 条路径 / 114 个操作）。
> 该文件由 `scripts/export_openapi.py --app main:app --output contracts/v1/openapi.json` 生成，
> `scripts/run_gates.py` 中的 "openapi contract drift" 门禁会校验它未漂移。
> 本文件是其可读版；字段级细节以 openapi.json 为准。

## 1. 基础信息

| 项 | 值 |
|---|---|
| 本机基址 | `http://localhost:18000` |
| 公网域名 | `https://running-man.mysour.world`（API-only，`/` 返回 404 属正常） |
| 前端同源入口 | `https://running-man-ten.vercel.app`（Next.js rewrite `/api/*`、`/auth/*`、`/webhooks/*`） |
| 版本边界 | 业务接口仅在 `/api/v1/*`，webhook 在 `/webhooks/v1/*`，`/health` 不带版本 |
| 文档 | `GET /docs`（Swagger UI）、`GET /openapi.json` |
| 版本响应头 | 所有响应带 `X-API-Version: 1` |

扁平旧路径（`/api/pmc`、`/auth/login`、`/webhooks/intervals`）已废弃并返回 404，不是别名。

## 2. 认证

Cookie 会话制：登录成功后服务端下发 `access_token`（HttpOnly + SameSite=lax JWT）。

- 浏览器端由前端 Next.js middleware 检查 `access_token`；
- 脚本/服务端调用直接带 `Cookie: access_token=<token>`；
- 未带或失效 → `401 AUTH_ERROR`。

公开接口（无需 Cookie）：`GET /health`、`GET /api/v1/share/{token}`、
`GET|POST /api/v1/race/predict`、`POST /webhooks/v1/intervals`（用 payload 里的 `secret` 校验）。
其余 109 个操作全部需要登录。

## 3. 错误格式

所有错误统一为（同时保留顶层 `detail` 兼容旧解析）：

```json
{ "error": { "code": "NOT_FOUND", "message": "resource not found" }, "detail": "resource not found" }
```

| code | HTTP | 含义 |
|---|---|---|
| `VALIDATION_ERROR` | 400 / 422 | 参数或请求体校验失败 |
| `AUTH_ERROR` | 401 | 缺少/非法 access_token |
| `FORBIDDEN` | 403 | 无权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 资源冲突/已存在 |
| `TOO_MANY_REQUESTS` | 429 | 限流 |
| `ERROR` | 其他 | 兜底 |

## 4. 通用约定

- 兼容策略：同版本内**只增不改**，客户端必须忽略未知字段。
- 写操作支持 `GET` 响应缓存之外不受影响；`GET /api/v1/*` 有 5 秒进程内响应缓存（按路径+查询串+token subject 分键）。
- 日期参数 `from`/`to` 为 `date`（`YYYY-MM-DD`）；日历接口为 `date-time`。
- 分页：多数列表接口用 `limit`（如 sync-runs 默认 50），无统一 offset 分页。
- 运动类型 `sport` 取值见 `contracts/v1/sports.yaml` 与前端 `shared/config/sport-config.ts`。

## 5. 接口索引

响应列为 OpenAPI 中的 `200/201` schema（`$ref` 指向 `components.schemas`）。

### 5.1 认证 auth

| 方法 | 路径 | 说明 | 请求体 → 响应 |
|---|---|---|---|
| POST | `/api/v1/auth/register` | 注册（201） | `RegisterRequest` → `AthleteResponse` |
| POST | `/api/v1/auth/login` | 登录并 Set-Cookie | `LoginRequest` → `LoginResponse` |
| POST | `/api/v1/auth/refresh` | 刷新会话 | — → `LoginResponse` |
| POST | `/api/v1/auth/logout` | 登出并清 Cookie | — → `LoginResponse` |
| DELETE | `/api/v1/auth/delete-account` | 注销账号 | — → `AccountDeleteResponse` |

### 5.2 运动员与生理指标 athletes

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/athletes/me` | — | `AthleteMe` |
| PUT | `/api/v1/athletes/me` | — | `AthleteProfileUpdate` → `AthleteMe` |
| POST | `/api/v1/athletes/me/auto-calculate` | — | `AutoCalculateResponse`（HRmax/LTHR/阈值配速估算） |
| GET | `/api/v1/athletes/me/physiology` | — | `PhysiologyResponse`（含 freshness/confidence） |

### 5.3 活动 activities

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/activities` | `from*`, `to*` | `ActivitySummary[]` |
| GET | `/api/v1/activities/{activity_id}` | — | `ActivityDetail` |
| POST | `/api/v1/activities/upload` | — | multipart（FIT/GPX/TCX）→ `ActivitySummary`（201） |
| POST | `/api/v1/activities/batch-upload` | — | multipart → `BatchUploadResponse` |
| DELETE | `/api/v1/activities` | `source` | `BulkDeleteResponse` |
| DELETE | `/api/v1/activities/{activity_id}` | — | 204 无响应体 |
| GET | `/api/v1/activities/{activity_id}/streams` | — | `StreamPoint[]` |
| GET | `/api/v1/activities/{activity_id}/laps` | — | `LapResponse[]` |
| GET | `/api/v1/activities/{activity_id}/analysis` | — | `ActivityAnalysisResponse` |
| GET | `/api/v1/activities/{activity_id}/export` | `format*` = `fit`\|`tcx` | 文件流（非 JSON） |
| GET | `/api/v1/activities/stats` | `from`, `to`, `sport` | `ActivityStatsResponse` |
| POST | `/api/v1/activities/{activity_id}/share` | — | `ShareCreateResponse` |
| DELETE | `/api/v1/activities/{activity_id}/share` | — | 204 |
| GET | `/api/v1/share/{token}` | 公开 | `PublicActivityResponse` |

### 5.4 训练负荷与洞察 insights / pmc

| 方法 | 路径 | 参数 | 响应 |
|---|---|---|---|
| GET | `/api/v1/pmc` | `from*`, `to*`, `sport` | `PmcPointResponse[]` |
| GET | `/api/v1/insights/readiness` | `date*` | `ReadinessResponse` |
| GET | `/api/v1/insights/recommendation` | `date*` | `TrainingRecommendationResponse` |
| GET | `/api/v1/insights/ability` / `/ability/current` | — | `AbilityPointResponse[]` / `AbilitySnapshotResponse` |
| GET | `/api/v1/insights/intensity-distribution` | `from`, `to` | `IntensityDistributionResponse[]` |
| GET | `/api/v1/insights/personal-records` | `sport` | `RunPersonalRecordResponse \| RidePersonalRecordResponse[]` |
| GET | `/api/v1/insights/hard-days` | `from`, `to` | `HardDayRangeResponse[]` |
| GET | `/api/v1/insights/weekly-progress` | `from`, `to` | `WeeklyProgressResponse[]` |
| GET | `/api/v1/insights/plan-quality` | `from`, `to` | `PlanQualityResponse` |
| GET | `/api/v1/insights/taper` | `from`, `to`, `race_date` | `TaperResponse` |
| GET | `/api/v1/insights/coach-context` | `date*` | `CoachContextResponse` |
| GET/POST | `/api/v1/insights/ftp-history` / `/ftp` | — | `FtpHistoryItemResponse[]` / `FtpHistoryItemResponse` |
| POST | `/api/v1/insights/ftp/detect` | `days` | `FtpDetectionResponse \| null` |
| POST | `/api/v1/insights/recompute` | — | `RecomputeRequest` → `RecomputeResponse` |
| GET/PUT/DELETE | `/api/v1/insights/zones` | — | `ZonesResponse` / `ZoneOverrideUpdateResponse` / 204 |
| GET | `/api/v1/recommendations` | — | `RecommendationItemResponse[]` |

### 5.5 指标序列 metrics

| 方法 | 路径 | 参数 | 响应 |
|---|---|---|---|
| GET | `/api/v1/metrics/series` | `metric*`(枚举), `grain*`(daily\|weekly), `from*`, `to*`, `sport` | `MetricSeriesResponse` |
| GET | `/api/v1/metrics/series/batch` | `metrics*`(逗号分隔), `grain*`, `from*`, `to*`, `sport` | `MetricSeriesBatchResponse` |

`metric` 枚举（32 项）：`acwr, aerobic_decoupling_pct, atl, avg_hr, cadence, ctl, daily_tss,
detected_ftp, distance_m, duration_s, efficiency_factor, gap_avg, hr_max, hrv, intensity_factor,
local_readiness, lthr, normalized_graded_pace, normalized_power, resting_hr, rtss, sleep_secs,
source_readiness, source_training_load, source_weighted_power_w, threshold_pace, tsb, tss, vdot, weight`。
单位/精度/空值语义定义在 `contracts/v1/metrics.yaml`。

### 5.6 日历与计划 calendar / plan

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/calendar` | `from*`, `to*`（date-time） | `CalendarEvent-Output[]` |
| POST | `/api/v1/calendar` | — | `CalendarEventCreate` → `CalendarEvent-Output`（201） |
| PUT/DELETE | `/api/v1/calendar/{event_id}` | — | `CalendarEventUpdate` → 同上 / 204 |
| GET | `/api/v1/plan/periodization` | `goal_id*` | `TrainingPhaseResponse[]` |
| POST | `/api/v1/plan/generate` | `dry_run` | `PlanGenerateRequest` → `PlanGenerateResponse` |
| GET | `/api/v1/workouts/templates` | `sport`, `goal` | `WorkoutTemplateResponse[]` |
| POST | `/api/v1/workouts/templates` | — | `WorkoutTemplateCreate` → `WorkoutTemplateResponse`（201） |
| PUT/DELETE | `/api/v1/workouts/templates/{template_id}` | — | `WorkoutTemplateUpdate` → 同上 / 204 |
| POST | `/api/v1/workouts/predict` | — | `WorkoutPredictionRequest` → `WorkoutPredictionPoint[]` |

### 5.7 目标 goals

| 方法 | 路径 | 请求体 → 响应 |
|---|---|---|
| GET / POST | `/api/v1/goals` | `GoalCreate` → `GoalResponse`（201） |
| GET / PUT / DELETE | `/api/v1/goals/{goal_id}` | `GoalUpdate` → `GoalResponse` / 204 |
| POST | `/api/v1/goals/{goal_id}/refresh` | `GoalResponse` |
| POST | `/api/v1/goals/refresh-all` | `GoalResponse[]` |
| GET / POST | `/api/v1/goals/{goal_id}/milestones` | `MilestoneCreate` → `MilestoneResponse`（201） |
| PUT | `/api/v1/goals/{goal_id}/milestones/{milestone_id}` | `MilestoneUpdate` → `MilestoneResponse` |

### 5.8 力量训练 strength

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/strength/exercises` | `category`, `query` | `ExerciseLibraryItem[]`（只读库） |
| GET | `/api/v1/strength/exercises/{exercise_id}` | — | `ExerciseLibraryItem` |
| POST | `/api/v1/strength/workouts` | — | `WorkoutCreate` → `WorkoutCreateResponse`（201） |
| DELETE | `/api/v1/strength/workouts/{activity_id}` | — | 204 |
| GET / POST | `/api/v1/strength/workouts/{activity_id}/exercises` | — | `WorkoutExerciseResponse[]` / `WorkoutExerciseResponse`（201） |
| PUT | `/api/v1/strength/workout-exercises/{workout_exercise_id}` | — | `WorkoutExerciseUpdate` → `WorkoutExerciseResponse` |
| GET / POST | `/api/v1/strength/workout-exercises/{id}/sets` | — | `SetResponse[]` / `SetResponse`（201） |
| PUT / DELETE | `/api/v1/strength/workout-exercises/{id}/sets/{set_id}` | — | `SetUpdate` → `SetResponse` / 204 |
| GET | `/api/v1/strength/analytics/e1rm` | `from`, `to` | `E1rmTrendResponse[]` |
| GET | `/api/v1/strength/analytics/muscle-volume` | `from`, `to` | `MuscleVolumeResponse[]` |
| GET | `/api/v1/strength/analytics/distribution` | `from`, `to` | `MuscleDistributionResponse[]` |

### 5.9 健康与体重 wellness / weight

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/wellness` | `from*`, `to*` | `WellnessEntryResponse[]` |
| GET | `/api/v1/wellness/sleep` | `from*`, `to*` | `SleepAnalysisResponse` |
| GET | `/api/v1/weight` | `from*`, `to*` | `WeightListResponse` |
| POST | `/api/v1/weight` | — | `WeightUpsert` → `WeightEntryResponse`（201） |
| DELETE | `/api/v1/weight/{target_date}` | — | `WeightDeleteResponse` |

### 5.10 装备 gear

| 方法 | 路径 | 请求体 → 响应 |
|---|---|---|
| GET / POST | `/api/v1/gear/shoes` | `ShoeCreate` → `ShoeResponse`（201） |
| GET / PUT / DELETE | `/api/v1/gear/shoes/{shoe_id}` | `ShoeUpdate` → `ShoeResponse` / 204 |
| POST | `/api/v1/gear/shoes/{shoe_id}/assign` | `ShoeAssignmentCreate` → `ShoeAssignmentResponse`（201） |
| DELETE | `/api/v1/gear/shoes/{shoe_id}/assign/{activity_id}` | 204 |

### 5.11 数据接入与同步 integrations

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/integrations` | — | `IntegrationResponse[]` |
| GET | `/api/v1/integrations/{source}` | — | `IntegrationResponse` |
| PUT | `/api/v1/integrations/{source}/connect` | — | `ConnectIntegrationRequest` → `IntegrationResponse` |
| DELETE | `/api/v1/integrations/{source}/disconnect` | — | 204 |
| PUT | `/api/v1/integrations/{source}/settings` | — | `IntegrationSettingsUpdate` → `IntegrationResponse` |
| POST | `/api/v1/integrations/{source}/sync` | — | `IntegrationSyncResponse`（后台任务） |
| POST | `/api/v1/integrations/{source}/oauth-url` | `source=strava` | `StravaOAuthUrlRequest` → `OAuthUrlResponse` |
| GET | `/api/v1/integrations/sync-runs` | `source`, `status`, `limit`=50 | `SyncRunResponse[]` |
| GET | `/api/v1/data/health` | — | `DataHealthResponse` |
| GET | `/api/v1/data/quality` | — | `DataQualityResponse` |
| POST | `/webhooks/v1/intervals` | 公开（`secret` 校验） | `WebhookPayload` → `WebhookAckResponse` |

`source` 取值：`intervals_icu`、`strava`（strava 已弃用，待移除）。

### 5.12 通知、导出、赛跑预测、健康检查

| 方法 | 路径 | 参数 | 请求体 → 响应 |
|---|---|---|---|
| GET | `/api/v1/notifications` | `unread_only` | `NotificationResponse[]` |
| POST | `/api/v1/notifications/{notification_id}/read` | — | `NotificationReadResponse` |
| POST | `/api/v1/notifications/read-all` | — | `NotificationReadAllResponse` |
| POST | `/api/v1/notifications/scan` | — | `NotificationScanResponse` |
| GET | `/api/v1/export` | — | `AccountExportManifestResponse` |
| GET | `/api/v1/export/account.json` | — | `AccountExportDocument` |
| GET | `/api/v1/export/activities.csv` | `from*`, `to*` | CSV 文件流 |
| GET | `/api/v1/export/workout.zwo` | `event_id*` | ZWO 文件流 |
| GET / POST | `/api/v1/race/predict` | 公开 | `PredictRequest` → `RacePredictionResponse` |
| GET | `/health` | 公开 | `HealthResponse` |

## 6. 关键 Schema 摘要

- `LoginRequest`: `{ email: string, password: string }`（`additionalProperties: false`）
- `LoginResponse`: `{ ok: boolean = true }`（真实凭证在 Set-Cookie）
- `AthleteMe`: `id, email, name, dob, hr_max, preferred_sport, max_session_duration_min(=120), notification_prefs …`
- `PmcPointResponse`: `day, ctl, atl, tsb, tss(必填) + acwr, algorithm_version(=1.0.0), mode`
  - `mode`: `authoritative_all_sports` | `approximate_sport_filtered`
- `ReadinessResponse`: `{ local_readiness: LocalReadinessResponse, source_readiness: SourceReadinessResponse | null }`
- `AutoCalculateResponse`: `{ hr_max, lthr, threshold_pace }`（各自带置信度/样本信息）
- `PhysiologyResponse`: `hr_max, lthr, threshold_pace, algorithm_version, computation_run_id, freshness(fresh|stale), confidence(cached|stale), data_sufficient`

完整 167 个 schema 见 `contracts/v1/openapi.json#/components/schemas`，业务语义见
`contracts/v1/{metrics,sports,sources,stream-metrics,algorithms,readiness-bands}.yaml` 与 `SCHEMA.md`。

## 7. 前端调用方式

`apps/web` 通过 Next.js rewrite 同源访问，无需感知后端地址：

```
/api/:path*      → ${API_URL}/api/:path*        （API_URL=https://running-man.mysour.world）
/auth/:path*     → ${API_URL}/auth/:path*
/webhooks/:path* → ${API_URL}/webhooks/:path*
```

数据 hook 用 SWR（`revalidateOnFocus: false`），变更用 `apiFetch` + `mutate()`。

## 8. 本地查看与校验

```bash
cd apps/api && .venv/bin/python ../../scripts/export_openapi.py --app main:app --output ../../contracts/v1/openapi.json
python3 scripts/check_openapi_compatibility.py contracts/v1/openapi.json contracts/v1/openapi.json --json
curl -s http://localhost:18000/openapi.json | python3 -m json.tool | less
```
