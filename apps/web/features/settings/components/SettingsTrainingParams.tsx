"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { UserProfile } from "@shared/lib/auth";
import { swrFetcher } from "@shared/lib/swr-fetcher";
import type { EstimateKey } from "../lib/physiology-estimate";
import type { AutoCalcResult } from "./settings-training-params-model";
import { PhysiologyEstimate } from "./PhysiologyEstimate";
import {
  ThresholdFields,
  draftFromProfile,
  sameDraft,
  type TrainingDraft,
} from "./ThresholdFields";

interface Props {
  profile: UserProfile;
  onSaved: () => void;
}

/**
 * The four thresholds, the identity fields the estimators use, and the one save
 * that writes them.
 *
 * The form holds a draft. Estimation writes into that draft, so the athlete
 * reviews the numbers and presses 保存 once — the same single write path as
 * typing them by hand. Thresholds are written by the API as a new dated step,
 * which is why nothing is persisted behind the form's back.
 *
 * The draft re-syncs from the profile with the render-time adjustment React
 * documents for deriving state from props; an effect would have written state
 * during a commit and briefly shown the previous profile's numbers.
 */
export function SettingsTrainingParams({ profile, onSaved }: Props) {
  const [draft, setDraft] = useState<TrainingDraft>(() => draftFromProfile(profile));
  const [source, setSource] = useState<UserProfile>(profile);

  if (source !== profile) {
    setSource(profile);
    setDraft(draftFromProfile(profile));
  }

  const [restingFetching, setRestingFetching] = useState(false);
  const [restingNote, setRestingNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [autoCalc, setAutoCalc] = useState<AutoCalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // The stored thresholds carry the time an estimate last wrote them, which is
  // how the athlete sees that an import has already been folded in. It is a
  // cache read, so a stale answer costs nothing: the estimate button recomputes
  // on demand and refreshes this key.
  const physiology = useSWR<{ computed_at: string | null }>(
    "/athletes/me/physiology",
    swrFetcher,
  );

  const dirty = !sameDraft(draft, draftFromProfile(profile));

  const patch = (next: Partial<TrainingDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      // Thresholds are written as a new dated step by the API, so editing one
      // does not retroactively rescore past activities.
      await apiFetch("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({
          hr_max: draft.hr_max,
          resting_hr: draft.resting_hr,
          lthr: draft.lthr,
          threshold_pace: draft.threshold_pace,
          weight_goal: draft.weight_goal,
          dob: draft.dob || null,
          sex: draft.sex || null,
        }),
      });
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCalc = async () => {
    setCalcLoading(true);
    setCalcError(null);
    try {
      setAutoCalc(
        await apiFetch<AutoCalcResult>("/athletes/me/auto-calculate", { method: "POST" }),
      );
      void physiology.mutate();
    } catch (err: unknown) {
      setCalcError(apiErrorMessage(err, "计算失败"));
    } finally {
      setCalcLoading(false);
    }
  };

  const applyEstimate = (next: Partial<Record<EstimateKey, number>>) => {
    patch({
      ...(next.hr_max != null ? { hr_max: next.hr_max } : {}),
      ...(next.lthr != null ? { lthr: next.lthr } : {}),
      ...(next.threshold_pace != null ? { threshold_pace: next.threshold_pace } : {}),
    });
  };

  /** Pull the latest resting HR from synced wellness data (health_wellness). */
  const fetchRestingHr = async () => {
    setRestingFetching(true);
    setRestingNote(null);
    try {
      const from = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      const rows = await apiFetch<ReadonlyArray<{ day: string; resting_hr: number | null }>>(
        `/wellness?from=${from}&to=${to}`,
      );
      const latest = [...rows].reverse().find((row) => row.resting_hr != null);
      if (latest?.resting_hr != null) {
        patch({ resting_hr: latest.resting_hr });
        setRestingNote(`取自 ${latest.day} 的同步数据`);
      } else {
        setRestingNote("近 7 天没有静息心率记录，同步后再试");
      }
    } catch (err: unknown) {
      setRestingNote(apiErrorMessage(err, "获取失败"));
    } finally {
      setRestingFetching(false);
    }
  };

  return (
    <Card padding="sm">
      <h2 className="text-caption1 font-semibold text-text-secondary">训练参数</h2>
      <p className="mt-1 mb-4 text-caption1 text-text-muted">
        心率区间与配速区间都由这几个数值推导，保存后按新数值重算。
      </p>

      <PhysiologyEstimate
        result={autoCalc}
        loading={calcLoading}
        error={calcError}
        current={{
          hr_max: draft.hr_max,
          lthr: draft.lthr,
          threshold_pace: draft.threshold_pace,
        }}
        lastComputedAt={autoCalc?.computed_at ?? physiology.data?.computed_at ?? null}
        onCalculate={() => void handleAutoCalc()}
        onApply={applyEstimate}
      />

      <ThresholdFields
        draft={draft}
        onChange={patch}
        resting={{
          fetching: restingFetching,
          note: restingNote,
          onFetch: () => void fetchRestingHr(),
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> 保存中…
            </>
          ) : (
            "保存"
          )}
        </Button>
        {saved && !dirty && (
          <span className="text-subheadline text-success" role="status">
            已保存，区间已按新数值重算
          </span>
        )}
        {dirty && !saving && <span className="text-caption1 text-text-muted">有未保存的改动</span>}
        {saveError && (
          <span className="text-subheadline text-error" role="alert">
            {saveError}
          </span>
        )}
      </div>
    </Card>
  );
}
