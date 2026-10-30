"use client";

import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { ActivePlan } from "@features/goals/hooks/useActivePlan";

/**
 * 智能定制新计划工作台（参考稿的 Plan Lab）。
 *
 * 四块：
 *   1. 目标方向选择
 *   2. 跑力标定：VDOT 与五个训练配速区间
 *   3. 训练节奏：每周出勤天数、长距离日
 *   4. 生成按钮
 *
 * 配速区间不是写死的表：它由运动员自己的 VDOT 经 Daniels 的氧气成本
 * 曲线算出，和课表生成器用的是同一套函数，所以页面上写的配速就是
 * 计划里会出现的配速。
 */

interface Props {
  readonly plan: ActivePlan;
  /** 打开课表生成对话框。 */
  readonly onGenerate: () => void;
  readonly canGenerate: boolean;
  readonly onEditGoal: () => void;
  readonly testId?: string;
}

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function DemoPlanLab({ plan, onGenerate, canGenerate, onEditGoal, testId }: Props) {
  const vdot = plan.vdot;
  const paces = plan.training_paces;

  return (
    <Card data-testid={testId ?? "demo-plan-lab"} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-title2 font-semibold text-text-primary">
            跑步训练计划
          </h2>
        </div>
      </div>

      <section className="space-y-2" aria-label="目标赛事">
        <p className="text-caption1 text-text-muted">目标赛事</p>
        <div className="flex flex-wrap gap-2">
          {plan.goal_title ? (
            <span className="rounded-lg bg-accent px-3 py-2 text-body font-semibold text-on-primary">
              {plan.goal_title}
            </span>
          ) : null}
          {plan.race_distance_m != null ? (
            <span className="rounded-lg bg-surface-overlay px-3 py-2 text-body text-text-secondary">
              {(plan.race_distance_m / 1000).toFixed(1)} km
            </span>
          ) : null}
          {plan.target_date ? (
            <span className="rounded-lg bg-surface-overlay px-3 py-2 text-body text-text-secondary">
              {plan.target_date}
            </span>
          ) : null}
        </div>
        {plan.target_date == null || plan.race_distance_m == null ? (
          <div className="space-y-2">
            <p className="text-caption1 text-text-muted">
              填写目标日期与比赛距离后，才能安排训练阶段。
            </p>
            <Button type="button" variant="outline" onClick={onEditGoal} className="w-full">
              补充目标资料
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-2" aria-label="跑力标定">
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption1 text-text-muted">跑力标定（VDOT）</p>
          <span className="font-mono text-caption1 text-accent">
            VDOT {vdot != null ? vdot.toFixed(1) : NO_VALUE}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {paces.length > 0 ? (
            paces.map((pace) => (
              <div
                key={pace.key}
                className="flex flex-col items-center justify-between gap-1 rounded-lg bg-surface-overlay px-1 py-2"
              >
                <span className="font-mono text-caption2 uppercase text-text-muted">
                  {pace.label.split(" ")[0]}
                </span>
                <span className="font-mono text-subheadline font-bold tabular-nums text-text-primary">
                  {formatPaceFromSeconds(pace.min_s_per_km)}
                </span>
                <span className="text-caption2 text-text-muted">
                  {formatPaceFromSeconds(pace.max_s_per_km)}
                </span>
              </div>
            ))
          ) : (
            <p className="col-span-5 text-caption1 text-text-muted">
              没有可用的配速区间：目标里没有比赛成绩，阈值配速也还没确定。
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2" aria-label="训练节奏">
        <p className="text-caption1 text-text-muted">训练节奏</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col justify-between rounded-lg bg-surface-overlay px-3 py-2">
            <p className="text-caption1 text-text-muted">长距离日</p>
            <p className="mt-1 font-mono text-subheadline font-bold text-accent">
              {plan.long_run_day != null
                ? WEEKDAY_NAMES[plan.long_run_day] ?? NO_VALUE
                : NO_VALUE}
            </p>
          </div>
          <div className="flex flex-col justify-between rounded-lg bg-surface-overlay px-3 py-2">
            <p className="text-caption1 text-text-muted">本周训练次数</p>
            <p className="mt-1 font-mono text-subheadline font-bold text-text-primary">
              {plan.week_sessions.length} 次
            </p>
          </div>
        </div>
      </section>

      <Button type="button" onClick={onGenerate} className="w-full" disabled={!canGenerate}>
        调整训练计划
      </Button>

      <p className="text-center text-caption1 text-text-muted">
        配速区间根据当前 VDOT 数据生成。
      </p>
    </Card>
  );
}
