"use client";

import { KpiCard } from "@shared/ui/KpiCard";
import { Badge } from "@shared/ui/Badge";
import { Skeleton } from "@shared/ui/Skeleton";
import { useDataHealth } from "@features/data/hooks/useDataHealth";
import { formatRelativeTime, formatDate } from "@shared/lib/format";

function gapCountLabel(n: number): string {
  if (n === 0) return "无缺口";
  return `${n} 个`;
}

export function DataHealthSummary() {
  const { data: health, loading } = useDataHealth();

  if (loading) {
    return <DataHealthSummarySkeleton />;
  }
  const safeHealth = health || {
    activities: { total: 0, with_hr: 0, with_gps: 0, with_power: 0, with_streams: 0, data_as_of: null },
    wellness: { total: 0, with_hrv: 0, with_sleep: 0, with_rhr: 0, data_as_of: null },
    training_load: { total: 0, with_tss: 0, with_trimp: 0, data_as_of: null },
    gaps: [],
  };
  const { activities, wellness, training_load, gaps } = safeHealth;

  const hrPct = activities.total > 0 ? Math.round((activities.with_hr / activities.total) * 100) : 0;
  const gpsPct = activities.total > 0 ? Math.round((activities.with_gps / activities.total) * 100) : 0;
  const powerPct = activities.total > 0 ? Math.round((activities.with_power / activities.total) * 100) : 0;
  const streamsPct = activities.total > 0 ? Math.round(((activities.with_streams ?? 0) / activities.total) * 100) : 0;
  const overallPct = Math.round((hrPct + gpsPct + powerPct + streamsPct) / 4);

  const dates = [activities.data_as_of, wellness.data_as_of, training_load.data_as_of].filter(
    (value): value is string => Boolean(value),
  );
  const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : null;

  return (
    <section>
      <h2 className="mb-3 text-subheadline font-semibold uppercase tracking-wider text-text-muted">数据健康</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="数据集新鲜度"
          value={latestDate ? formatRelativeTime(latestDate) : "暂无"}
          unit="最新"
          color="text-accent"
          tooltip={`活动 ${activities.data_as_of ? formatDate(activities.data_as_of) : "暂无"} · 健康 ${wellness.data_as_of ? formatDate(wellness.data_as_of) : "暂无"} · 负荷 ${training_load.data_as_of ? formatDate(training_load.data_as_of) : "暂无"}`}
        />

        <KpiCard
          label="活动数据完整度"
          value={`${overallPct}%`}
          unit={`${activities.total} 条`}
          trend={overallPct >= 80 ? "up" : overallPct >= 50 ? "stable" : "down"}
          color={overallPct >= 80 ? "text-success" : overallPct >= 50 ? "text-warning" : "text-error"}
          tooltip={`心率 ${hrPct}% · GPS ${gpsPct}% · 功率 ${powerPct}% · 流数据 ${streamsPct}%`}
        />
        <KpiCard
          label="数据缺口"
          value={`${gaps.length}`}
          unit={gapCountLabel(gaps.length)}
          color={gaps.length === 0 ? "text-success" : "text-warning"}
          tooltip="检查是否存在训练活动未同步的日期缺口"
        />
      </div>

      {gaps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="health-gaps-badges">
          {gaps.map((gap, i) => (
            <Badge key={i} variant="warning">
              {formatDate(gap.from)} ~ {formatDate(gap.to)}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function DataHealthSummarySkeleton() {
  return (
    <section>
      <h2 className="mb-3 text-subheadline font-semibold uppercase tracking-wider text-text-muted">数据健康</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton variant="rectangular" className="h-[72px] rounded-lg" />
        <Skeleton variant="rectangular" className="h-[72px] rounded-lg" />
        <Skeleton variant="rectangular" className="h-[72px] rounded-lg" />
      </div>
    </section>
  );
}
