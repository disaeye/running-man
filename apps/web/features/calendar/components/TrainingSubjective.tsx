"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { useToast } from "@shared/ui/Toast";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import { getSportConfig } from "@shared/config/sport-config";
import { updateEventApiV1CalendarEventIdPut } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { callOrvalValidated } from "@shared/api/orval-adapter";

const SORENESS_LEVELS = [
  { score: 1, label: "正常" },
  { score: 2, label: "轻微" },
  { score: 3, label: "偏重" },
  { score: 4, label: "很重" },
] as const;

const RPE_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * 主观状态与训练用力记录，严格区分两个物理概念：
 * 1. 每日身体酸痛度（1–4 Intervals.icu 等级，写 health_wellness.soreness）
 * 2. 单次训练 RPE（1–10 等级，仅在已完成训练后绑定到具体活动或已完成计划）
 */
export function TrainingSubjective({
  event,
  activities = [],
  wellness,
  wellnessLoading = false,
  wellnessError = null,
  onRetryWellness,
  day,
  onSaved,
  compact = false,
}: {
  readonly event: CalendarEventDTO | null;
  readonly activities?: readonly ActivitySummary[];
  readonly wellness?: WellnessPoint | null;
  readonly wellnessLoading?: boolean;
  readonly wellnessError?: string | null;
  readonly onRetryWellness?: () => void;
  readonly day: string;
  readonly onSaved: () => void;
  readonly compact?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [pendingSoreness, setPendingSoreness] = useState<number | null | undefined>(undefined);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [pendingRpe, setPendingRpe] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState<"soreness" | "rpe" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rawSoreness = wellness?.soreness ?? null;
  const sorenessValue = pendingSoreness !== undefined ? pendingSoreness : rawSoreness;

  const targetActivity = activities.find((a) => a.activity_id === selectedActivityId)
    ?? activities[0]
    ?? null;
  const canRecordRpe = targetActivity !== null || Boolean(event?.done);
  const currentRpe = targetActivity
    ? (targetActivity.rpe ?? null)
    : (event?.completed_rpe ?? null);
  const rpeValue = pendingRpe !== undefined ? pendingRpe : currentRpe;

  async function saveSoreness(score: number) {
    const next = sorenessValue === score ? null : score;
    setPendingSoreness(next);
    setBusy("soreness");
    setError(null);
    try {
      await apiFetch("/wellness/ratings", {
        method: "PUT",
        body: JSON.stringify({ day, soreness: next }),
      });
      void invalidateDataCards(mutate);
      toast(next == null ? "已清除今日酸痛度" : "酸痛度已保存", "success");
      onSaved();
      setPendingSoreness(undefined);
    } catch (caught) {
      setPendingSoreness(undefined);
      setError(apiErrorMessage(caught, "保存酸痛度失败"));
    } finally {
      setBusy(null);
    }
  }

  async function saveRpe(score: number) {
    const next = rpeValue === score ? null : score;
    setPendingRpe(next);
    setBusy("rpe");
    setError(null);
    try {
      if (targetActivity) {
        await apiFetch(`/activities/${targetActivity.activity_id}/rpe`, {
          method: "PATCH",
          body: JSON.stringify({ rpe: next }),
        });
      } else if (event) {
        await callOrvalValidated(
          (fetcher) => updateEventApiV1CalendarEventIdPut(
            event.event_id,
            { completed_rpe: next },
            {},
            fetcher,
          ),
          Generated.CalendarEventOutput,
        );
      }
      void invalidateDataCards(mutate);
      toast(next == null ? "已清除 RPE" : "RPE 已保存", "success");
      onSaved();
      setPendingRpe(undefined);
    } catch (caught) {
      setPendingRpe(undefined);
      setError(apiErrorMessage(caught, "保存 RPE 失败"));
    } finally {
      setBusy(null);
    }
  }

  const content = (
    <div className="space-y-3" data-testid="training-subjective-controls">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption1">
          <span className="text-text-muted">今日酸痛度（1–4 级）</span>
          <span className="num text-text-secondary">
            {wellnessLoading && sorenessValue == null
              ? "加载中…"
              : sorenessValue != null
                ? `${sorenessValue} / 4`
                : "未记录"}
          </span>
        </div>
        {wellnessError ? (
          <div role="alert" className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-error/10 px-2.5 py-1.5 text-caption1 text-error">
            <span>酸痛度加载失败：{wellnessError}</span>
            {onRetryWellness ? (
              <button type="button" onClick={onRetryWellness} className="tactile min-h-11 shrink-0 font-medium underline">
                重试
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-1.5 grid grid-cols-4 gap-1.5" role="group" aria-label="今日酸痛度">
          {SORENESS_LEVELS.map((item) => (
            <button
              key={item.score}
              type="button"
              disabled={busy !== null}
              aria-label={`酸痛度 ${item.score} ${item.label}`}
              aria-pressed={sorenessValue === item.score}
              onClick={() => void saveSoreness(item.score)}
              className={`num tactile min-h-11 whitespace-nowrap rounded-lg px-1 text-caption1 ${
                sorenessValue === item.score
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "bg-secondary text-text-muted hover:text-text-primary"
              }`}
            >
              {item.score} · {item.label}
            </button>
          ))}
        </div>
      </div>

      {canRecordRpe ? (
        <div className="border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-caption1">
            <span className="text-text-muted">
              本次 RPE（1–10）
              {activities.length > 1 && targetActivity
                ? ` · ${targetActivity.name?.trim() || getSportConfig(targetActivity.sport).label}`
                : ""}
            </span>
            <span className="num text-text-secondary">
              {rpeValue != null ? `${rpeValue} / 10` : "未记录"}
            </span>
          </div>
          {activities.length > 1 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {activities.map((act) => (
                <button
                  key={act.activity_id}
                  type="button"
                  onClick={() => {
                    setSelectedActivityId(act.activity_id);
                    setPendingRpe(undefined);
                  }}
                  aria-pressed={targetActivity?.activity_id === act.activity_id}
                  className={`tactile min-h-11 rounded-full border px-3 text-caption1 ${
                    targetActivity?.activity_id === act.activity_id
                      ? "border-primary bg-primary/15 text-accent-strong"
                      : "border-border-default text-text-muted"
                  }`}
                >
                  {act.name?.trim() || getSportConfig(act.sport).label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="group" aria-label="本次训练 RPE">
            {RPE_SCORES.map((score) => (
              <button
                key={score}
                type="button"
                disabled={busy !== null}
                aria-label={`RPE ${score}`}
                aria-pressed={rpeValue === score}
                onClick={() => void saveRpe(score)}
                className={`num tactile min-h-11 rounded-lg text-sm ${
                  rpeValue === score
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "bg-secondary text-text-muted hover:text-text-primary"
                }`}
              >
                {score}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
    </div>
  );

  if (compact) return content;
  return (
    <div className="surface p-4" data-testid="training-subjective">
      <div className="eyebrow mb-2">今日主观状态</div>
      {content}
    </div>
  );
}
