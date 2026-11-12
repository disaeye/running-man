"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import { ImportPanel } from "@features/data/components/ImportPanel";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";

type Action = "import" | "manual" | "plan";

const ACTIONS: readonly { key: Action; label: string; hint: string }[] = [
  { key: "import", label: "导入训练文件", hint: "FIT / GPX / TCX" },
  { key: "manual", label: "手动补录活动", hint: "补记一次已完成的训练" },
  { key: "plan", label: "编排今天训练", hint: "新建计划课表" },
];

/** 右上角唯一的添加入口，三个动作共用同一个 Sheet 容器。 */
export function TrainingAddSheet({ open, date, onOpenChange, onSaved }: {
  readonly open: boolean;
  readonly date: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
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
            {action === null ? "添加训练" : ACTIONS.find((item) => item.key === action)?.label}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {action === null ? ACTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setAction(item.key)}
              className="tactile flex min-h-14 w-full flex-col items-start rounded-xl bg-surface-overlay/50 p-3 text-left"
            >
              <span className="text-subheadline font-medium">{item.label}</span>
              <span className="text-caption1 text-text-muted">{item.hint}</span>
            </button>
          )) : null}
          {action === "import" ? <ImportPanel /> : null}
          {action === "manual" ? <ManualActivityForm onSaved={saved} /> : null}
          {action === "plan" ? (
            <WorkoutBuilderV2 date={date} onSave={saved} onClose={() => setAction(null)} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
