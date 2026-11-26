import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { ProportionBar } from "@shared/ui/ProportionBar";
import { largestRemainderPercent } from "@shared/lib/format";
import type { ZoneResidence } from "@features/activity/hooks/useActivityAnalysis";

const ZONE_NAMES: Readonly<Record<number, string>> = {
  1: "恢复",
  2: "有氧",
  3: "节奏",
  4: "阈值",
  5: "无氧",
};

function formatZoneRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max}`;
  if (min == null && max != null) return `< ${max}`;
  if (min != null && max == null) return `≥ ${min}`;
  return "";
}

function formatZoneDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}m`;
}

function zoneBarClass(zone: number): string {
  switch (zone) {
    case 1:
      return "bg-z1";
    case 2:
      return "bg-z2";
    case 3:
      return "bg-z3";
    case 4:
      return "bg-z4";
    default:
      return "bg-z5";
  }
}

/**
 * 心率区间分布（对标 Garmin Connect / COROS 区间分布条）：
 * 顶部总览占比条 + Z1–Z5 语义名（恢复/有氧/节奏/阈值/无氧）与主区间高亮。
 */
export function ActivityHrZonesCard({
  zones,
  thresholdDate,
}: {
  readonly zones: readonly ZoneResidence[];
  readonly thresholdDate: string | null;
}) {
  const pcts = largestRemainderPercent(zones.map((zone) => zone.seconds));
  const maxPct = pcts.length > 0 ? Math.max(...pcts) : 0;

  return (
    <PageCard
      title="心率区间分布"
      action={
        <Tag>{thresholdDate ? `阈值自 ${thresholdDate}` : "活动发生时阈值"}</Tag>
      }
    >
      {zones.length ? (
        <div className="space-y-3">
          <ProportionBar
            showGrid={false}
            ariaLabel="活动心率区间占比"
            segments={zones.map((zone, index) => ({
              key: `Z${zone.zone}`,
              label: `Z${zone.zone}`,
              pct: pcts[index] ?? 0,
              colorClass: zoneBarClass(zone.zone),
              subLabel: formatZoneDuration(zone.seconds),
            }))}
          />
          <div className="space-y-1.5">
            {zones.map((zone, index) => {
              const rangeText = formatZoneRange(zone.min_bpm, zone.max_bpm);
              const pct = pcts[index] ?? 0;
              const isDominant = maxPct > 0 && pct === maxPct;
              const zoneLabel = ZONE_NAMES[zone.zone] ?? "";
              return (
                <div
                  key={zone.zone}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                    isDominant ? "bg-surface-overlay" : ""
                  }`}
                >
                  <span className="w-28 shrink-0 whitespace-nowrap font-medium text-text-primary">
                    Z{zone.zone} {zoneLabel}
                    {rangeText ? (
                      <span className="ml-1 font-mono font-normal tabular-nums text-text-muted">
                        {rangeText}
                      </span>
                    ) : null}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-active/70">
                    <div
                      className={`h-full rounded-full ${zoneBarClass(zone.zone)}`}
                      style={{
                        width: `${pct > 0 ? Math.max(2, pct) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="num w-10 shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-text-primary">
                    {formatZoneDuration(zone.seconds)}
                  </span>
                  <span className="num w-10 shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-text-muted">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">暂无区间数据</p>
      )}
    </PageCard>
  );
}
