import { AlertTriangle } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { BrowseAllLink } from "@shared/ui/BrowseAllLink";
import { Skeleton } from "@shared/ui/Skeleton";
import { Button } from "@shared/ui/button";
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
  readonly loading: boolean;
  readonly error: string | null;
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
  readonly wellnessLoading: boolean;
  readonly wellnessError: string | null;
  readonly scaleDays: readonly number[];
  readonly isCurrentWeek: boolean;
  readonly weekOffset: number;
  readonly onWeekChange: (delta: number) => void;
  readonly onMonthChange: (delta: number) => void;
  readonly onLoadEarlier: () => void;
  readonly onSelectDate: (day: string) => void;
  /** 周视图的「回到今天」与「跳到日期」：都直接落成单日抽屉。 */
  readonly onBackToToday: () => void;
  readonly onJumpToDate: (day: string) => void;
  readonly onPlanToday: () => void;
  readonly onPlanWeek: () => void;
  readonly onGeneratePlan: () => void;
  readonly onRetry: () => void;
  readonly onRetryWellness: () => void;
  readonly onSaved: () => void;
}

/** 三个视图各自的渲染分支；严格区分加载、失败、空态三种状态。 */
export function TrainingViewPanels(props: ViewPanelsProps) {
  if (!props.resolved || props.loading) {
    return <TrainingSkeleton view={props.view} />;
  }
  if (props.error) {
    return (
      <PageCard testId="training-error-state" className="border-error/30 bg-error/5">
        <div role="alert" className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2 text-subheadline font-semibold text-error">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>训练数据加载失败</span>
          </div>
          <p className="text-caption1 text-text-secondary">{props.error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={props.onRetry} className="mt-1 min-h-11">
            重新尝试
          </Button>
        </div>
      </PageCard>
    );
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
              wellnessLoading={props.wellnessLoading}
              wellnessError={props.wellnessError}
              onRetryWellness={props.onRetryWellness}
              onSaved={props.onSaved}
              onPlan={props.onPlanToday}
            />
          ) : null}
          <TrainingPeriodSummary
            comparison={props.model.comparison}
            weekOffset={props.weekOffset}
            onPlan={props.isCurrentWeek ? props.onPlanToday : props.onPlanWeek}
          />
          <TrainingWeekView
            model={props.model}
            today={props.today}
            onWeekChange={props.onWeekChange}
            onSelectDate={props.onSelectDate}
            onBackToToday={props.onBackToToday}
            onJumpToDate={props.onJumpToDate}
          />
          <TrainingEmptyState
            hasPlan={props.model.comparison.hasPlan}
            missingSessions={props.model.missingSessions}
            isCurrentWeek={props.isCurrentWeek}
            onPlan={props.isCurrentWeek ? props.onPlanToday : props.onPlanWeek}
            onGenerate={props.onGeneratePlan}
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
            onSelectDate={props.onSelectDate}
          />
        </div>
      ) : (
        <div key="list" className="view-swap flex flex-col gap-4">
          <BrowseAllLink />
          <TrainingActivityList
            activities={props.activities}
            timezone={props.timezone}
            days={props.listDays}
            onLoadEarlier={props.onLoadEarlier}
          />
        </div>
      )}
    </>
  );
}

function TrainingSkeleton({ view }: { readonly view: CalendarView }) {
  if (view === "month") {
    return (
      <PageCard testId="training-loading-skeleton">
        <div className="space-y-3" aria-label="正在加载训练日历">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </div>
      </PageCard>
    );
  }
  return (
    <div className="space-y-3" data-testid="training-loading-skeleton" aria-label="正在加载训练内容">
      <PageCard>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-7 w-40" />
        <Skeleton className="mt-3 h-14 w-full rounded-xl" />
      </PageCard>
      <PageCard>
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </PageCard>
      <PageCard>
        <Skeleton className="h-16 w-full rounded-xl" />
      </PageCard>
    </div>
  );
}
