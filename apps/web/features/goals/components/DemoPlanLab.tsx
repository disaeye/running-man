"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
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
  readonly testId?: string;
}

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function DemoPlanLab({ plan, onGenerate, testId }: Props) {
  const vdot = plan.vdot;
  const paces = plan.training_paces;

  return (
    <Card data-testid={testId ?? "demo-plan-lab"} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <LabelCaps className="text-accent">STRIDE PLAN LAB</LabelCaps>
          <h2 className="mt-1 font-display text-title2 uppercase tracking-wide text-text-primary">
            智能定制新计划
          </h2>
        </div>
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-overlay text-accent"
        >
          ◈
        </span>
      </div>

      <section className="space-y-2" aria-label="目标赛事">
        <p className="text-caption1 text-text-muted">1. 目标赛事 / 竞技方向</p>
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
        {plan.goal_title == null ? (
          <p className="text-caption1 text-text-muted">
            还没有目标。先在目标页创建一个比赛目标，计划才有依据。
          </p>
        ) : null}
      </section>

      <section className="space-y-2" aria-label="跑力标定">
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption1 text-text-muted">2. 跑力标定（VDOT）</p>
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
        <p className="text-caption1 text-text-muted">3. 训练节奏</p>
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

      <button
        type="button"
        onClick={onGenerate}
        className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 font-display text-subheadline font-bold uppercase tracking-wider text-on-primary accent-glow transition-transform active:scale-[0.98]"
      >
        构建并生成训练大纲
      </button>

      <p className="text-center font-mono text-caption1 text-text-muted">
        配速依据 Daniels 氧气成本曲线（VDOT）推导，与课表生成器同一套函数
      </p>
    </Card>
  );
}
