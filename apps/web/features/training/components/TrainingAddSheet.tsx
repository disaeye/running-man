"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import { ImportPanel } from "@features/data/components/ImportPanel";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";
import { strengthLogUrl } from "@shared/config/training-nav";

type Action = "plan" | "manual" | "import";

const ACTION_LABELS: Readonly<Record<Action, string>> = {
  plan: "编排单日课表",
  manual: "手动补录活动",
  import: "导入训练文件",
};

interface Props {
  readonly open: boolean;
  readonly date: string;
  readonly defaultSport?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCloseAutoFocus: (event: Event) => void;
  /** 提供后，菜单里出现「按目标生成周期计划」；点击时先收起抽屉再打开生成弹窗。 */
  readonly onOpenGenerate?: () => void;
  readonly onSaved: () => void;
}

/**
 * 训练工作区唯一的添加入口：按「记录已完成」与「安排计划」分组。
 * 力量训练有专门的工作台，这里只负责带上日期跳过去；其余动作在抽屉内完成。
 */
export function TrainingAddSheet({
  open,
  date,
  defaultSport = "Run",
  onOpenChange,
  onCloseAutoFocus,
  onOpenGenerate,
  onSaved,
}: Props) {
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
  const pick = (next: Action) => setAction(next);

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="bottom"
        onCloseAutoFocus={onCloseAutoFocus}
        className="rounded-t-3xl sm:inset-x-auto sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:-translate-x-1/2"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border-subtle/60 bg-surface-card">
          <div className="flex items-center gap-2 pr-10">
            {action !== null ? (
              <button
                type="button"
                onClick={() => setAction(null)}
                aria-label="返回添加菜单"
                className="tactile -ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-secondary hover:text-text-primary"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : null}
            <SheetTitle className="text-body font-semibold" data-testid="training-add-title">
              {action === null ? "添加训练" : ACTION_LABELS[action]}
            </SheetTitle>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {action === null ? (
            <>
              <EntryGroup title="记录已完成">
                <Link
                  href={strengthLogUrl(date)}
                  onClick={() => close(false)}
                  data-testid="training-add-strength"
                  className={ENTRY_CLASS}
                >
                  <span className="text-subheadline font-medium">力量训练（动作与组数）</span>
                  <span className="text-caption1 text-text-muted">在力量工作台记录动作、重量、组数与 RPE</span>
                </Link>
                <EntryButton onClick={() => pick("manual")} label="手动补录活动" hint="补记一次已完成的训练" />
                <EntryButton onClick={() => pick("import")} label="导入训练文件" hint="FIT / GPX / TCX" />
              </EntryGroup>
              <EntryGroup title="安排计划">
                <EntryButton onClick={() => pick("plan")} label="编排单日课表" hint={`默认日期 ${date}，可自由调整`} />
                {onOpenGenerate ? (
                  <EntryButton
                    onClick={() => { close(false); onOpenGenerate(); }}
                    label="按目标生成周期计划"
                    hint="根据比赛目标与休息日自动排周"
                  />
                ) : null}
              </EntryGroup>
            </>
          ) : null}
          {action === "import" ? <ImportPanel onUploaded={saved} /> : null}
          {action === "manual" ? (
            <ManualActivityForm
              key={date}
              initialDate={date}
              onSaved={saved}
              onStrengthNavigate={() => close(false)}
            />
          ) : null}
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

const ENTRY_CLASS =
  "tactile flex min-h-14 w-full flex-col items-start rounded-xl bg-surface-overlay/50 p-3 text-left hover:bg-secondary/60";

function EntryGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="flex items-center gap-1.5 px-1 text-caption1 font-semibold text-text-muted">
        {title === "记录已完成" ? <Dumbbell className="size-3.5" aria-hidden /> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

function EntryButton({ onClick, label, hint }: {
  readonly onClick: () => void;
  readonly label: string;
  readonly hint: string;
}) {
  return (
    <button type="button" onClick={onClick} className={ENTRY_CLASS}>
      <span className="text-subheadline font-medium">{label}</span>
      <span className="text-caption1 text-text-muted">{hint}</span>
    </button>
  );
}
