"use client";

import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Input } from "@shared/ui/input";

interface StrengthSessionMetaCardProps {
  readonly workoutName: string;
  readonly workoutDate: string;
  readonly notes: string;
  readonly onNameChange: (value: string) => void;
  readonly onDateChange: (value: string) => void;
  readonly onNotesChange: (value: string) => void;
}

/** 力量训练元信息折叠卡：默认单行呈现训练名称、日期与备注状态，减少录入首屏控件噪声。 */
export function StrengthSessionMetaCard({
  workoutName,
  workoutDate,
  notes,
  onNameChange,
  onDateChange,
  onNotesChange,
}: StrengthSessionMetaCardProps) {
  return (
    <DisclosureCard
      title="本次训练信息"
      summary={`${workoutName.trim() || "力量训练"} · ${workoutDate}${notes.trim() ? " · 已填备注" : " · 点击修改或添加备注"}`}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
            训练名称
            <Input
              value={workoutName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="例如：下肢力量"
              maxLength={100}
            />
          </label>
          <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
            训练日期
            <Input
              type="date"
              value={workoutDate}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          训练备注
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="酸痛感受、动作要领、调整说明…"
            rows={2}
            className="w-full resize-none rounded-lg bg-secondary p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
      </div>
    </DisclosureCard>
  );
}
