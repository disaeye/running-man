"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPeriodizationApiV1PlanPeriodizationGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { phaseLabel } from "@features/goals/lib/phase-labels";
import type { Milestone } from "@shared/types/goals";
import type { MilestoneDraft } from "@features/goals/hooks/useGoals";

interface MilestoneEditorProps {
  goalId: string;
  initial: Milestone | null;
  goalUnit?: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: MilestoneDraft) => Promise<void>;
}

/** 里程碑编辑：手动清单字段＋可选的阶段绑定（自动核验）。 */
export function MilestoneEditor({ goalId, initial, goalUnit, saving, onCancel, onSave }: MilestoneEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [targetDate, setTargetDate] = useState(initial?.target_date ?? "");
  const [targetValue, setTargetValue] = useState(initial?.target_value?.toString() ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? goalUnit ?? "");
  const [resultText, setResultText] = useState(initial?.result_text ?? "");
  const [phaseId, setPhaseId] = useState(initial?.phase_id ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  // 与 GoalPhases 共享同一个 SWR key：详情页里两处读的是同一份缓存。
  const { data: phases } = useSWR<Generated.TrainingPhaseResponseOutput[]>(
    ["/plan/periodization", goalId],
    {
      fetcher: () =>
        callOrvalValidated(
          (fetcher) => getPeriodizationApiV1PlanPeriodizationGet({ goal_id: goalId }, {}, fetcher),
          z.array(Generated.TrainingPhaseResponse),
        ),
    },
  );

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTarget = targetValue === "" ? null : Number(targetValue);
    if (parsedTarget !== null && !Number.isFinite(parsedTarget)) {
      setValidationError("请输入有效的目标数值。");
      return;
    }
    setValidationError(null);
    await onSave({
      title: title.trim(),
      target_date: targetDate || null,
      target_value: parsedTarget,
      unit: unit.trim() || null,
      result_text: resultText.trim() || null,
      phase_id: phaseId || null,
    });
  };

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-3 rounded-xl border border-border-subtle bg-surface-sunken p-4 sm:grid-cols-2">
      <label className="grid gap-1 text-caption1 text-text-secondary sm:col-span-2">
        里程碑名称
        <Input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="grid gap-1 text-caption1 text-text-secondary">
        目标日期
        <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
      </label>
      <label className="grid gap-1 text-caption1 text-text-secondary">
        目标数值（跑量里程碑按公里）
        <Input type="number" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
      </label>
      <label className="grid gap-1 text-caption1 text-text-secondary">
        单位
        <Input maxLength={40} value={unit} onChange={(event) => setUnit(event.target.value)} />
      </label>
      <label className="grid gap-1 text-caption1 text-text-secondary">
        绑定阶段（阶段结束后按累计跑量自动核验）
        <select
          value={phaseId}
          onChange={(event) => setPhaseId(event.target.value)}
          className="min-h-11 rounded-lg border border-border-default bg-surface-card px-3 text-subheadline"
        >
          <option value="">不绑定（手动勾选）</option>
          {(phases ?? []).map((phase) => (
            <option key={phase.phase_id} value={phase.phase_id}>
              {phaseLabel(phase.name)} · {phase.start_date} 至 {phase.end_date}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-caption1 text-text-secondary">
        完成结果
        <Input maxLength={200} value={resultText} onChange={(event) => setResultText(event.target.value)} placeholder="完成后填写，例如实际成绩" />
      </label>
      {validationError ? <p role="alert" className="text-caption1 text-error sm:col-span-2">{validationError}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          <X aria-hidden="true" className="size-4" /> 取消
        </Button>
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? "保存中…" : "保存里程碑"}
        </Button>
      </div>
    </form>
  );
}
