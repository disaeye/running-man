"use client";

import type { Zone } from "@features/settings/hooks/useZoneOverrides";
import { formatPaceFromSeconds } from "@shared/lib/format";

interface ZoneVisualMeta {
  readonly label: string;
  readonly role: string;
  readonly barClass: string;
  readonly pctLabel: string;
  readonly barPct: number;
}

const PACE_ZONE_META: Record<number, ZoneVisualMeta> = {
  1: { label: "Z1 恢复跑", role: "热身 / 轻松排酸", barClass: "bg-zone-1", pctLabel: "≥ 129% 阈值", barPct: 24 },
  2: { label: "Z2 有氧耐力", role: "基础有氧 / 长距离", barClass: "bg-zone-2", pctLabel: "114–129%", barPct: 43 },
  3: { label: "Z3 稳态节奏", role: "稳态有氧 / 马拉松配速", barClass: "bg-zone-3", pctLabel: "106–114%", barPct: 62 },
  4: { label: "Z4 乳酸阈", role: "临界巡航 / 节奏课配速", barClass: "bg-zone-4", pctLabel: "100–106%", barPct: 81 },
  5: { label: "Z5 最大摄氧", role: "高强度间歇 / 速度提升", barClass: "bg-zone-5", pctLabel: "< 100% 阈值", barPct: 100 },
};

/** 格式化单条配速区间上下限；0 表示更快侧开放，null 表示更慢侧开放。 */
function formatPaceRange(minSeconds: number, maxSeconds: number | null): string {
  if (minSeconds <= 0 && maxSeconds == null) return "不限";
  if (minSeconds <= 0) return `快于 ${formatPaceFromSeconds(maxSeconds as number)} /km`;
  if (maxSeconds == null) return `慢于 ${formatPaceFromSeconds(minSeconds)} /km`;
  return `${formatPaceFromSeconds(minSeconds)} – ${formatPaceFromSeconds(maxSeconds)} /km`;
}

/** 展示基于当前阈值配速生成的五档 Friel 配速区间，用区间色条与强度条拉开视觉区分度。 */
export function PaceZoneList({
  paceZones,
  thresholdPace,
  bare = false,
}: {
  readonly paceZones: readonly Zone[];
  readonly thresholdPace: number | null;
  readonly bare?: boolean;
}) {
  return (
    <div
      className={bare ? "" : "mt-6 border-t border-border-subtle pt-5"}
      data-testid="settings-pace-zones"
    >
      {!bare ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-caption1 font-semibold text-text-secondary">
            配速区间（由阈值配速自动生成）
          </h3>
          {thresholdPace != null && (
            <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 font-mono text-caption1 font-medium tabular-nums text-text-primary">
              阈值基准 {formatPaceFromSeconds(thresholdPace)} /km
            </span>
          )}
        </div>
      ) : null}

      <ul className={bare ? "space-y-2" : "mt-3 space-y-2"}>
        {paceZones.map((z) => {
          const meta = PACE_ZONE_META[z.zone] ?? {
            label: `Z${z.zone} ${z.name}`,
            role: "配速区间",
            barClass: "bg-zone-1",
            pctLabel: `${z.min_pct}%`,
            barPct: Math.min(100, z.zone * 20),
          };
          return (
            <li
              key={z.zone}
              className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-overlay/55 px-3.5 py-2.5"
            >
              <span
                aria-hidden="true"
                className={`h-8 w-1.5 shrink-0 rounded-full ${meta.barClass}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-subheadline font-semibold text-text-primary">
                    {meta.label}
                  </span>
                  <span className="text-caption1 text-text-muted">{meta.role}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div
                    aria-hidden="true"
                    className="h-1.5 max-w-[10rem] flex-1 overflow-hidden rounded-full bg-surface-sunken"
                  >
                    <div
                      className={`h-full rounded-full ${meta.barClass}`}
                      style={{ width: `${meta.barPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-caption1 tabular-nums text-text-muted">
                    {meta.pctLabel}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono text-subheadline font-semibold tabular-nums text-text-primary">
                  {formatPaceRange(z.min_value, z.max_value)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
