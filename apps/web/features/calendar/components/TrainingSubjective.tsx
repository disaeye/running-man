"use client";

import { useState } from "react";
import { PageCard } from "@shared/ui/Lovable";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { updateEventApiV1CalendarEventIdPut } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

export function TrainingSubjective({ event, wellness, day, onSaved }: {
  event: CalendarEventDTO | null;
  wellness: WellnessPoint | null;
  day: string;
  onSaved: () => void;
}) {
  const [rpe, setRpe] = useState<number | null>(event?.completed_rpe ?? null);
  const [soreness, setSoreness] = useState<number | null>(wellness?.soreness != null ? Math.round(wellness.soreness / 20) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(nextRpe: number | null, nextSoreness: number | null) {
    if (!event) return;
    setBusy(true); setError(null);
    try {
      await Promise.all([
        event ? callOrvalValidated((fetcher) => updateEventApiV1CalendarEventIdPut(event.event_id, { completed_rpe: nextRpe }, {}, fetcher), Generated.CalendarEventOutput) : Promise.resolve(),
        apiFetch("/wellness/ratings", { method: "PUT", body: JSON.stringify({ day, soreness: nextSoreness == null ? null : nextSoreness * 20 }) }),
      ]);
      onSaved();
    } catch (caught) { setError(apiErrorMessage(caught, "保存主观感受失败")); }
    finally { setBusy(false); }
  }
  return <PageCard title="记录主观感受"><div className="grid grid-cols-2 gap-4"><Rating label="RPE 主观用力" value={rpe} disabled={!event || busy} onChange={(value) => { setRpe(value); void save(value, soreness); }} /><Rating label="酸痛度" value={soreness} disabled={busy} onChange={(value) => { setSoreness(value); void save(rpe, value); }} /></div>{!event ? <p className="mt-2 text-caption1 text-muted-foreground">当天没有训练计划，仍可记录酸痛度；RPE 将在创建训练后保存。</p> : null}{error ? <p role="alert" className="mt-2 text-caption1 text-destructive">{error}</p> : null}</PageCard>;
}

function Rating({ label, value, disabled, onChange }: { label: string; value: number | null; disabled: boolean; onChange: (value: number) => void }) {
  return <div><div className="mb-2 text-caption1 text-muted-foreground">{label}</div><div className="flex gap-1">{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" disabled={disabled} aria-label={`${label} ${score}`} aria-pressed={value === score} onClick={() => onChange(score)} className={`num h-8 flex-1 rounded-lg text-sm ${value === score ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{score}</button>)}</div></div>;
}
