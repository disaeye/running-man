"use client";

import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import {
  SplitValue,
  SPLIT_HEAD_ROW,
  SPLIT_ROW,
  fastestPaceIndex,
  splitUnit,
} from "@features/activity/components/SplitRow";
import {
  formatDistance,
  formatElevation,
  formatHeartRate,
  formatPace,
} from "@shared/lib/format";
import type { Lap } from "@features/activity/hooks/useActivityAnalysis";

interface LapAnalysisProps {
  laps: Lap[];
  /** device = FIT watch splits; derived = stream algorithm; none = empty */
  source?: "device" | "derived" | "none";
}

function formatLapDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Compute avg pace in m/s from a lap's distance and duration */
function lapPace(lap: Lap): number | null {
  if (lap.duration_s <= 0) return null;
  return lap.distance_m / lap.duration_s;
}

/** 配速单元：没有速度就只留占位符，别把 `/km` 挂在一个空值后面。 */
function paceCell(speedMs: number | null): { value: string; unit?: string } {
  if (speedMs == null || speedMs <= 0) return { value: formatPace(speedMs) };
  return { value: formatPace(speedMs), unit: "/km" };
}

export function LapAnalysis({ laps, source = "derived" }: LapAnalysisProps) {
  const sourceHint =
    source === "device"
      ? "来自设备圈段（FIT/手表），与表盘拆圈一致。"
      : source === "derived"
        ? "算法按距离切分（无设备圈段时回退）。重新同步 FIT 可写入手表 laps。"
        : "暂无圈段数据。";

  const fastestIndex = fastestPaceIndex(
    laps.map(lapPace),
    // 圈段没有声明步长，按全表距离中位数认尾部残段。
    { distances: laps.map((lap) => lap.distance_m) },
  );

  return (
    <Card padding="md" data-testid="lap-analysis">
      <CardHeader
        title="圈段分析"
        trailing={
          source !== "none" ? (
            <span
              className="rounded-full bg-surface-overlay px-2.5 py-1 text-caption1 font-medium text-text-secondary"
              data-testid={`lap-source-${source}`}
            >
              {source === "device" ? "设备圈" : "算法切分"}
            </span>
          ) : undefined
        }
      />

      <p className="text-caption1 text-text-muted">{sourceHint}</p>

      {laps.length === 0 ? (
        <p className="mt-3 text-caption1 text-text-muted" data-testid="lap-analysis-empty">
          暂无数据
        </p>
      ) : (
        // 手机放不下六列：`用时` 与 `爬升` 在 `sm` 以下隐藏，配速与心率留着。
        <table className="mt-3 w-full">
          <thead className="border-b border-border-subtle">
            <tr className={SPLIT_HEAD_ROW}>
              <th className="text-left">圈段</th>
              <th className="text-right">距离</th>
              <th className="hidden text-right sm:table-cell">用时</th>
              <th className="text-right">配速</th>
              <th className="text-right">心率</th>
              <th className="hidden text-right sm:table-cell">爬升</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {laps.map((lap, index) => {
              const pace = lapPace(lap);
              const fastest = index === fastestIndex;
              return (
                <tr key={lap.lap_index} className={SPLIT_ROW}>
                  <td className="text-left">
                    <span className="flex items-center gap-1.5 text-caption1 text-text-secondary">
                      #{lap.lap_index}
                      {fastest && (
                        <span className="text-caption1 font-medium text-accent-strong">
                          最快
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-right text-text-primary">
                    <SplitValue {...splitUnit(formatDistance(lap.distance_m))} />
                  </td>
                  <td className="hidden text-right text-text-primary sm:table-cell">
                    <SplitValue value={formatLapDuration(lap.duration_s)} />
                  </td>
                  <td
                    className={`text-right ${
                      fastest ? "font-semibold text-accent-strong" : "text-text-primary"
                    }`}
                  >
                    <SplitValue {...paceCell(pace)} />
                  </td>
                  <td className="text-right text-text-primary">
                    <SplitValue {...splitUnit(formatHeartRate(lap.avg_hr))} />
                  </td>
                  <td className="hidden text-right text-text-primary sm:table-cell">
                    <SplitValue {...splitUnit(formatElevation(lap.elevation_gain ?? null))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
