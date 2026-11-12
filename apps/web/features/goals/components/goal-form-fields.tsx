"use client";

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
  const seconds = form.race_target_time_s ?? 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const setClock = (hours: number, minutes: number, secs: number) =>
    update({ race_target_time_s: hours * 3600 + minutes * 60 + secs });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-subheadline font-medium text-text-secondary">比赛距离</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DISTANCE_PRESETS.map((preset) => (
            <button key={preset.label} type="button" onClick={() => update({ race_distance_m: preset.meters })}
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
          {([["小时", 3600, h], ["分", 60, m], ["秒", 1, s]] as const).map(([label, factor, value]) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-caption1 text-text-muted">{label}</span>
              <Input type="number" min={0} max={factor === 3600 ? 47 : 59} step={1} value={value || ""}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setClock(factor === 3600 ? v : h, factor === 60 ? v : m, factor === 1 ? v : s);
                }} />
            </label>
          ))}
        </div>
        {targetPace ? <p className="mt-2 text-caption1 text-text-secondary">目标平均配速 {formatPaceFromSeconds(Math.round(targetPace))} /公里</p> : null}
        {errors.race && <p role="alert" className="mt-1 text-caption1 text-error">{errors.race}</p>}
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-border-default p-3">
        <input type="checkbox" checked={form.is_primary} onChange={(e) => update({ is_primary: e.target.checked })} className="size-4" />
        <span className="text-caption1 text-text-secondary">设为主目标（计划与首页按它编排；同时最多一个）</span>
      </label>
    </div>
  );
}

export function WeightFields({ form, update, errors, latestWeight }: {
  form: GoalFormData;
  update: (patch: FormPatch) => void;
  errors: Record<string, string>;
  latestWeight: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">当前体重（公斤）</span>
        <Input type="number" step={0.1} min={20} max={300}
          placeholder={latestWeight != null ? String(latestWeight) : "例如 75"}
          value={form.baseline_value ?? ""}
          onChange={(e) => update({ baseline_value: e.target.value ? Number(e.target.value) : null, current_value: e.target.value ? Number(e.target.value) : 0 })} />
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
