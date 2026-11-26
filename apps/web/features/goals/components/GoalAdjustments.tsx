"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { invalidatePlanDependents } from "@features/data/lib/invalidate-after-sync";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { formatDate, formatDistance } from "@shared/lib/format";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import type { PlanAdjustment } from "@features/goals/hooks/usePlanAdjustments";

export function GoalAdjustments({ adjustments, onDecided }: { adjustments: readonly PlanAdjustment[]; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const pending = adjustments.filter((item) => item.status === "pending");
  const [index, setIndex] = useState(0);
  const first = pending[Math.min(index, Math.max(0, pending.length - 1))];
  const targetDay = first?.event_date?.slice(0, 10) ?? "";
  const { events } = useCalendarEvents(targetDay, targetDay);
  if (!first) return null;

  const matchedEvent = events.find((e) => e.event_id === first.event_id) ?? null;
  const factor = Math.max(0.2, 1 + first.adjustment_pct / 100);
  const diffRows: { label: string; before: string; after: string }[] = [];
  if (matchedEvent?.predicted_tss != null && matchedEvent.predicted_tss > 0) {
    diffRows.push({
      label: "预计 TSS",
      before: `${Math.round(matchedEvent.predicted_tss)}`,
      after: `${Math.max(1, Math.round(matchedEvent.predicted_tss * factor))}`,
    });
  }
  const durationMin = matchedEvent?.workout_prescription?.duration_min;
  if (durationMin != null && durationMin > 0) {
    diffRows.push({
      label: "计划时长",
      before: `${Math.round(durationMin)} 分钟`,
      after: `${Math.max(5, Math.round(durationMin * factor))} 分钟`,
    });
  }
  if (matchedEvent?.predicted_distance_m != null && matchedEvent.predicted_distance_m > 0) {
    diffRows.push({
      label: "预计距离",
      before: formatDistance(matchedEvent.predicted_distance_m),
      after: formatDistance(matchedEvent.predicted_distance_m * factor),
    });
  }
  if (diffRows.length === 0) {
    diffRows.push({ label: "训练负荷", before: "100%", after: `${Math.round(factor * 100)}%` });
  }

  async function decide(action: "accept" | "keep") {
    if (!first) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/plan/adjustments/${first.adjustment_id}/${action}`, { method: "POST" });
      await invalidatePlanDependents(mutate);
      setIndex(0);
      toast(action === "accept" ? "已应用计划调整" : "已保留原计划", "success");
      onDecided();
    } catch (caught) {
      setError(apiErrorMessage(caught, "调整失败"));
    } finally {
      setBusy(false);
    }
  }

  const pctRounded = Math.round(first.adjustment_pct);
  const pctLabel = `${pctRounded > 0 ? "+" : ""}${pctRounded}% 负荷`;

  return (
    <PageCard
      title="计划调整建议"
      action={
        <div className="flex items-center gap-1.5">
          <Tag tone="muted">{pctLabel}</Tag>
          <Tag tone="warn">待确认{pending.length > 1 ? ` · 第 ${Math.min(index + 1, pending.length)}/${pending.length} 条` : ""}</Tag>
        </div>
      }
    >
      {pending.length > 1 ? (
        <div className="mb-2 flex items-center justify-end gap-2 text-caption1">
          <button
            type="button"
            disabled={index <= 0 || busy}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="text-accent-strong disabled:opacity-40"
          >
            上一条
          </button>
          <button
            type="button"
            disabled={index >= pending.length - 1 || busy}
            onClick={() => setIndex((i) => Math.min(pending.length - 1, i + 1))}
            className="text-accent-strong disabled:opacity-40"
          >
            下一条
          </button>
        </div>
      ) : null}
      {first.event_title || first.event_date ? (
        <p className="mb-1 text-caption1 font-medium text-text-secondary">
          涉及课表：{first.event_date ? formatDate(first.event_date) : ""} {first.event_title ?? ""}
        </p>
      ) : null}
      <p className="text-sm">{first.triggers.map((trigger) => trigger.detail).join("；") || first.trigger_summary}</p>
      <div data-testid="adjustment-diff" className="mt-2.5 space-y-2 rounded-xl bg-surface-overlay p-3 text-caption1">
        <div className="flex items-center justify-between text-text-muted">
          <span>原计划</span>
          <span className="font-medium text-warn">建议调整后（{pctLabel}）</span>
        </div>
        <div className="space-y-1">
          {diffRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-text-secondary">{row.label}</span>
              <span className="num font-mono tabular-nums">
                <span className="text-text-muted line-through">{row.before}</span>
                <span className="mx-1.5 text-text-muted">→</span>
                <span className="font-semibold text-text-primary">{row.after}</span>
              </span>
            </div>
          ))}
        </div>
        {first.triggers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {first.triggers.map((trigger) => (
              <span key={trigger.key} className="rounded-full bg-surface-card px-2 py-0.5 text-caption1 text-text-secondary">
                {trigger.label} · {trigger.detail}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-caption1 text-muted-foreground">确认应用后将更新对应日程课表。</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void decide("accept")}>
          {busy ? "处理中…" : "应用调整"}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide("keep")}>
          保持原计划
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-caption1 text-destructive">{error}</p> : null}
    </PageCard>
  );
}
