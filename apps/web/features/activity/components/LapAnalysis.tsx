"use client";

import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { formatDistance, formatPace, formatHeartRate, formatElevation } from "@shared/lib/format";
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

export function LapAnalysis({ laps, source = "derived" }: LapAnalysisProps) {
  const sourceHint =
    source === "device"
      ? "来自设备圈段（FIT/手表），与表盘拆圈一致。"
      : source === "derived"
        ? "算法按距离切分（无设备圈段时回退）。重新同步 FIT 可写入手表 laps。"
        : "暂无圈段数据。";

  return (
    <Card padding="md" data-testid="lap-analysis">
      <SectionHeader
        title="圈段分析"
        subtitle={sourceHint}
        action={
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

      {laps.length === 0 ? (
        <p className="mt-3 text-footnote text-text-muted" data-testid="lap-analysis-empty">
          暂无数据
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl bg-surface-overlay/35">
          <table className="w-full text-caption1">
            <thead className="text-text-muted">
              <tr className="border-b border-border-subtle text-left">
                <th className="px-3 py-2.5 font-medium">圈段</th>
                <th className="px-3 py-2.5 font-medium">距离</th>
                <th className="px-3 py-2.5 font-medium">用时</th>
                <th className="px-3 py-2.5 font-medium">配速</th>
                <th className="px-3 py-2.5 font-medium">心率</th>
                <th className="px-3 py-2.5 font-medium">爬升</th>
              </tr>
            </thead>
            <tbody className="font-mono text-text-secondary">
              {laps.map((lap) => {
                const pace = lapPace(lap);
                return (
                  <tr
                    key={lap.lap_index}
                    className="border-b border-border-subtle/50 last:border-0"
                  >
                    <td className="px-3 py-2.5 font-sans text-text-primary">
                      #{lap.lap_index}
                    </td>
                    <td className="px-3 py-2.5">{formatDistance(lap.distance_m)}</td>
                    <td className="px-3 py-2.5">{formatLapDuration(lap.duration_s)}</td>
                    <td className="px-3 py-2.5">{formatPace(pace)}</td>
                    <td className="px-3 py-2.5">{formatHeartRate(lap.avg_hr)}</td>
                    <td className="px-3 py-2.5">
                      {formatElevation(lap.elevation_gain ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
