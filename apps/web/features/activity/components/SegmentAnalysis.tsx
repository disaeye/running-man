"use client";

import { useMemo, useState } from "react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import {
  SplitValue,
  SPLIT_HEAD_ROW,
  SPLIT_ROW,
  fastestPaceIndex,
  splitUnit,
} from "@features/activity/components/SplitRow";
import { formatDistance, formatPace, formatHeartRate } from "@shared/lib/format";
import {
  buildTimeline,
  splitByDistance,
  splitByTime,
  splitCustom,
  type SplitMode,
  type SplitRow,
} from "@features/activity/lib/splits";
import type { StreamMap } from "@shared/types/activity";

interface SegmentAnalysisProps {
  streams: StreamMap;
}

const MODES: { key: SplitMode; label: string; stride: number }[] = [
  { key: "distance", label: "按公里", stride: 1000 },
  { key: "time", label: "按 5 分钟", stride: 300 },
  { key: "custom", label: "自定义", stride: 300 },
];

const MODE_HINT: Record<SplitMode, string> = {
  distance: "按固定距离分段，比较每公里的配速与心率变化。",
  time: "按 5 分钟间隔分段，观察随时间推进的节奏变化。",
  custom: "按你输入的时间间隔分段，适合自定义训练节奏分析。",
};

function computeRows(
  streams: StreamMap,
  mode: SplitMode,
  stride: number,
): SplitRow[] {
  const timeline = buildTimeline(streams);
  if (timeline.length < 2) return [];
  if (mode === "distance") return splitByDistance(timeline, stride);
  if (mode === "time") return splitByTime(timeline, stride);
  return splitCustom(timeline, stride);
}

function fmtDurRow(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** 配速单元：没有速度就只留占位符，别把 `/km` 挂在一个空值后面。 */
function paceCell(speedMs: number | null): { value: string; unit?: string } {
  if (speedMs == null || speedMs <= 0) return { value: formatPace(speedMs) };
  return { value: formatPace(speedMs), unit: "/km" };
}

export function SegmentAnalysis({ streams }: SegmentAnalysisProps) {
  const [mode, setMode] = useState<SplitMode>("distance");
  const [custom, setCustom] = useState<number>(300);

  const currentStride =
    mode === "custom" ? custom : MODES.find((m) => m.key === mode)?.stride ?? 1000;

  const rows = useMemo(
    () => computeRows(streams, mode, currentStride),
    [streams, mode, currentStride],
  );

  const fastestIndex = fastestPaceIndex(
    rows.map((row) => row.avgSpeed),
    // 距离分段有固定步长；时间分段靠全表距离中位数认残段。
    {
      distances: rows.map((row) => row.distanceM),
      strideM: mode === "distance" ? currentStride : null,
    },
  );

  return (
    <Card padding="md">
      <CardHeader
        title="分段分析"
        trailing={
          <div className="flex items-center gap-1 rounded-md bg-surface-sunken p-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`inline-flex h-10 items-center rounded px-3 text-caption1 transition ${
                  mode === m.key
                    ? "bg-surface-overlay text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />

      <p className="text-caption1 text-text-muted">{MODE_HINT[mode]}</p>

      {mode === "custom" && (
        <label className="mt-3 flex items-center gap-2 text-caption1 text-text-muted">
          间隔 (秒)
          <input
            type="number"
            min={10}
            max={3600}
            value={custom}
            onChange={(e) => setCustom(Math.max(10, Number(e.target.value) || 10))}
            className="w-20 rounded border border-border-subtle bg-surface-base px-2 py-1 font-mono text-caption1 text-text-primary focus:outline-none focus:ring-1 focus:ring-ctl"
          />
        </label>
      )}

      {rows.length === 0 ? (
        <p className="mt-3 text-caption1 text-text-muted">暂无分段数据（需要速度流数据）</p>
      ) : (
        // 手机放不下五列 15px 等宽数字：`用时` 在按公里时与配速同义，`sm` 以下让位。
        <table className="mt-3 w-full">
          <thead className="border-b border-border-subtle">
            <tr className={SPLIT_HEAD_ROW}>
              <th className="text-left">分段</th>
              <th className="text-right">距离</th>
              <th className="hidden text-right sm:table-cell">用时</th>
              <th className="text-right">配速</th>
              <th className="text-right">心率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((row, index) => {
              const fastest = index === fastestIndex;
              return (
                <tr key={row.label} className={SPLIT_ROW}>
                  <td className="text-left">
                    <span className="flex items-center gap-1.5 text-caption1 text-text-secondary">
                      {row.label}
                      {fastest && (
                        <span className="text-caption1 font-medium text-accent-strong">
                          最快
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-right text-text-primary">
                    <SplitValue {...splitUnit(formatDistance(row.distanceM))} />
                  </td>
                  <td className="hidden text-right text-text-primary sm:table-cell">
                    <SplitValue value={fmtDurRow(row.durationS)} />
                  </td>
                  <td
                    className={`text-right ${
                      fastest ? "font-semibold text-accent-strong" : "text-text-primary"
                    }`}
                  >
                    <SplitValue {...paceCell(row.avgSpeed)} />
                  </td>
                  <td className="text-right text-text-primary">
                    <SplitValue {...splitUnit(formatHeartRate(row.avgHr))} />
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
