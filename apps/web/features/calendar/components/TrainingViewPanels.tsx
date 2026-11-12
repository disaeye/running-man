import Link from "next/link";
import { Dumbbell, ChevronRight } from "lucide-react";
import { TrainingFocus } from "./TrainingFocus";
import { TrainingPeriodSummary } from "./TrainingSummary";
import { TrainingWeekView } from "./TrainingWeekView";
import { TrainingMonthView } from "./TrainingMonthView";
import { TrainingActivityList } from "./TrainingActivityList";
import { TrainingEmptyState } from "./TrainingEmptyState";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "./types";
import type { WeekModel } from "../lib/training-week";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import type { CalendarView } from "../lib/calendar-view";

export interface ViewPanelsProps {
  readonly view: CalendarView;
  readonly resolved: boolean;
  readonly model: WeekModel;
  readonly today: string;
  readonly month: string;
  readonly timezone: string;
  readonly listDays: number;
  readonly activities: readonly ActivitySummary[];
  readonly scopedActivities: readonly ActivitySummary[];
  readonly scopedEvents: readonly CalendarEventDTO[];
  readonly todayEvent: CalendarEventDTO | null;
  readonly wellness: WellnessPoint | null;
  readonly scaleDays: readonly number[];
  readonly isCurrentWeek: boolean;
  readonly onWeekChange: (delta: number) => void;
  readonly onMonthChange: (delta: number) => void;
  readonly onLoadEarlier: () => void;
  readonly onSelectDate: (day: string) => void;
  readonly onPlanToday: () => void;
  readonly onSaved: () => void;
}

/** 三个视图各自的渲染分支；页面只负责状态与数据准备。 */
export function TrainingViewPanels(props: ViewPanelsProps) {
  if (!props.resolved) {
    return <div className="h-64 animate-pulse rounded-2xl bg-secondary/40" aria-label="正在加载训练日历" />;
  }
  return (
    <>
      {props.view === "week" ? (
        <div key="week" className="view-swap space-y-3">
          {props.isCurrentWeek ? (
            <TrainingFocus
              day={props.today}
              activities={props.model.days.find((item) => item.day === props.today)?.activities ?? []}
              events={props.model.days.find((item) => item.day === props.today)?.events ?? []}
              event={props.todayEvent}
              wellness={props.wellness}
              onSaved={props.onSaved}
              onPlan={props.onPlanToday}
            />
          ) : null}
          <TrainingPeriodSummary comparison={props.model.comparison} />
          <TrainingWeekView
            model={props.model}
            today={props.today}
            onWeekChange={props.onWeekChange}
            onSelectDate={props.onSelectDate}
          />
          <TrainingEmptyState
            hasPlan={props.model.comparison.hasPlan}
            missingSessions={props.model.missingSessions}
            onPlan={props.onPlanToday}
          />
        </div>
      ) : props.view === "month" ? (
        <div key="month" className="view-swap">
          <TrainingMonthView
            activities={props.scopedActivities}
            events={props.scopedEvents}
            timezone={props.timezone}
            today={props.today}
            month={props.month}
            scaleDays={props.scaleDays}
            onMonthChange={props.onMonthChange}
          />
        </div>
      ) : (
        <div key="list" className="view-swap">
          <TrainingActivityList
            activities={props.activities}
            timezone={props.timezone}
            days={props.listDays}
            onLoadEarlier={props.onLoadEarlier}
          />
        </div>
      )}
      <Link href="/strength" className="surface tactile flex items-center gap-3 p-4">
        <Dumbbell className="h-6 w-6 text-accent-strong" />
        <div className="flex-1">
          <div className="font-semibold">力量训练</div>
          <div className="text-xs text-text-muted">日志、动作库、肌群负荷与 e1RM 趋势</div>
        </div>
        <ChevronRight className="h-5 w-5 text-text-muted" />
      </Link>
    </>
  );
}

