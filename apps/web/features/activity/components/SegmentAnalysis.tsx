"use client";

import { useMemo, useState } from "react";
import { Card } from "@shared/ui/Card";
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

export function SegmentAnalysis({ streams }: SegmentAnalysisProps) {
  const [mode, setMode] = useState<SplitMode>("distance");
  const [custom, setCustom] = useState<number>(300);

  const currentStride =
    mode === "custom" ? custom : MODES.find((m) => m.key === mode)?.stride ?? 1000;

  const rows = useMemo(
    () => computeRows(streams, mode, currentStride),
    [streams, mode, currentStride],
  );

  return (
    <Card padding="sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-subheadline font-semibold text-text-secondary">分段分析</h2>
        <div className="flex items-center gap-1 rounded-md bg-surface-sunken p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`rounded px-2 py-1 text-caption1 transition ${
                mode === m.key
                  ? "bg-surface-overlay text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "custom" && (
          <label className="flex items-center gap-2 text-caption1 text-text-muted">
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
      </div>

      <p className="mb-3 text-caption1 text-text-muted">
        {mode === "distance"
          ? "按固定距离分段，比较每公里的配速与心率变化。"
          : mode === "time"
            ? "按 5 分钟间隔分段，观察随时间推进的节奏变化。"
            : "按你输入的时间间隔分段，适合自定义训练节奏分析。"}
      </p>

      {rows.length === 0 ? (
        <p className="text-caption1 text-text-muted">暂无分段数据（需要速度流数据）</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-caption1">
            <thead className="text-text-muted">
              <tr className="border-b border-border-subtle text-left">
                <th className="py-2 pr-3 font-medium">分段</th>
                <th className="px-3 py-2 font-medium">距离</th>
                <th className="px-3 py-2 font-medium">用时</th>
                <th className="px-3 py-2 font-medium">配速</th>
                <th className="px-3 py-2 font-medium">心率</th>
              </tr>
            </thead>
            <tbody className="font-mono text-text-secondary">
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border-subtle/50 last:border-0">
                  <td className="py-2 pr-3 text-text-primary font-sans">{r.label}</td>
                  <td className="px-3 py-2">{formatDistance(r.distanceM)}</td>
                  <td className="px-3 py-2">{fmtDurRow(r.durationS)}</td>
                  <td className="px-3 py-2">{formatPace(r.avgSpeed)}</td>
                  <td className="px-3 py-2">{formatHeartRate(r.avgHr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
