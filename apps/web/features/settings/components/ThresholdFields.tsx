"use client";

import { Input } from "@shared/ui/input";
import { PaceInput } from "@shared/ui/PaceInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import type { UserProfile } from "@shared/lib/auth";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { SEX_OPTIONS } from "./settings-training-params-model";

export interface TrainingDraft {
  hr_max: number | null;
  resting_hr: number | null;
  lthr: number | null;
  threshold_pace: number | null;
  weight_goal: number | null;
  dob: string;
  sex: string;
}

export function draftFromProfile(profile: UserProfile): TrainingDraft {
  return {
    hr_max: profile.hr_max ?? null,
    resting_hr: profile.resting_hr ?? null,
    lthr: profile.lthr ?? null,
    threshold_pace: profile.threshold_pace ?? null,
    weight_goal: profile.weight_goal ?? null,
    dob: profile.dob ?? "",
    sex: profile.sex ?? "",
  };
}

export function sameDraft(a: TrainingDraft, b: TrainingDraft): boolean {
  return (
    a.hr_max === b.hr_max &&
    a.resting_hr === b.resting_hr &&
    a.lthr === b.lthr &&
    a.threshold_pace === b.threshold_pace &&
    a.weight_goal === b.weight_goal &&
    a.dob === b.dob &&
    a.sex === b.sex
  );
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

interface Props {
  readonly draft: TrainingDraft;
  readonly onChange: (patch: Partial<TrainingDraft>) => void;
  readonly resting: {
    readonly fetching: boolean;
    readonly note: string | null;
    readonly onFetch: () => void;
  };
}

/**
 * Where each value comes from.
 *
 * The form used to present eight fields as one flat grid, so nothing said which
 * numbers the system can produce and which only the athlete knows. "Is this
 * field something I have to look up, or something it can work out?" had no
 * answer on screen.
 *
 * - estimate — derived from the imported training records by the estimator above.
 * - sync — read out of the synced wellness data (Intervals.icu body weight, the
 *   last seven days of resting heart rate). Not derived, just carried over.
 * - manual — a fact about the athlete that no amount of training data implies.
 */
type Source = "estimate" | "sync" | "manual";

const SOURCE_LABEL: Record<Source, string> = {
  estimate: "自动估算",
  sync: "同步带入",
  manual: "手动填写",
};

export function FieldLabel({ text, source }: { text: string; source: Source }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-subheadline font-medium text-text-secondary">{text}</span>
      <span className="shrink-0 text-caption1 text-text-muted">{SOURCE_LABEL[source]}</span>
    </span>
  );
}

/**
 * The editable fields. Each one states what it feeds and where its number comes
 * from, so the four thresholds are not presented as an undifferentiated grid:
 * LTHR anchors heart-rate zones, threshold pace generates the pace zones.
 */
export function ThresholdFields({ draft, onChange, resting }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <FieldLabel text={`最大心率 (${HEART_RATE_UNIT})`} source="estimate" />
        <Input
          type="number"
          min={100}
          max={260}
          value={draft.hr_max ?? ""}
          onChange={(event) => onChange({ hr_max: numberOrNull(event.target.value) })}
          placeholder="例如: 190"
        />
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel text={`乳酸阈值心率 (${HEART_RATE_UNIT})`} source="estimate" />
        <Input
          type="number"
          min={80}
          max={240}
          value={draft.lthr ?? ""}
          onChange={(event) => onChange({ lthr: numberOrNull(event.target.value) })}
          placeholder="例如: 165"
        />
        <span className="text-caption1 text-text-muted">心率区间的中间锚点，也用于心率负荷</span>
      </label>

      <div>
        <label className="flex flex-col gap-1">
          <FieldLabel text={`静息心率 (${HEART_RATE_UNIT})`} source="sync" />
          <Input
            type="number"
            min={25}
            max={120}
            value={draft.resting_hr ?? ""}
            onChange={(event) => onChange({ resting_hr: numberOrNull(event.target.value) })}
            placeholder="例如: 55"
          />
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={resting.onFetch}
            disabled={resting.fetching}
            className="focus-ring inline-flex min-h-11 items-center text-caption1 text-accent-strong hover:underline disabled:opacity-60"
          >
            {resting.fetching ? "获取中…" : "从同步数据获取"}
          </button>
          {resting.note && <span className="text-caption1 text-text-muted">{resting.note}</span>}
        </div>
      </div>

      <div>
        <label className="flex flex-col gap-1">
          <FieldLabel text="阈值配速 (min/km)" source="estimate" />
          <PaceInput
            value={draft.threshold_pace}
            onChange={(value) => onChange({ threshold_pace: value })}
            aria-label="阈值配速"
          />
        </label>
        <p className="mt-1 text-caption1 text-text-muted">配速区间由它自动生成</p>
      </div>

      <label className="flex flex-col gap-1">
        <FieldLabel text="体重 (kg)" source="sync" />
        <Input
          type="number"
          value={draft.weight_goal ?? ""}
          onChange={(event) => onChange({ weight_goal: numberOrNull(event.target.value) })}
          placeholder="例如: 70"
        />
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel text="出生日期" source="manual" />
        <Input
          type="date"
          value={draft.dob}
          onChange={(event) => onChange({ dob: event.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel text="性别" source="manual" />
        <Select value={draft.sex} onValueChange={(value) => onChange({ sex: value })}>
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
  );
}
