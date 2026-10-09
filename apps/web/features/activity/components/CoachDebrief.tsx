"use client";

import { Card } from "@shared/ui/Card";
import type { ActivitySummary, StreamMap, StreamPoint } from "@shared/types/activity";

type Tone = "positive" | "neutral" | "warning";

interface Signal {
  id: string;
  label: string;
  value: string;
  /** 0–100 visual fill */
  fill: number;
  tone: Tone;
}

const TONE_BAR: Record<Tone, string> = {
  positive: "bg-success",
  neutral: "bg-accent",
  warning: "bg-warning",
};

const TONE_CHIP: Record<Tone, string> = {
  positive: "bg-success/10 text-success",
  neutral: "bg-accent/10 text-accent-strong",
  warning: "bg-warning/10 text-warning",
};

function streamValues(points: StreamPoint[] | undefined): number[] {
  if (!points?.length) return [];
  return points.map((p) => p.value).filter((n) => Number.isFinite(n));
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function intensitySignal(activity: ActivitySummary): Signal | null {
  const { avg_hr, max_hr } = activity;
  if (!avg_hr || !max_hr) return null;
  const ratio = avg_hr / max_hr;
  const pct = Math.round(ratio * 100);
  if (ratio < 0.7) {
    return { id: "intensity", label: "强度", value: "恢复", fill: pct, tone: "positive" };
  }
  if (ratio < 0.82) {
    return { id: "intensity", label: "强度", value: "有氧", fill: pct, tone: "neutral" };
  }
  if (ratio < 0.9) {
    return { id: "intensity", label: "强度", value: "阈值", fill: pct, tone: "warning" };
  }
  return {
    id: "intensity",
    label: "强度",
    value: "无氧",
    fill: Math.min(pct, 100),
    tone: "warning",
  };
}

function tssSignal(activity: ActivitySummary): Signal | null {
  const tss = activity.tss;
  if (tss == null) return null;
  const fill = Math.min(100, Math.round((tss / 300) * 100));
  if (tss < 100) {
    return { id: "tss", label: "负荷", value: `${Math.round(tss)}`, fill, tone: "positive" };
  }
  if (tss < 250) {
    return { id: "tss", label: "负荷", value: `${Math.round(tss)}`, fill, tone: "neutral" };
  }
  return { id: "tss", label: "负荷", value: `${Math.round(tss)}`, fill, tone: "warning" };
}

function durationSignal(activity: ActivitySummary): Signal | null {
  const s = activity.duration_s;
  if (s == null || s <= 0) return null;
  const min = Math.round(s / 60);
  const fill = Math.min(100, Math.round((min / 120) * 100));
  return {
    id: "duration",
    label: "时长",
    value: `${min}′`,
    fill,
    tone: min >= 90 ? "warning" : min >= 45 ? "neutral" : "positive",
  };
}

function driftSignal(streams: StreamMap): Signal | null {
  const hr = streamValues(streams.heart_rate);
  if (hr.length < 40) return null;
  const q = Math.floor(hr.length / 4);
  const a0 = mean(hr.slice(0, q));
  const a1 = mean(hr.slice(-q));
  if (a0 == null || a1 == null) return null;
  const drift = a1 - a0;
  const fill = Math.min(100, Math.max(0, Math.round(50 + drift * 2)));
  if (Math.abs(drift) < 5) {
    return {
      id: "drift",
      label: "漂移",
      value: `${drift >= 0 ? "+" : ""}${drift.toFixed(0)}`,
      fill: 35,
      tone: "positive",
    };
  }
  if (drift >= 10) {
    return {
      id: "drift",
      label: "漂移",
      value: `+${drift.toFixed(0)}`,
      fill,
      tone: "warning",
    };
  }
  return {
    id: "drift",
    label: "漂移",
    value: `${drift.toFixed(0)}`,
    fill,
    tone: "neutral",
  };
}

function buildSignals(activity: ActivitySummary, streams: StreamMap): Signal[] {
  const out: Signal[] = [];
  for (const s of [
    intensitySignal(activity),
    tssSignal(activity),
    durationSignal(activity),
    driftSignal(streams),
  ]) {
    if (s && out.length < 4) out.push(s);
  }
  return out;
}

interface CoachDebriefProps {
  activity: ActivitySummary;
  streams: StreamMap;
}

/**
 * Session readout as gauges — numbers + fill, almost no prose.
 */
export function CoachDebrief({ activity, streams }: CoachDebriefProps) {
  const signals = buildSignals(activity, streams);
  if (signals.length === 0) return null;

  return (
    <Card padding="md" data-testid="coach-debrief">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-caption1 font-medium tracking-wide text-text-muted">
          训练指标分析
        </h3>
        <span className="sr-only">教练摘要</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {signals.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-2 rounded-xl bg-surface-overlay/55 px-3 py-3"
            data-testid={`coach-signal-${s.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption1 font-medium text-text-muted">{s.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-caption2 font-semibold ${TONE_CHIP[s.tone]}`}
              >
                {s.value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={`h-full rounded-full transition-[width] ${TONE_BAR[s.tone]}`}
                style={{ width: `${s.fill}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
