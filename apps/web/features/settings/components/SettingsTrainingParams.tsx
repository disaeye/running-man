"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Loader2 } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { UserProfile } from "@shared/lib/auth";
import { swrFetcher } from "@shared/lib/swr-fetcher";
import { athleteToday } from "@shared/lib/training-day";
import { invalidateTrainingParamDependents } from "@features/data/lib/invalidate-after-sync";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import type { EstimateKey } from "../lib/physiology-estimate";
import { validateTrainingDraft, type AutoCalcResult } from "./settings-training-params-model";
import { PhysiologyEstimate } from "./PhysiologyEstimate";
import {
  ThresholdFields,
  draftFromProfile,
  sameDraft,
  sameProfileDraft,
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
  const { mutate } = useSWRConfig();
  const readings = useCurrentReadings();
  const baselineWeight = readings.weight?.value ?? null;
  const [draft, setDraft] = useState<TrainingDraft>(() => draftFromProfile(profile, baselineWeight));
  const [source, setSource] = useState<UserProfile>(profile);
  const [weightSource, setWeightSource] = useState<number | null>(baselineWeight);
  const [weightEdited, setWeightEdited] = useState(false);

  if (source !== profile) {
    setSource(profile);
    setDraft(draftFromProfile(profile, baselineWeight));
    setWeightSource(baselineWeight);
    setWeightEdited(false);
  } else if (weightSource !== baselineWeight) {
    setWeightSource(baselineWeight);
    if (!weightEdited) {
      setDraft((current) => ({ ...current, weight_kg: baselineWeight }));
    }
  }

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

  const baselineDraft = draftFromProfile(profile, baselineWeight);
  const dirty = !sameDraft(draft, baselineDraft);

  const patch = (next: Partial<TrainingDraft>) => {
    if ("weight_kg" in next) {
      setWeightEdited(next.weight_kg !== baselineWeight);
    }
    setDraft((current) => ({ ...current, ...next }));
    setSaved(false);
  };

  const handleSave = async () => {
    const profileDirty = !sameProfileDraft(draft, baselineDraft);
    const weightChanged = draft.weight_kg !== baselineWeight;
    const validationErr = validateTrainingDraft(draft);
    if (validationErr) {
      setSaveError(validationErr);
      return;
    }
    if (!profileDirty && weightChanged && draft.weight_kg == null) {
      setSaveError("留空不会删除历史体重记录；如需记录今日体重请填写 20 至 300 kg");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      if (profileDirty) {
        // Thresholds are written as a new dated step by the API, so editing one
        // does not retroactively rescore past activities.
        await apiFetch("/athletes/me", {
          method: "PUT",
          body: JSON.stringify({
            hr_max: draft.hr_max != null ? Math.round(draft.hr_max) : null,
            resting_hr: draft.resting_hr != null ? Math.round(draft.resting_hr) : null,
            lthr: draft.lthr != null ? Math.round(draft.lthr) : null,
            threshold_pace: draft.threshold_pace,
            dob: draft.dob || null,
            sex: draft.sex || null,
          }),
        });
      }
      if (weightChanged && draft.weight_kg != null) {
        const day = athleteToday(profile.timezone || "UTC");
        await apiFetch("/weight", {
          method: "POST",
          body: JSON.stringify({ date: day, weight_kg: draft.weight_kg }),
        });
        await mutate(
          (key) => {
            const head = Array.isArray(key) ? key[0] : key;
            return (
              typeof head === "string" &&
              (head.startsWith("/metrics/series") ||
                head.startsWith("/wellness") ||
                head.startsWith("/weight") ||
                head.startsWith("/goals"))
            );
          },
          undefined,
          { revalidate: true },
        );
      }
      if (!profileDirty) {
        setSaveError(null);
      }
      if (draft.weight_kg == null && baselineWeight != null) {
        setDraft((current) => ({ ...current, weight_kg: baselineWeight }));
      }
      setWeightEdited(false);
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
      await invalidateTrainingParamDependents(mutate);
      onSaved();
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

  const applySynced = (next: { resting_hr?: number; weight_kg?: number }) => {
    patch({
      ...(next.resting_hr != null ? { resting_hr: next.resting_hr } : {}),
      ...(next.weight_kg != null ? { weight_kg: next.weight_kg } : {}),
    });
  };

  return (
    <Card padding="md">
      <h2 className="text-caption1 font-semibold text-text-secondary">训练参数</h2>

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
        syncReadings={{
          loading: readings.loading || readings.refreshing,
          error: readings.error,
          restingHr: readings.restingHr,
          weight: readings.weight,
          currentRestingHr: draft.resting_hr,
          currentWeightKg: draft.weight_kg,
          onPull: () => void readings.reload(),
          onApply: applySynced,
        }}
      />

      <ThresholdFields
        draft={draft}
        onChange={patch}
        restingNote={
          readings.restingHr
            ? `最近同步于 ${readings.restingHr.day}（${Math.round(readings.restingHr.value)} bpm）`
            : "暂无同步静息心率；手动填写后保存生效"
        }
        weightNote={
          readings.weight
            ? `最近记录于 ${readings.weight.day}（修改并保存将更新今日体重）`
            : "暂无同步体重；填写后保存将记录今日体重（kg）"
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
        <Button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={dirty && !saving ? "ring-2 ring-accent/40" : undefined}
        >
          <Loader2 className={`size-4 ${saving ? "animate-spin" : "hidden"}`} aria-hidden="true" />
          {saving ? "保存中…" : "保存"}
        </Button>
        {saved && !dirty && (
          <span className="action-result text-subheadline text-success" role="status">
            已保存，区间已按新数值重算
          </span>
        )}
        {dirty && !saving && (
          <span className="action-result text-caption1 font-medium text-warn">
            有未保存的改动，点击「保存」后生效
          </span>
        )}
        {saveError && (
          <span className="action-result text-subheadline text-error" role="alert">
            {saveError}
          </span>
        )}
      </div>
    </Card>
  );
}
