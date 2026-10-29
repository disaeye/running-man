"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { StrengthSessionMetrics } from "@features/activity/components/StrengthSessionMetrics";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { getAnalysisActivityKind } from "@features/analysis/lib/activity-type";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { E1rmTable } from "@features/strength/components/E1rmTable";
import { MuscleDistribution } from "@features/strength/components/MuscleDistribution";
import { computeRange } from "@shared/lib/format";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { Skeleton } from "@shared/ui/Skeleton";

const HISTORY_DAYS = 90;
export function StrengthSessionAnalysis() {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(HISTORY_DAYS, timezone), [timezone]);
  const activities = useActivities(range.from, range.to);
  const analyticsRange = useMemo(() => computeRange(HISTORY_DAYS), []);
  const analytics = useStrengthAnalytics(analyticsRange);
  const strengthActivities = activities.data.filter(
    (activity) => getAnalysisActivityKind(activity.sport) === "strength",
  );
  const selectedActivity = strengthActivities[0] ?? null;
  const hasAnalytics =
    analytics.muscleVolume.length > 0 ||
    analytics.distribution.length > 0 ||
    analytics.e1rm.length > 0;

  if (activities.loading || analytics.loading) {
    return (
      <div className="space-y-4" data-testid="strength-analysis-loading">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (activities.error) {
    return (
      <Card padding="md" data-testid="strength-analysis-error">
        <p className="text-subheadline text-error">力量训练数据加载失败</p>
        <p className="mt-1 text-caption1 text-text-secondary">{activities.error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="strength-analysis">
      <header>
        <h2 className="text-title3 font-semibold text-text-primary">力量训练</h2>
        <p className="mt-1 text-subheadline text-text-secondary">动作、肌群训练量与 e1RM。</p>
      </header>

      {!selectedActivity ? (
        <EmptyState
          title={strengthActivities.length > 0 ? "最近没有力量训练记录" : "还没有力量训练记录"}
          description={
            strengthActivities.length > 0
              ? "近 90 天有力量训练历史，但最近一次记录不在当前检索时间段内。"
              : "力量训练记录和动作明细会显示在这里。"
          }
          action={strengthActivities.length === 0 ? (
            <Link
              href="/calendar?view=list"
              className="focus-ring inline-flex min-h-11 items-center rounded-full bg-surface-overlay px-4 text-caption1 font-medium text-text-primary hover:bg-surface-active"
            >
              打开训练日志
            </Link>
          ) : undefined}
          data-testid="strength-analysis-empty"
        />
      ) : (
        <StrengthSessionCard activityId={selectedActivity.activity_id} />
      )}

      {strengthActivities.length > 0 ? (
        <section className="space-y-4" aria-label="近 90 天力量训练趋势">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-title3 font-semibold text-text-primary">近 90 天训练趋势</h2>
            <span className="font-mono text-caption1 text-text-muted">
              {analyticsRange.from} — {analyticsRange.to}
            </span>
          </div>
          {analytics.error ? (
            <Card padding="md" role="alert">
              <p className="text-subheadline text-error">力量训练趋势加载失败</p>
              <p className="mt-1 text-caption1 text-text-secondary">{analytics.error}</p>
            </Card>
          ) : hasAnalytics ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {analytics.muscleVolume.length > 0 ? (
                <Card padding="md">
                  <h3 className="mb-3 text-caption1 font-semibold text-text-secondary">肌群训练量</h3>
                  <MuscleVolumeChart data={analytics.muscleVolume} />
                </Card>
              ) : null}
              {analytics.distribution.length > 0 ? (
                <Card padding="md">
                  <h3 className="mb-3 text-caption1 font-semibold text-text-secondary">训练量分布</h3>
                  <MuscleDistribution data={analytics.distribution} />
                </Card>
              ) : null}
              {analytics.e1rm.length > 0 ? (
                <Card padding="md" className="lg:col-span-2">
                  <h3 className="mb-3 text-caption1 font-semibold text-text-secondary">动作最大 e1RM</h3>
                  <E1rmTable data={analytics.e1rm} />
                </Card>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="力量趋势尚未建立"
              description="最近 90 天没有可用于肌群训练量、训练分布或 e1RM 的组数据。"
              data-testid="strength-analysis-trends-empty"
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function StrengthSessionCard({ activityId }: { readonly activityId: string }) {
  const activity = useActivityDetail(activityId);
  if (activity.loading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (activity.error) {
    return (
      <Card padding="md" role="alert">
        <p className="text-subheadline text-error">最近一次力量训练加载失败</p>
        <p className="mt-1 text-caption1 text-text-secondary">{activity.error}</p>
      </Card>
    );
  }
  if (!activity.data) return null;

  return (
    <section className="space-y-3" aria-label="最近一次力量训练">
      <h2 className="text-title3 font-semibold text-text-primary">最近一次力量训练</h2>
      <StrengthSessionMetrics
        durationS={activity.data.duration_s}
        calories={activity.data.calories}
        avgHeartRate={activity.data.avg_hr}
        rpe={activity.data.rpe ?? null}
      />
      <StrengthDetail activityId={activityId} />
    </section>
  );
}

function MuscleVolumeChart({ data }: { readonly data: readonly { muscle: string; volume_kg: number }[] }) {
  const sorted = [...data].sort((left, right) => right.volume_kg - left.volume_kg);
  const maxVolume = sorted[0]?.volume_kg ?? 0;
  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <div key={item.muscle} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-caption1">
            <span className="text-text-primary">{item.muscle}</span>
            <span className="font-mono tabular-nums text-text-secondary">
              {Math.round(item.volume_kg).toLocaleString()} kg
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-overlay"
            role="img"
            aria-label={`${item.muscle} ${Math.round(item.volume_kg)} 公斤`}
          >
            <div
              className="h-full rounded-full bg-sport-workout"
              style={{ width: `${maxVolume > 0 ? (item.volume_kg / maxVolume) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
