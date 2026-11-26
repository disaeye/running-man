"use client";

import { Segmented } from "@shared/ui/SegmentedControl";
import { CALENDAR_VIEW_LABELS, type CalendarView } from "@features/calendar/lib/calendar-view";

const OPTIONS = (Object.keys(CALENDAR_VIEW_LABELS) as CalendarView[]).map((value) => ({
  value,
  label: CALENDAR_VIEW_LABELS[value],
}));

/** 周历与月历的切换器，放在日历工具栏右侧，与翻页按钮同行。 */
export function CalendarViewSwitch({
  view,
  onChange,
}: {
  readonly view: CalendarView;
  readonly onChange: (next: CalendarView) => void;
}) {
  return <Segmented options={OPTIONS} value={view} onChange={onChange} />;
}
