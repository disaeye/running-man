"use client";

import { useState } from "react";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { Button } from "@shared/ui/button";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { PlanAdjustment } from "@features/goals/hooks/usePlanAdjustments";

/**
 * 展示训练计划的待确认调整，并由用户选择是否接受。
 */

interface Props {
  readonly adjustments: readonly PlanAdjustment[];
  readonly onDecided: () => void;
  readonly testId?: string;
}

export function DemoAdjustmentBanner({ adjustments, onDecided, testId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = adjustments.filter((item) => item.status === "pending");
  const first = pending[0] ?? null;
  if (!first) return null;

  async function decide(path: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, { method: "POST" });
      onDecided();
    } catch (caught) {
      setError(apiErrorMessage(caught, "调整失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      padding="md"
      data-testid={testId ?? "demo-adjustment-banner"}
      className="relative overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-accent/10 blur-2xl"
      />

      <div className="relative flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent"
        >
          ◈
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LabelCaps className="text-accent">训练计划调整</LabelCaps>
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent motion-safe:animate-ping"
            />
          </div>
          <p className="mt-1.5 text-body leading-relaxed text-text-secondary">
            {first.triggers.map((trigger) => trigger.detail).join("；") || "现有记录提示可以查看并调整这节训练。"}
          </p>
          <p className="mt-1 text-caption1 text-text-muted">
            课表当前保持不变，确认后才会应用调整。
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void decide(`/plan/adjustments/${first.adjustment_id}/accept`)}
              className="rounded-full"
            >
              应用调整
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void decide(`/plan/adjustments/${first.adjustment_id}/keep`)}
              className="rounded-full"
            >
              保持原计划
            </Button>
            {pending.length > 1 ? (
              <span className="text-caption1 text-text-muted">
                另有 {pending.length - 1} 条建议待确认
              </span>
            ) : null}
          </div>

          {error ? (
            <p className="mt-2 text-caption1 text-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
