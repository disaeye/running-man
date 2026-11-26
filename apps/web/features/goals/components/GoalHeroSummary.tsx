"use client";

import useSWR from "swr";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { Stat } from "@shared/ui/StatCell";
import { Tag } from "@shared/ui/Badge";
import { CountUp } from "@shared/ui/CountUp";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { TextLink } from "@shared/ui/TextLink";
import { formatClock, formatPaceFromSeconds } from "@shared/lib/format";
import { apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { Goal } from "@shared/types/goals";

interface PredictionResponse {
  predictions: { label: string; distance_m: number; time_s: number }[];
  confidence: string | null;
  data_sufficient: boolean;
}

export function GoalHeroSummary({
  goal,
  days,
  today,
}: {
  goal: Goal;
  days: number | null;
  today?: string;
}) {
  const records = usePersonalRecords();
  const { data: prediction } = useSWR<PredictionResponse>(
    "/race/predict",
    () => apiFetch<PredictionResponse>("/race/predict"),
    { shouldRetryOnError: false },
  );
  const pb = records.data.find((record) => goal.race_distance_m != null && record.type.includes(distanceKey(goal.race_distance_m)))?.value_formatted ?? NO_VALUE;
  const predicted = prediction?.predictions.find((point) =>
    goal.race_distance_m != null && Math.abs(point.distance_m - goal.race_distance_m) <= 50,
  );

  const isAchieved = goal.status === "achieved";
  const isAbandoned = goal.status === "abandoned";
  const isPastDue = Boolean(today && goal.target_date && goal.target_date < today && goal.status === "active");
  const isRaceDay = Boolean(today && goal.target_date && goal.target_date === today && goal.status === "active");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-52">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{goal.type === "event" ? "比赛目标" : "训练目标"}</span>
            {goal.is_primary ? <Tag tone="primary">主目标</Tag> : null}
          </div>
          <h2 className="num mt-1 text-3xl font-bold">{goal.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {goal.target_date ?? "尚未设置比赛日期"}
            {goal.race_distance_m ? ` · ${(goal.race_distance_m / 1000).toFixed(2)} km` : ""}
          </p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right max-sm:ml-auto">
          {isAchieved ? (
            <>
              <div className="num text-2xl font-bold text-success sm:text-3xl">已完赛</div>
              {goal.race_actual_time_s != null ? (
                <div className="num text-xs text-muted-foreground">{formatClock(goal.race_actual_time_s)}</div>
              ) : null}
            </>
          ) : isAbandoned ? (
            <div className="text-2xl font-bold text-text-muted sm:text-3xl">已放弃</div>
          ) : isPastDue ? (
            <>
              <div className="text-xl font-bold text-warn sm:text-2xl">已到赛期</div>
              <div className="text-xs text-muted-foreground">待记录完赛成绩</div>
            </>
          ) : isRaceDay ? (
            <>
              <div className="text-2xl font-bold text-accent-strong sm:text-3xl">比赛日</div>
              <div className="text-xs text-muted-foreground">就在今天</div>
            </>
          ) : days == null ? (
            <div className="text-subheadline font-medium text-text-muted">{NO_VALUE}</div>
          ) : (
            <>
              <div className="num text-5xl font-bold text-accent-strong">
                <CountUp value={days} />
              </div>
              <div className="text-xs text-muted-foreground">天后</div>
            </>
          )}
        </div>
      </div>
      <div
        className={`mt-4 grid gap-2.5 ${
          isAchieved && goal.race_actual_time_s != null ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
        }`}
      >
        {isAchieved && goal.race_actual_time_s != null ? (
          <div className="rounded-xl bg-surface-overlay p-3">
            <Stat
              label="实测成绩"
              value={formatClock(goal.race_actual_time_s)}
              tone="text-success"
              sub={
                goal.race_distance_m
                  ? `均配速 ${formatPaceFromSeconds(Math.round(goal.race_actual_time_s / (goal.race_distance_m / 1000)))}/km`
                  : undefined
              }
            />
          </div>
        ) : null}
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat
            label="目标成绩"
            value={goal.race_target_time_s ? formatClock(goal.race_target_time_s) : "未设置"}
            sub={
              goal.race_target_time_s && goal.race_distance_m
                ? `目标配速 ${formatPaceFromSeconds(Math.round(goal.race_target_time_s / (goal.race_distance_m / 1000)))}/km`
                : undefined
            }
          />
        </div>
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat label="历史 PB" value={pb} />
        </div>
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat
            label={
              <>
                当前预测
                <MetricInlineDisclosure
                  label="当前预测"
                  explanation={{ summary: "基于近期个人最好成绩推算。", note: "实际成绩受路线、天气和补给影响。" }}
                />
              </>
            }
            value={predicted ? formatClock(predicted.time_s) : NO_VALUE}
            tone={predicted ? "text-warn" : ""}
            sub={
              predicted && goal.race_distance_m
                ? `预测配速 ${formatPaceFromSeconds(Math.round(predicted.time_s / (goal.race_distance_m / 1000)))}/km`
                : undefined
            }
          />
        </div>
      </div>
      {goal.race_activity_id ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <TextLink href={`/activities/${goal.race_activity_id}`} arrow>查看关联完赛活动</TextLink>
        </div>
      ) : null}
    </>
  );
}

function distanceKey(distance: number) {
  if (Math.abs(distance - 5000) <= 25) return "5000";
  if (Math.abs(distance - 10000) <= 50) return "10000";
  if (Math.abs(distance - 21097.5) <= 50) return "half";
  if (Math.abs(distance - 42195) <= 50) return "marathon";
  return String(distance);
}
