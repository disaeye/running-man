"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";

export type CalendarViewMode = "week" | "month" | "list";

const VIEWS: readonly (readonly [CalendarViewMode, string])[] = [
  ["week", "周"],
  ["month", "月"],
  ["list", "日志"],
];

/**
 * The three ways to read the schedule, plus the one action that changes it.
 *
 * On a phone the switcher fills the row and 生成计划 keeps its own width; from
 * `sm` the pair sits at the right end of the page header.
 */
export function CalendarHeaderActions({
  view,
  onChange,
  onGenerate,
}: {
  readonly view: CalendarViewMode;
  readonly onChange: (next: CalendarViewMode) => void;
  readonly onGenerate: () => void;
}) {
  return (
    <>
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
    </>
  );
}
