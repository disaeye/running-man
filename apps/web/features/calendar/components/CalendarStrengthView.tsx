"use client";

import { useState } from "react";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { Skeleton } from "@shared/ui/Skeleton";
import { StrengthTabContent } from "@features/strength/components/StrengthTabContent";
import { MuscleVolumeChart } from "@features/strength/components/MuscleVolumeChart";
import { E1rmTable } from "@features/strength/components/E1rmTable";
import { MuscleDistribution } from "@features/strength/components/MuscleDistribution";
import { computeRange } from "@shared/lib/format";

const DEFAULT_RANGE_DAYS = 90;
const DEFAULT_RANGE = computeRange(DEFAULT_RANGE_DAYS);

/**
 * Strength view of the /calendar hub.
 * Reached from `/calendar?view=strength` (W6.5 redirects
 * `/strength`, `/strength/analytics`, and `/settings?section=strength`
 * here). Composes the strength training log + analytics; inner pieces
 * live under `features/strength/` and are imported as-is.
 */
export function CalendarStrengthView() {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-3 text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          训练日志
        </h2>
        <StrengthTabContent />
      </section>
      <StrengthAnalyticsBlock />
    </div>
  );
}

function StrengthAnalyticsBlock() {
  const [range, setRange] = useState(() => DEFAULT_RANGE);
  const { muscleVolume, e1rm, distribution, loading, error } =
    useStrengthAnalytics(range);

  const hasData =
    muscleVolume.length > 0 || e1rm.length > 0 || distribution.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
            力量分析
          </h2>
          <p className="mt-0.5 font-mono text-caption1 text-text-muted">
            {range.from} → {range.to}
          </p>
        </div>
        <DateRangePicker
          from={range.from}
          to={range.to}
          onChange={(from, to) => setRange({ from, to })}
        />
      </div>

      {loading && <AnalyticsLoadingBar />}

      {error && (
        <Card padding="md" className="border-error/30 bg-error/5">
          <p className="text-subheadline text-error">{error}</p>
        </Card>
      )}

      {!loading && !error && !hasData && (
        <EmptyState
          title="暂无力量训练数据"
          description={`最近 ${DEFAULT_RANGE_DAYS.toString()} 天内未发现力量训练记录，完成训练后将自动生成肌群容量、e1RM 与分布分析。`}
        />
      )}

      {!loading && hasData && (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card padding="md">
              <h3 className="mb-4 text-subheadline font-semibold uppercase tracking-wider text-text-primary">
                肌群容量
              </h3>
              <MuscleVolumeChart data={muscleVolume} />
            </Card>
            <Card padding="md">
              <h3 className="mb-4 text-subheadline font-semibold uppercase tracking-wider text-text-primary">
                肌群分布
              </h3>
              <MuscleDistribution data={distribution} />
            </Card>
          </div>
          <Card padding="md">
            <h3 className="mb-4 text-subheadline font-semibold uppercase tracking-wider text-text-primary">
              预估 1RM (e1RM)
            </h3>
            <E1rmTable data={e1rm} />
          </Card>
        </>
      )}

      {loading && !hasData && <Skeleton className="h-64 w-full rounded-lg" />}
    </section>
  );
}

function AnalyticsLoadingBar() {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-overlay">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-accent to-atl" />
    </div>
  );
}
