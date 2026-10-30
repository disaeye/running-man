"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import type { Milestone } from "@shared/types/goals";
import type { MilestoneDraft } from "@features/goals/hooks/useGoals";

export function MilestoneEditor({
  initial,
  goalUnit,
  saving,
  onCancel,
  onSave,
}: {
  initial: Milestone | null;
  goalUnit?: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: MilestoneDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [targetDate, setTargetDate] = useState(initial?.target_date ?? "");
  const [targetValue, setTargetValue] = useState(initial?.target_value?.toString() ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? goalUnit ?? "");
  const [resultText, setResultText] = useState(initial?.result_text ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

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
        目标数值
        <Input type="number" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
      </label>
      <label className="grid gap-1 text-caption1 text-text-secondary">
        单位
        <Input maxLength={40} value={unit} onChange={(event) => setUnit(event.target.value)} />
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
