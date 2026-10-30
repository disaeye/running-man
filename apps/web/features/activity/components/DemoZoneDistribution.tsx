"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { ZoneResidence } from "@features/activity/hooks/useActivityAnalysis";

/**
 * 心率五区间能量分配（参考稿的区间分布卡）。
 *
 * 上面一条五色堆叠条，下面每区一行：区间名、区间边界、时长、占比。
 *
 * 区间边界用的是运动员自己那天的阈值算出来的上下界（`min_bpm` /
 * `max_bpm`），不是 HRmax 的百分比——同一份数据在不同方案下边界不同，
 * 所以边界必须跟着本次评估一起给出来，否则读者看到的百分比无法核对。
 */

interface Props {
  readonly residence: readonly ZoneResidence[];
  /** 主导区间。 */
  readonly dominantZone: number | null;
  /** 当日生效的乳酸阈心率。 */
  readonly thresholdHr: number | null;
  readonly testId?: string;
}

const ZONE_META: Record<number, { label: string; bar: string }> = {
  1: { label: "Z1 恢复区", bar: "bg-zone-1" },
  2: { label: "Z2 耐力区", bar: "bg-zone-2" },
  3: { label: "Z3 节奏区", bar: "bg-zone-3" },
  4: { label: "Z4 阈值区", bar: "bg-zone-4" },
  5: { label: "Z5 无氧区", bar: "bg-zone-5" },
};

export function DemoZoneDistribution({
  residence,
  dominantZone,
  thresholdHr,
  testId,
}: Props) {
  const rows = [1, 2, 3, 4, 5].map((zone) => {
    const row = residence.find((entry) => entry.zone === zone) ?? null;
    return { zone, row };
  });
  const totalSeconds = rows.reduce((sum, entry) => sum + (entry.row?.seconds ?? 0), 0);

  return (
    <Card data-testid={testId ?? "demo-zone-distribution"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <LabelCaps>ZONE DISTRIBUTION · 心率训练分析</LabelCaps>
          <h2 className="mt-1 text-title3 font-semibold text-text-primary">
            心率区间分布
          </h2>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-caption1 text-accent">
            {dominantZone != null
              ? `主导: Z${dominantZone} ${ZONE_META[dominantZone]?.label.slice(4) ?? ""}`
              : "暂无区间数据"}
          </p>
          {thresholdHr != null ? (
            <p className="font-mono text-caption1 text-text-muted">
              乳酸阈 {Math.round(thresholdHr)} BPM
            </p>
          ) : null}
        </div>
      </div>

      {totalSeconds === 0 ? (
        <p className="mt-4 text-caption1 text-text-muted">
          这条记录没有心率流，无法计算区间分布
        </p>
      ) : (
        <>
          {/* 五色堆叠条：每段宽度就是该区的占比。 */}
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-active">
            {rows.map(({ zone, row }) => {
              const pct = row?.pct ?? 0;
              if (pct <= 0) return null;
              return (
                <div
                  key={zone}
                  className={ZONE_META[zone]?.bar ?? "bg-zone-1"}
                  style={{ width: `${pct}%` }}
                  title={`Z${zone} ${pct}%`}
                />
              );
            })}
          </div>

          <div className="mt-4 space-y-1.5">
            {rows.map(({ zone, row }) => {
              const meta = ZONE_META[zone];
              const dominant = dominantZone === zone;
              return (
                <div
                  key={zone}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 ${
                    dominant ? "bg-surface-active" : "bg-surface-overlay"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`size-2.5 shrink-0 rounded-sm ${meta?.bar ?? "bg-zone-1"}`}
                    />
                    <span
                      className={`truncate text-caption1 ${
                        dominant ? "font-semibold text-accent" : "text-text-secondary"
                      }`}
                    >
                      {meta?.label ?? `Z${zone}`}
                    </span>
                    <span className="font-mono text-caption1 text-text-muted">
                      {zoneRange(row)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-caption1 tabular-nums text-text-secondary">
                      {row ? formatDuration(row.seconds) : NO_VALUE}
                    </span>
                    <span
                      className={`w-9 text-right font-mono text-caption1 font-bold tabular-nums ${
                        dominant ? "text-accent" : "text-text-secondary"
                      }`}
                    >
                      {row ? `${row.pct}%` : NO_VALUE}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

/** 区间的心率范围。缺边界时写占位符，不编一个范围出来。 */
function zoneRange(row: ZoneResidence | null): string {
  if (!row) return NO_VALUE;
  const low = row.min_bpm;
  const high = row.max_bpm;
  if (low == null && high == null) return NO_VALUE;
  if (low != null && high != null) return `${low}-${high} BPM`;
  return `${low ?? high} BPM`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
