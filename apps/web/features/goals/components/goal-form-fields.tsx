"use client";

import { useState } from "react";
import { Flag, Flame, Ruler, Scale, Timer, type LucideIcon } from "lucide-react";
import { Input } from "@shared/ui/input";
import { getSportConfig } from "@shared/config/sport-config";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { GoalDirection, GoalType, GoalStatus } from "@shared/types/goals";

export interface GoalFormData {
  type: GoalType;
  title: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  start_date: string | null;
  sport_key: string | null;
  is_primary: boolean;
  baseline_value: number | null;
  direction: GoalDirection;
  target_date: string | null;
  race_distance_m: number | null;
  race_target_time_s: number | null;
  status: GoalStatus;
}

export type FormPatch = Partial<GoalFormData>;

const TYPE_META: readonly { value: GoalType; label: string; Icon: LucideIcon }[] = [
  { value: "event", label: "比赛", Icon: Flag },
  { value: "distance", label: "距离", Icon: Ruler },
  { value: "time", label: "时间", Icon: Timer },
  { value: "weight", label: "体重", Icon: Scale },
  { value: "consistency", label: "坚持", Icon: Flame },
];

const DISTANCE_PRESETS: readonly { label: string; meters: number }[] = [
  { label: "5 公里", meters: 5000 },
  { label: "10 公里", meters: 10000 },
  { label: "半马", meters: 21097.5 },
  { label: "全马", meters: 42195 },
];

const SPORT_OPTIONS = ["run", "trail_run", "virtual_run", "ride", "swim"] as const;
const DISTANCE_UNITS = ["km", "m"] as const;
const TIME_UNITS = ["min", "h"] as const;

/** 类型选择：五个图标卡片，替换原先拼接图标字符串的下拉。 */
export function TypeSelector({ current, onSelect }: {
  current: GoalType;
  onSelect: (value: GoalType) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-2">
      {TYPE_META.map(({ value, label, Icon }) => (
        <button key={value} type="button" onClick={() => onSelect(value)}
          aria-pressed={current === value}
          className={`tactile flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border text-caption1 ${
            current === value ? "border-accent bg-accent/15 text-accent-strong" : "border-border-default text-text-secondary"}`}>
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

export function typePatch(type: GoalType): FormPatch {
  return {
    type,
    unit: type === "distance" ? "km" : type === "time" ? "min" : type === "weight" ? "kg" : type === "consistency" ? "天" : null,
  };
}

export function EventFields({ form, update, errors, targetPace }: {
  form: GoalFormData;
  update: (patch: FormPatch) => void;
  errors: Record<string, string>;
  targetPace: number | null;
}) {
  const [hoursStr, setHoursStr] = useState(() =>
    form.race_target_time_s != null ? String(Math.floor(form.race_target_time_s / 3600)) : "",
  );
  const [minsStr, setMinsStr] = useState(() =>
    form.race_target_time_s != null ? String(Math.floor((form.race_target_time_s % 3600) / 60)) : "",
  );
  const [secsStr, setSecsStr] = useState(() =>
    form.race_target_time_s != null ? String(form.race_target_time_s % 60) : "",
  );

  const onClockChange = (part: "h" | "m" | "s", raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    const max = part === "h" ? 47 : 59;
    const clamped = digits === "" ? "" : String(Math.min(max, Number(digits)));
    const nh = part === "h" ? clamped : hoursStr;
    const nm = part === "m" ? clamped : minsStr;
    const ns = part === "s" ? clamped : secsStr;
    if (part === "h") setHoursStr(nh);
    if (part === "m") setMinsStr(nm);
    if (part === "s") setSecsStr(ns);
    if (nh === "" && nm === "" && ns === "") {
      update({ race_target_time_s: null });
      return;
    }
    update({
      race_target_time_s: (Number(nh) || 0) * 3600 + (Number(nm) || 0) * 60 + (Number(ns) || 0),
    });
  };

  const selectPreset = (preset: { label: string; meters: number }) => {
    const isDefaultOrEmpty =
      !form.title.trim() || DISTANCE_PRESETS.some((item) => form.title.trim() === `${item.label}目标`);
    update({
      race_distance_m: preset.meters,
      ...(isDefaultOrEmpty ? { title: `${preset.label}目标` } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-subheadline font-medium text-text-secondary">比赛距离</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DISTANCE_PRESETS.map((preset) => (
            <button key={preset.label} type="button" onClick={() => selectPreset(preset)}
              aria-pressed={form.race_distance_m === preset.meters}
              className={`tactile min-h-11 rounded-full border px-3.5 text-caption1 ${
                form.race_distance_m === preset.meters ? "border-accent bg-accent/15 text-accent-strong" : "border-border-default text-text-secondary"}`}>
              {preset.label}
            </button>
          ))}
        </div>
        <Input className="mt-2" type="number" min={1.5} max={1000} step={0.001}
          placeholder="或填写自定义距离（公里）"
          value={form.race_distance_m ? form.race_distance_m / 1000 : ""}
          onChange={(e) => update({ race_distance_m: e.target.value ? Number(e.target.value) * 1000 : null })} />
      </div>
      <div>
        <span className="text-subheadline font-medium text-text-secondary">目标完赛用时</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([["小时", "h", hoursStr, 47], ["分", "m", minsStr, 59], ["秒", "s", secsStr, 59]] as const).map(([label, part, val, max]) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-caption1 text-text-muted">{label}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                step={1}
                placeholder="0"
                value={val}
                onChange={(e) => onClockChange(part, e.target.value)}
              />
            </label>
          ))}
        </div>
        {targetPace ? <p className="mt-2 text-caption1 text-text-secondary">目标平均配速 {formatPaceFromSeconds(Math.round(targetPace))} /公里</p> : null}
        {errors.race && <p role="alert" className="mt-1 text-caption1 text-error">{errors.race}</p>}
      </div>
    </div>
  );
}

export function WeightFields({ form, update, errors, latestWeight, isEdit = false }: {
  form: GoalFormData;
  update: (patch: FormPatch) => void;
  errors: Record<string, string>;
  latestWeight: number | null;
  isEdit?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">{isEdit ? "起始体重（公斤）" : "当前体重（公斤）"}</span>
        <Input type="number" step={0.1} min={20} max={300}
          placeholder={latestWeight != null ? String(latestWeight) : "例如 75"}
          value={form.baseline_value ?? ""}
          onChange={(e) => {
            const nextVal = e.target.value ? Number(e.target.value) : null;
            update({
              baseline_value: nextVal,
              ...(isEdit ? {} : { current_value: nextVal ?? 0 }),
            });
          }} />
        {errors.baseline && <span className="text-caption1 text-error">{errors.baseline}</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">目标体重（公斤）</span>
        <Input type="number" step={0.1} min={20} max={300} placeholder="例如 68"
          value={form.target_value ?? ""}
          onChange={(e) => update({ target_value: e.target.value ? Number(e.target.value) : null })} />
        {errors.value && <span className="text-caption1 text-error">{errors.value}</span>}
      </label>
    </div>
  );
}

export function AccumulationFields({ form, update, errors }: {
  form: GoalFormData;
  update: (patch: FormPatch) => void;
  errors: Record<string, string>;
}) {
  const units = form.type === "distance" ? DISTANCE_UNITS : form.type === "time" ? TIME_UNITS : [];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">目标数值</span>
          <Input type="number" step="any" min={0} placeholder="0"
            value={form.target_value ?? ""}
            onChange={(e) => update({ target_value: e.target.value ? Number(e.target.value) : null })} />
          {errors.value && <span className="text-caption1 text-error">{errors.value}</span>}
        </label>
        {units.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className="text-subheadline font-medium text-text-secondary">单位</span>
            <select value={form.unit ?? units[0]} onChange={(e) => update({ unit: e.target.value })}
              className="min-h-11 rounded-lg border border-border-default bg-surface-card px-3 text-subheadline">
              {units.map((unit) => <option key={unit} value={unit}>{unit === "km" ? "公里" : unit === "m" ? "米" : unit === "min" ? "分钟" : "小时"}</option>)}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-subheadline font-medium text-text-secondary">单位</span>
            <Input value="天" disabled />
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">起算日期</span>
          <Input type="date" value={form.start_date ?? ""} onChange={(e) => update({ start_date: e.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">运动类别</span>
          <select value={form.sport_key ?? "run"} onChange={(e) => update({ sport_key: e.target.value })}
            className="min-h-11 rounded-lg border border-border-default bg-surface-card px-3 text-subheadline">
            {SPORT_OPTIONS.map((key) => <option key={key} value={key}>{getSportConfig(key).label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
