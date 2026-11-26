"use client";

import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { SlidersHorizontal } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { formatDate } from "@shared/lib/format";
import { invalidatePlanDependents } from "@features/data/lib/invalidate-after-sync";
import type { PlanAdjustment } from "@features/goals/hooks/usePlanAdjustments";

export function HomePendingAdjustmentBanner({
  adjustments,
  onDecided,
}: {
  readonly adjustments: readonly PlanAdjustment[];
  readonly onDecided: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const pending = adjustments.filter((item) => item.status === "pending");
  const first = pending[0];
  if (!first) return null;

  async function decide(action: "accept" | "keep") {
    if (!first) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/plan/adjustments/${first.adjustment_id}/${action}`, { method: "POST" });
      await invalidatePlanDependents(mutate);
      toast(action === "accept" ? "已应用计划调整" : "已保留原计划", "success");
      onDecided();
    } catch (caught) {
      setError(apiErrorMessage(caught, "处理计划调整失败"));
    } finally {
      setBusy(false);
    }
  }

  const pctRounded = Math.round(first.adjustment_pct);
  const pctLabel = `${pctRounded > 0 ? "+" : ""}${pctRounded}% 负荷`;

  return (
    <PageCard
      testId="home-pending-adjustment"
      title={
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5 text-warn" aria-hidden="true" />
          <span>待确认课表调整</span>
        </span>
      }
      action={
        <div className="flex items-center gap-1.5">
          <Tag tone="warn">{pctLabel}</Tag>
          {pending.length > 1 ? <Tag tone="outline">共 {pending.length} 条</Tag> : null}
        </div>
      }
    >
      <div className="space-y-2.5">
        <p className="text-subheadline font-medium text-text-primary">
          {first.event_date ? `${formatDate(first.event_date)} · ` : ""}
          {first.event_title ?? "近期训练课表"}
        </p>
        <p className="text-caption1 leading-relaxed text-text-secondary">
          {first.triggers.map((trigger) => trigger.detail).join("；") || first.trigger_summary}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("accept")}>
              {busy ? "处理中…" : "采纳调整"}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide("keep")}>
              保持原计划
            </Button>
          </div>
          <Link href="/goals" className="inline-flex min-h-11 items-center text-caption1 font-medium text-accent-strong hover:underline">
            前往目标页查看
          </Link>
        </div>
        {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
      </div>
    </PageCard>
  );
}
