"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Input } from "@shared/ui/input";
import { PaceInput } from "@shared/ui/PaceInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Button } from "@shared/ui/button";
import { apiFetch } from "@shared/lib/api";
import type { UserProfile } from "@shared/lib/auth";
import {
  SEX_OPTIONS,
  type AutoCalcResult,
} from "./settings-training-params-model";
import { HrMaxAutoCalc, LthrAutoCalc, ThresholdPaceAutoCalc } from "./TrainingParamAutoCalc";

interface Props {
  profile: UserProfile;
  onSaved: () => void;
}

export function SettingsTrainingParams({ profile, onSaved }: Props) {
  const [hrMax, setHrMax] = useState<number | null>(profile.hr_max ?? null);
  const [restingHr, setRestingHr] = useState<number | null>(profile.resting_hr ?? null);
  // LTHR is the reference for heart rate zones and hrTSS. It is loaded from the
  // profile like the other thresholds — previously it started at 0 and was
  // omitted from the save payload, so a value the athlete typed was discarded.
  const [lthr, setLthr] = useState<number | null>(profile.lthr ?? null);
  const [weight, setWeight] = useState<number | null>(profile.weight_goal ?? null);
  const [dob, setDob] = useState(profile.dob ?? "");
  const [sex, setSex] = useState(profile.sex ?? "");
  const [thresholdPace, setThresholdPace] = useState<number | null>(
    profile.threshold_pace ?? null,
  );
  const [restingFetching, setRestingFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [autoCalc, setAutoCalc] = useState<AutoCalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Keep in sync when the profile is reloaded after a save or a sync.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHrMax(profile.hr_max ?? null);
     
    setRestingHr(profile.resting_hr ?? null);
     
    setLthr(profile.lthr ?? null);
     
    setThresholdPace(profile.threshold_pace ?? null);
  }, [profile.hr_max, profile.resting_hr, profile.lthr, profile.threshold_pace]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Thresholds are written as a new dated step by the API, so editing one
      // does not retroactively rescore past activities.
      await apiFetch("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({
          hr_max: hrMax,
          resting_hr: restingHr,
          lthr,
          threshold_pace: thresholdPace,
          weight_goal: weight,
          dob: dob || null,
          sex: sex || null,
        }),
      });
      setMsg("保存成功");
      onSaved();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCalc = async () => {
    setCalcLoading(true);
    setCalcError(null);
    try {
      const result = await apiFetch<AutoCalcResult>(
        "/athletes/me/auto-calculate",
        { method: "POST" },
      );
      setAutoCalc(result);
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : "计算失败");
    } finally {
      setCalcLoading(false);
    }
  };

  const applyHrMax = () => {
    if (autoCalc?.hr_max.hr_max) setHrMax(autoCalc.hr_max.hr_max);
  };

  const applyLthr = () => {
    if (autoCalc?.lthr.lthr) setLthr(autoCalc.lthr.lthr);
  };

  const applyThresholdPace = () => {
    const sPerKm = autoCalc?.threshold_pace.threshold_pace_s_per_km;
    if (sPerKm) setThresholdPace(sPerKm);
  };

  /** Pull the latest resting HR from synced wellness data (health_wellness). */
  const fetchRestingHr = async () => {
    setRestingFetching(true);
    try {
      const from = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      const rows = await apiFetch<ReadonlyArray<{ day: string; resting_hr: number | null }>>(
        `/wellness?from=${from}&to=${to}`,
      );
      const latest = [...rows].reverse().find((row) => row.resting_hr != null);
      if (latest?.resting_hr != null) {
        setRestingHr(latest.resting_hr);
        setMsg(`已从同步数据获取静息心率 ${latest.resting_hr} bpm（${latest.day}）`);
      } else {
        setMsg("近 7 天没有可用的静息心率数据，请先同步 Intervals.icu");
      }
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "获取失败");
    } finally {
      setRestingFetching(false);
    }
  };

  return (
    <Card padding="sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-headline font-semibold text-text-primary">训练参数</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void handleAutoCalc()}
          disabled={calcLoading}
        >
          {calcLoading ? "计算中…" : <><Zap className="h-4 w-4" /> 自动计算</>}
        </Button>
      </div>

      {calcError && (
        <p className="mb-3 text-caption1 text-error">{calcError}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* HR Max */}
        <div>
          <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">最大心率 (bpm)</span><Input type="number" min={100} max={260} value={hrMax ?? ""} onChange={(e) => setHrMax(e.target.value === "" ? null : Number(e.target.value))} placeholder="例如: 190" /></label>
          <HrMaxAutoCalc data={autoCalc?.hr_max} onApply={applyHrMax} />
        </div>

        {/* LTHR */}
        <div>
          <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">乳酸阈值心率 LTHR (bpm)</span><Input type="number" min={80} max={240} value={lthr ?? ""} onChange={(e) => setLthr(e.target.value === "" ? null : Number(e.target.value))} placeholder="例如: 165" /></label>
          <LthrAutoCalc data={autoCalc?.lthr} onApply={applyLthr} />
        </div>

        <div>
          <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">静息心率 (bpm)</span><Input type="number" min={25} max={120} value={restingHr ?? ""} onChange={(e) => setRestingHr(e.target.value === "" ? null : Number(e.target.value))} placeholder="例如: 55" /></label>
          <button
            type="button"
            onClick={() => void fetchRestingHr()}
            disabled={restingFetching}
            className="focus-ring inline-flex min-h-[44px] items-center text-caption1 text-accent-strong hover:underline disabled:opacity-60"
          >
            {restingFetching ? "获取中..." : "从同步数据获取"}
          </button>
        </div>

        <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">体重 (kg)</span><Input type="number" value={weight ?? ""} onChange={(e) => setWeight(e.target.value === "" ? null : Number(e.target.value))} placeholder="例如: 70" /></label>

        {/* Threshold Pace */}
        <div>
          <label className="flex flex-col gap-1">
            <span className="text-subheadline font-medium text-text-secondary">阈值配速 (min/km)</span>
            <PaceInput value={thresholdPace} onChange={setThresholdPace} aria-label="阈值配速" />
          </label>
          <ThresholdPaceAutoCalc data={autoCalc?.threshold_pace} onApply={applyThresholdPace} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">出生日期</span>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">性别</span>
          <Select value={sex} onValueChange={setSex}>
            <SelectTrigger className="min-h-[44px] w-full bg-surface-overlay">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              {SEX_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
        {msg && (
          <span className={`text-subheadline ${msg.includes("成功") ? "text-success" : "text-error"}`}>
            {msg}
          </span>
        )}
      </div>
    </Card>
  );
}
