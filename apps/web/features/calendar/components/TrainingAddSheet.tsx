"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import { ImportPanel } from "@features/data/components/ImportPanel";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";

type Action = "import" | "manual" | "plan" | "generate";

/** 右上角唯一的添加入口，支持导入、补录、编排单课及按目标生成计划。 */
export function TrainingAddSheet({
  open,
  date,
  defaultSport = "Run",
  onOpenChange,
  onOpenGenerate,
  onSaved,
}: {
  readonly open: boolean;
  readonly date: string;
  readonly defaultSport?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenGenerate?: () => void;
  readonly onSaved: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const actions = [
    { key: "plan" as const, label: "编排训练计划", hint: `默认日期 ${date}，可自由调整` },
    ...(onOpenGenerate
      ? [{ key: "generate" as const, label: "按目标生成周期计划", hint: "根据比赛目标与休息日自动排周" }]
      : []),
    { key: "manual" as const, label: "手动补录活动", hint: "补记一次已完成的训练" },
    { key: "import" as const, label: "导入训练文件", hint: "FIT / GPX / TCX" },
  ];

  const close = (next: boolean) => {
    if (!next) setAction(null);
    onOpenChange(next);
  };
  const saved = () => {
    setAction(null);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-t-[22px] sm:mx-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-body font-semibold">
            {action === null ? "添加训练" : actions.find((item) => item.key === action)?.label}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {action === null ? actions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.key === "generate") {
                  close(false);
                  onOpenGenerate?.();
                  return;
                }
                setAction(item.key);
              }}
              className="tactile flex min-h-14 w-full flex-col items-start rounded-xl bg-surface-overlay/50 p-3 text-left"
            >
              <span className="text-subheadline font-medium">{item.label}</span>
              <span className="text-caption1 text-text-muted">{item.hint}</span>
            </button>
          )) : null}
          {action === "import" ? <ImportPanel /> : null}
          {action === "manual" ? <ManualActivityForm key={date} initialDate={date} onSaved={saved} /> : null}
          {action === "plan" ? (
            <WorkoutBuilderV2
              key={`${date}-${defaultSport}`}
              date={date}
              allowDateEdit
              defaultSport={defaultSport}
              onSave={saved}
              onClose={() => setAction(null)}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
