"use client";

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";

export type CalendarViewMode = "week" | "month" | "list";

const VIEWS: readonly (readonly [CalendarViewMode, string])[] = [
  ["week", "周"],
  ["month", "月"],
  ["list", "日志"],
];

/** 日历视图切换、周期导航与计划生成入口。 */
export function CalendarHeaderActions({
  view,
  onChange,
  onGenerate,
  periodLabel,
  onNavigate,
}: {
  readonly view: CalendarViewMode;
  readonly onChange: (next: CalendarViewMode) => void;
  readonly onGenerate: () => void;
  readonly periodLabel: string;
  readonly onNavigate: (delta: number) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {view !== "list" ? (
        <div className="grid w-full min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1 sm:flex sm:w-auto sm:justify-start">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate(-1)}
            aria-label={`上一个${view === "month" ? "月" : "周"}`}
            className="shrink-0"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span
            data-testid="calendar-period-label"
            className="min-w-0 flex-1 truncate px-1 text-center font-mono text-caption1 text-text-secondary sm:flex-none"
          >
            {periodLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate(1)}
            aria-label={`下一个${view === "month" ? "月" : "周"}`}
            className="shrink-0"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(next) => onChange(next as CalendarViewMode)}
          className="min-w-0 flex-1 sm:flex-none"
        >
          <TabsList>
            {VIEWS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="px-2 text-caption1 sm:px-3">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button onClick={onGenerate} size="sm" className="shrink-0 gap-1.5 rounded-full">
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>生成计划</span>
        </Button>
      </div>
    </div>
  );
}
