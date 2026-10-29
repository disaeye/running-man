"use client";

import { useState } from "react";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { Button } from "@shared/ui/button";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { PlanAdjustment } from "@features/goals/hooks/usePlanAdjustments";

/**
 * 动态负荷干预横幅（参考稿的干预提示）。
 *
 * 横幅说的是「建议」，不是「已经改了」：检测到的问题会写进
 * `plan_adjustments` 里等着运动员决定，课表在运动员点「应用调整」之前
 * 一直是原样。这是这一条存在的意义——自动改课表会让运动员不知道
 * 今天练的到底是哪一版。
 *
 * 触发条件写在横幅里，带着具体数字，读者能自己判断这个建议值不值得接受。
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
            <LabelCaps className="text-accent">AI 动态负荷干预</LabelCaps>
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent motion-safe:animate-ping"
            />
          </div>
          <p className="mt-1.5 text-body leading-relaxed text-text-secondary">
            {first.trigger_summary}
          </p>
          <p className="mt-1 text-caption1 text-text-muted">
            建议把这次训练削减 {Math.abs(first.load_delta_pct)}%。课表现在没有改动。
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
