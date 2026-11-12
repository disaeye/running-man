"use client";

import { useState } from "react";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { updateEventApiV1CalendarEventIdPut } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

/** 今天条里的主观感受。历史周不渲染，所以不显示「今日」以外的日期。 */
export function TrainingSubjective({ event, _wellness, day, onSaved, compact = false }: {
  event: CalendarEventDTO | null;
  _wellness?: WellnessPoint | null;
  day: string;
  onSaved: () => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState<number | null>(event?.completed_rpe ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: number) {
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        event
          ? callOrvalValidated(
              (fetcher) => updateEventApiV1CalendarEventIdPut(
                event.event_id, { completed_rpe: next }, {}, fetcher,
              ),
              Generated.CalendarEventOutput,
            )
          : Promise.resolve(),
        apiFetch("/wellness/ratings", {
          method: "PUT",
          body: JSON.stringify({ day, soreness: next * 20 }),
        }),
      ]);
      onSaved();
    } catch (caught) {
      setError(apiErrorMessage(caught, "保存主观感受失败"));
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      {compact ? <div className="eyebrow mb-1">记录主观感受</div> : null}
      <div className={compact ? "flex flex-wrap items-center justify-between gap-2 text-caption1" : "flex items-center justify-between gap-3 text-sm"}>
        <span className="text-text-muted">RPE / 酸痛度</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              disabled={busy}
              aria-label={`RPE / 酸痛度 ${score}`}
              aria-pressed={value === score}
              onClick={() => void save(score)}
              className={`num tactile h-11 w-11 rounded-full text-base ${value === score ? "bg-primary text-primary-foreground" : "bg-secondary text-text-muted"}`}
            >
              {score}
            </button>
          ))}
        </div>
      </div>
      {!event ? (
        <p className="mt-2 text-caption1 text-text-muted">
          当天没有训练计划，仍可记录酸痛度；RPE 将在创建训练后保存。
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-caption1 text-error">{error}</p> : null}
    </>
  );

  if (compact) return content;
  return (
    <div className="surface p-4" data-testid="training-subjective">
      <div className="eyebrow mb-2">今日主观感受</div>
      {content}
    </div>
  );
}
