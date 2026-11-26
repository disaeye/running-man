"use client";

import { Pencil, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/sheet";
import { Tag } from "@shared/ui/Badge";
import { GOAL_TYPES, type Goal } from "@shared/types/goals";

interface GoalManageSheetProps {
  readonly open: boolean;
  readonly goals: readonly Goal[];
  readonly selectedId: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (id: string) => void;
  readonly onEdit: (goal: Goal) => void;
  readonly onAbandon: (goal: Goal) => void;
}

/** 全部目标管理抽屉：从顶部入口按需展开，替代页面底部常驻重复列表。 */
export function GoalManageSheet({
  open,
  goals,
  selectedId,
  onOpenChange,
  onSelect,
  onEdit,
  onAbandon,
}: GoalManageSheetProps) {
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl sm:inset-x-auto sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2"
      >
        <SheetHeader className="border-b border-border-subtle/60 pb-3">
          <SheetTitle className="text-body font-semibold">
            管理全部目标 ({goals.length})
          </SheetTitle>
        </SheetHeader>
        <div className="max-h-[65vh] overflow-y-auto px-4 pb-6 pt-2">
          <ul className="divide-y divide-border-subtle">
            {goals.map((goal) => {
              const typeConfig = GOAL_TYPES[goal.type] ?? GOAL_TYPES.event;
              const statusText =
                goal.status === "achieved"
                  ? "已达成"
                  : goal.status === "abandoned"
                    ? "已放弃"
                    : "进行中";
              const overdue =
                goal.status === "active" &&
                goal.target_date != null &&
                goal.target_date < todayIso;
              const selected = goal.goal_id === selectedId;
              return (
                <li key={goal.goal_id} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(goal.goal_id);
                      onOpenChange(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        goal.status === "achieved"
                          ? "bg-success"
                          : goal.status === "active"
                            ? "bg-accent-strong"
                            : "bg-muted-foreground"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`flex items-center gap-1.5 truncate text-sm font-medium ${
                          selected ? "text-accent-strong" : "text-text-primary"
                        }`}
                      >
                        {goal.title}
                        {goal.is_primary ? <Tag tone="primary">主目标</Tag> : null}
                        {overdue ? <Tag tone="warn">已过期</Tag> : null}
                      </span>
                      <span className="block text-caption1 text-text-muted">
                        {typeConfig.label} · {statusText}
                        {goal.target_date ? ` · ${goal.target_date}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onEdit(goal);
                    }}
                    aria-label={`编辑 ${goal.title}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-secondary hover:text-text-primary"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onAbandon(goal);
                    }}
                    aria-label={`删除 ${goal.title}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
