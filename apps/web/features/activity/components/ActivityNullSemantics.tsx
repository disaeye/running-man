"use client";

import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import type { ActivityDetail, StreamMap } from "@shared/types/activity";
import type { ActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";

export interface ActivityNullSemanticsProps {
  activity: ActivityDetail;
  streamMap: StreamMap;
  analysis: ActivityAnalysis | null;
}

type Note = { key: string; text: string };

/**
 * Explains why key training metrics are missing — turns silent "--" into
 * actionable data-quality guidance on the activity detail page.
 */
export function ActivityNullSemantics({
  activity,
  streamMap,
  analysis,
}: ActivityNullSemanticsProps) {
  const notes: Note[] = [];
  const hasHrStream = Boolean(streamMap.heart_rate?.length);
  const hasPowerStream = Boolean(streamMap.power?.length);
  const hasSpeed = Boolean(streamMap.speed?.length || streamMap.distance?.length);
  const tss = activity.tss ?? analysis?.summary?.tss ?? null;
  const sport = activity.sport ?? "";

  if (tss == null) {
    if (!hasPowerStream && !hasHrStream && !hasSpeed) {
      notes.push({
        key: "tss-no-streams",
        text: "TSS 缺失 · 无功率/心率/配速流",
      });
    } else if (!hasPowerStream && !hasHrStream && hasSpeed) {
      notes.push({
        key: "tss-no-threshold",
        text: "rTSS 缺失 · 需阈值配速",
      });
    } else if (hasHrStream && activity.avg_hr == null) {
      notes.push({
        key: "tss-hr-summary",
        text: "负荷不完整 · 缺平均心率",
      });
    }
  }

  if (!hasHrStream && (sport === "Run" || sport === "Ride" || sport === "VirtualRun")) {
    notes.push({
      key: "no-hr",
      text: "无心率 · 区间/解耦不可用",
    });
  } else if (
    hasHrStream &&
    analysis?.summary != null &&
    analysis.summary.decoupling_pct == null &&
    (hasPowerStream || hasSpeed)
  ) {
    notes.push({
      key: "no-decoupling",
      text: "解耦未算 · 稳态样本不足",
    });
  }

  if (!activity.has_gps && (sport === "Run" || sport === "TrailRun")) {
    notes.push({
      key: "no-gps",
      text: "无 GPS · 轨迹/GAP 不可用",
    });
  }

  if (!analysis?.laps?.length) {
    notes.push({
      key: "no-laps",
      text: "无设备圈 · 可重同步 FIT",
    });
  }

  if (notes.length === 0) return null;

  return (
    <Card padding="md" data-testid="activity-null-semantics">
      <SectionHeader title="数据缺口" />
      <ul className="mt-3 flex flex-col gap-2">
        {notes.map((n) => (
          <li
            key={n.key}
            className="rounded-xl bg-surface-overlay/55 px-3 py-2.5 text-footnote leading-relaxed text-text-secondary"
            data-testid={`null-note-${n.key}`}
          >
            {n.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
