# 产品设计对照与差距清单

对照对象是《产品定位与迭代计划》（下称"设计文档"）。本文档回答两个问题：当前代码库已经覆盖设计中的哪些部分；从设计走到可交付产品还需要新建与修改哪些部分。所有结论附代码位置作为依据。用户视角的功能完整性判定见 `docs/sync-experience.md` 与 `docs/experience-walkthrough.md`。

## 数据模型对照

设计第 3 节定义 14 个核心对象，当前数据库（`apps/api/alembic/versions/`）的对应情况：

| 设计对象 | 现状 | 依据 |
|---|---|---|
| `Goal` | 已有：`goals`、`milestones`、`training_phases` | `9b1d3c7e8f20_goals_schema.py` |
| `AthleteProfile` | 已有：`athletes`（timezone、weekly_training_days、max_session_duration_min） | `4fa4a6abea41_init_schema.py` |
| `Activity` | 已有：`activity_summary`（按月分区） | 同上 |
| `ActivityStream` | 已有：`activity_streams`，度量登记于 `stream_metric_definitions` | 同上、`d8e9f0a1b2c3` |
| `WorkoutPrescription` | 已有雏形：`training_calendar.workout_prescription`（JSONB，含 segments 步骤、配速区间、phase）；`domain/workout/prescription.py`、`zwo.py` | `application/plan/plan_records.py` |
| `WorkoutExecution` | 缺少：`training_calendar` 只有 done 布尔值，没有活动与处方的关联记录和完成评估 | — |
| `DailyCheckIn` | 已有：`health_wellness`（fatigue、soreness、sleep、mood、readiness、comments） | `4fa4a6abea41` |
| `TrainingPlan` | 部分已有：`training_calendar` + `training_phases`，缺少计划周期与整体版本对象 | — |
| `PlanRevision` | 缺少：计划原地重新生成，event_id 由 goal_id 与日期的 uuid5 决定，重新生成覆盖同一行 | `plan_records.py` |
| `DecisionRecord` | 缺少：训练计划的自动调整尚未实现，也没有用户确认、拒绝与授权记录 | — |
| `IntegrationConnection` | 已有：`user_integrations`（凭据加密存储） | `a1b2c3d4e5f6` |
| `SyncJob` | 已有：`integration_sync_runs` + `integration_sync_errors` | `e9f0a1b2c3d4` |
| `SourceActivity` | 已有：`source_records`（payload_hash、last_seen_at、状态标记） | 同上 |
| `ActivityMetric` | 已有：`derived_metric_facts` + `metric_definitions` + `computation_runs` | `6d7e8f9a0b1c` |

指标溯源已经完整实现设计第 4 节的要求：`computation_runs` 保存 input_fingerprint、algorithm_version（semver 约束）、trigger、状态；`derived_metric_facts` 保存 method 与 confidence；`current_derived_metric_facts` 视图提供当前有效值；同一指纹重复计算直接跳过。

## 已经具备的能力

- 同步链路：Intervals.icu 客户端、增量同步（游标为最新活动日期加一天）、14 天回看窗口、幽灵活动清理（reconcile_ghosts）、payload_hash 与 secondary duplicate 去重。
- 计算层：`application/computation` 按运动员加计算种类加锁，指纹命中跳过，成功与失败都留记录。
- 处方生成：`domain/workout/plan_generator.py` 有质量训练相邻检查、休息日、可用训练日、周 TSS 预算；处方带结构化 segments。
- 恢复调整：已接通。`domain/insights/load_adjustment.py` 依据 HRV 七日基线与长距离心率漂移触发，`application/plan/adjustment_pipeline.py` 挂在活动计算链末尾自动为未来 48 小时的课生成待确认建议；日历课表在运动员确认前保持原样，确认后按比例缩减时长与距离并重算 quality_target（`plan_adjustment_rules.scaled_prescription`）。
- 生理估计：`domain/physiology`（HRmax、LTHR、临界速度），无 numpy 与 scipy 依赖。
- 指标登记：`scripts/generate_data_contract.py` 生成统一 registry（分类、单位、区间、null 语义、说明），前后端共享（`metric-registry.ts`、`domain/generated/metrics.py`）。
- 前端：Orval 从 OpenAPI 生成客户端并经 zod 校验（`shared/api/generated`、`orval-adapter`）；五个导航入口与 `features/` 目录和设计第 2 节一一对应；ECharts 与 Playwright 已在用。
- 工程与部署：`contracts/v1/openapi.json` 导出与兼容性检查（`scripts/run_gates.py`）、同域 HttpOnly Cookie、systemd user units。

## 需要新建的部分

1. `WorkoutExecution` 与完成评估：活动与处方的关联表，训练量、强度、主要步骤的评估，关联存在歧义时交给用户确认。属于设计阶段三的核心。（关联链路已接通：手动录入经 `event_id`、同步活动经 `POST /api/v1/calendar/{event_id}/link` 与日视图的关联区块，五对象分类结果写入 `training_calendar.session_classification`；独立关联表待建。）
2. ~~`PlanRevision` 与 `DecisionRecord`~~：`plan_revisions` 表已建，每次生成写入整份快照（课表与阶段），`training_calendar.revision_id` 指向所属版本，已完成或手动修改的行保留当时处方；单课调整的决策记录由 `plan_adjustments` 承载（pending / applied / reverted）。
3. MapLibre GL JS：当前路线展示由 `features/activity` 的自有实现承担，设计指定 MapLibre，属于新依赖。
4. Celery + Redis：pyproject 无相关依赖；当前后台工作由请求内计算与 recompute worker（API lifespan 内启动）承担。属于新增部署组件，引入前需确认主机资源与运维方式。
5. S3 兼容对象存储：原始数据当前存 `activity_summary.raw_data` JSONB；设计要求大型原始文件与时序文件外置存储。

## 两个语义冲突

1. ACWR 展示语义。设计明确“ACWR 不用于输出个人受伤概率”。当前 metric registry 中 acwr 的分区命名为“安全区”与“损伤风险”（大于 1.5 一档），以受伤概率的口吻呈现；registry 的 note 字段已写明损伤预测效力存在争议，说明问题已被识别，分区命名尚未按此调整。修改位置是 registry 的源定义（`generate_data_contract.py` 的输入），分区说明改为描述负荷变化速率本身，并按设计第 5 节为健康类提示补充行动指引。
2. ~~计划覆盖式生成~~：`plan_revisions` 已引入版本化写入；已完成与手动修改的行保留原版本处方，重生成产生新版本并可在目标页的「计划版本」里查看历史快照。

## 迭代阶段与现状对照

| 阶段 | 现状 | 主要缺口 |
|---|---|---|
| 一 可靠记录与活动回顾 | 同步、活动列表详情、导出、分享基本运行 | 同步体验缺口（见 `docs/sync-experience.md`）；隐私控制与导出默认项 |
| 二 理解积累与能力变化 | 周统计、PMC、insights、生理估计已有 | 训练连续性指标、阶段报告导出 |
| 三 完整训练计划 | 目标、生成器、日历、处方、计划版本已有 | `WorkoutExecution` 独立关联表 |
| 四 动态调整 | HRV/心率漂移触发、待确认、按比例缩减、自动检测已接通 | 更多触发输入（TSB、readiness）与自动调整授权设置 |
| 五 个体化验证 | 阶段里程碑自动核验（阶段累计跑量） | 阶段能力检查、个人参数更新、长期报告 |
