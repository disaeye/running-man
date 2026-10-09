import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

interface SportDistributionBarProps {
  activities: ActivitySummary[];
}

export function SportDistributionBar({ activities }: SportDistributionBarProps) {
  if (activities.length === 0) return null;

  const counts = new Map<string, number>();
  for (const a of activities) counts.set(a.sport, (counts.get(a.sport) ?? 0) + 1);
  const total = activities.length;
  const summary = Array.from(counts.entries())
    .map(([sport, count]) => `${getSportConfig(sport).label} ${count} 次`)
    .join("，");

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-overlay" role="img" aria-label={`运动类型分布：${summary}`}>
      {Array.from(counts.entries()).map(([sport, count]) => {
        const pct = (count / total) * 100;
        const cfg = getSportConfig(sport);
        return (
          <div
            key={sport}
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: cfg.color }}
            title={`${cfg.label} · ${count}`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}
