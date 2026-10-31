"use client";

import { useState } from "react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { PlanAdjustment } from "@features/goals/hooks/usePlanAdjustments";

export function GoalAdjustments({ adjustments, onDecided }: { adjustments: readonly PlanAdjustment[]; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = adjustments.find((item) => item.status === "pending");
  if (!first) return null;
  async function decide(action: "accept" | "keep") {
    if (!first) return;
    setBusy(true); setError(null);
    try { await apiFetch(`/plan/adjustments/${first.adjustment_id}/${action}`, { method: "POST" }); onDecided(); }
    catch (caught) { setError(apiErrorMessage(caught, "调整失败")); }
    finally { setBusy(false); }
  }
  return <PageCard title="计划调整建议" action={<Tag tone="warn">待确认</Tag>}><p className="text-sm">{first.triggers.map((trigger) => trigger.detail).join("；") || first.trigger_summary}</p><p className="mt-1 text-caption1 text-muted-foreground">确认后才会修改训练安排。</p><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy} onClick={() => void decide("accept")}>应用调整</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide("keep")}>保持原计划</Button></div>{error ? <p role="alert" className="mt-2 text-caption1 text-destructive">{error}</p> : null}</PageCard>;
}
