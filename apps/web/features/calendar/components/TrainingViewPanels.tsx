import { AlertTriangle } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Skeleton } from "@shared/ui/Skeleton";
import { Button } from "@shared/ui/button";
import { PlanQuality } from "@features/plan/components/PlanQuality";
import { PlanQualityVerdict } from "@features/plan/components/PlanQualityVerdict";
import { TrainingPeriodSummary } from "./TrainingSummary";
import { TrainingConnectionNotice } from "./TrainingConnectionNotice";
import { TrainingWeekView } from "./TrainingWeekView";
import { TrainingMonthView } from "./TrainingMonthView";
import type { DaySheetMode } from "./CalendarDaySheet";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "./types";
import type { WeekModel } from "../lib/training-week";
import type { CalendarView } from "../lib/calendar-view";

export interface ViewPanelsProps {
  readonly view: CalendarView;
  readonly resolved: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly model: WeekModel;
  readonly today: string;
  /** 当前显示周期的锚点日。 */
  readonly anchor: string;
  readonly timezone: string;
  readonly scopedActivities: readonly ActivitySummary[];
  readonly scopedEvents: readonly CalendarEventDTO[];
  readonly scaleDays: readonly number[];
  readonly isCurrentPeriod: boolean;
  readonly viewControl: React.ReactNode;
  readonly onAnchorChange: (anchor: string | null) => void;
  readonly onSelectDate: (day: string, mode?: DaySheetMode) => void;
  readonly onPlanPeriod: () => void;
  readonly onRetry: () => void;
}

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
  const summary = (
    <TrainingPeriodSummary
      comparison={props.model.comparison}
      periodKind={props.view}
      isCurrentPeriod={props.isCurrentPeriod}
      onPlan={props.onPlanPeriod}
    />
  );
  if (props.view === "week") {
    return (
      <div key="week" className="view-swap grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="order-1 space-y-3 lg:order-2 lg:col-span-4">
          {summary}
          {props.model.comparison.hasPlan ? (
            <DisclosureCard
              title="计划质量评估"
              summary={<PlanQualityVerdict from={props.model.comparison.from} to={props.model.comparison.to} />}
            >
              <PlanQuality from={props.model.comparison.from} to={props.model.comparison.to} />
            </DisclosureCard>
          ) : null}
        </div>
        <div className="order-2 space-y-3 lg:order-1 lg:col-span-8">
          <TrainingConnectionNotice />
          <TrainingWeekView
            model={props.model}
            anchor={props.anchor}
            today={props.today}
            viewControl={props.viewControl}
            onAnchorChange={props.onAnchorChange}
            onSelectDate={props.onSelectDate}
          />
        </div>
      </div>
    );
  }
  return (
    <div key="month" className="view-swap grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
      <div className="order-2 lg:order-1 lg:col-span-8">
        <TrainingMonthView
          activities={props.scopedActivities}
          events={props.scopedEvents}
          timezone={props.timezone}
          today={props.today}
          anchor={props.anchor}
          scaleDays={props.scaleDays}
          viewControl={props.viewControl}
          onAnchorChange={props.onAnchorChange}
          onSelectDate={(day) => props.onSelectDate(day)}
        />
      </div>
      <div className="order-1 lg:order-2 lg:col-span-4">
        {summary}
      </div>
    </div>
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
