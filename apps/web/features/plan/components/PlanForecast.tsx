"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { RotateCw } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import "@shared/lib/echarts-setup";
import { useChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import { TSB_ZONES } from "@features/pmc/components/pmcSemantics";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  getPmcApiV1PmcGet,
  predictWorkoutApiV1WorkoutsPredictPost,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { nn } from "@shared/lib/dto-nullable";
import { computeRange } from "@shared/lib/format";
import { LOADING_LABEL } from "@shared/lib/use-data-state";
import type { CalendarEventDTO, WorkoutPredictionPoint } from "@features/calendar/components/types";
import { buildForecastOption } from "./PlanForecastChart";
import { PlanForecastSummary } from "./PlanForecastSummary";

interface Props { events: CalendarEventDTO[] }

type ForecastState =
  | { readonly kind: "empty" }
  | { readonly kind: "partial"; readonly message: string; readonly details: readonly string[]; readonly points: readonly WorkoutPredictionPoint[]; readonly historical: Readonly<Record<string, number>>; readonly planned: Readonly<Record<string, number>> }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "valid"; readonly points: readonly WorkoutPredictionPoint[]; readonly historical: Readonly<Record<string, number>>; readonly planned: Readonly<Record<string, number>> };

type RenderForecastState = ForecastState | { readonly kind: "loading" };

type ForecastRequest =
  | { readonly kind: "static"; readonly state: ForecastState }
  | { readonly kind: "remote"; readonly missingTss: readonly CalendarEventDTO[]; readonly planned: Readonly<Record<string, number>> };

const MIN_PMC_HISTORY_DAYS = 7, FORECAST_HORIZON_DAYS = 28;

function assertNever(value: never): never {
  throw new Error(`Unexpected forecast state: ${JSON.stringify(value)}`);
}

function isScheduledWorkout(event: CalendarEventDTO): boolean {
  return event.category !== "activity" && event.training_type !== "race"
    && event.status !== "deleted" && event.done !== true;
}

function hasPositiveTss(event: CalendarEventDTO): boolean {
  return event.predicted_tss != null && event.predicted_tss > 0;
}

function eventLabel(event: CalendarEventDTO): string {
  return event.name ?? event.start_time.slice(0, 10);
}

function plannedWorkouts(events: readonly CalendarEventDTO[]): Record<string, number> {
  return events.reduce<Record<string, number>>((planned, event) => {
    const tss = event.predicted_tss;
    if (tss != null && tss > 0) {
      planned[event.start_time.slice(0, 10)] = (planned[event.start_time.slice(0, 10)] ?? 0) + tss;
    }
    return planned;
  }, {});
}

function historicalLoad(points: readonly PmcPoint[]): Record<string, number> {
  return points.reduce<Record<string, number>>((historical, point) => {
    historical[point.day] = point.tss;
    return historical;
  }, {});
}

function forecastRequest(events: readonly CalendarEventDTO[]): ForecastRequest {
  const scheduled = events.filter(isScheduledWorkout);
  if (scheduled.length === 0) return { kind: "static", state: { kind: "empty" } };

  const missingTss = scheduled.filter((event) => !hasPositiveTss(event));
  const planned = plannedWorkouts(scheduled);
  if (Object.keys(planned).length === 0) {
    return { kind: "static", state: partialMissingTssState(missingTss, planned) };
  }

  return { kind: "remote", missingTss, planned };
}

function partialMissingTssState(
  missingTss: readonly CalendarEventDTO[],
  planned: Readonly<Record<string, number>>,
): ForecastState {
  return {
    kind: "partial",
    message: "补全 TSS 后可生成 28 日预测",
    details: missingTss.map(eventLabel),
    points: [],
    historical: {},
    planned,
  };
}

function completeForecastState(
  request: Extract<ForecastRequest, { readonly kind: "remote" }>,
  prediction: readonly WorkoutPredictionPoint[],
  historical: Readonly<Record<string, number>>,
): ForecastState {
  const partialReasons = [
    ...request.missingTss.map((event) => `缺少 TSS：${eventLabel(event)}`),
    ...(prediction.length < FORECAST_HORIZON_DAYS ? [`预测结果不完整：${prediction.length}/${FORECAST_HORIZON_DAYS} 天`] : []),
  ];
  if (partialReasons.length === 0) return { kind: "valid", points: prediction, historical, planned: request.planned };
  return { kind: "partial", message: "预测可用，但仍有计划数据需要补全", details: partialReasons, points: prediction, historical, planned: request.planned };
}

const PmcPointView = Generated.PmcPointResponse.pick({
  day: true,
  ctl: true,
  atl: true,
  tsb: true,
  tss: true,
  acwr: true,
});

function mapPmcPoint(row: z.input<typeof PmcPointView>): PmcPoint {
  return {
    day: row.day,
    ctl: row.ctl,
    atl: row.atl,
    tsb: row.tsb,
    tss: row.tss,
    acwr: nn(row.acwr),
  };
}

function chartData(forecast: RenderForecastState) {
  if (forecast.kind !== "valid" && forecast.kind !== "partial") return { chartPoints: [], historical: {}, planned: {} };
  return { chartPoints: forecast.points, historical: forecast.historical, planned: forecast.planned };
}

export function PlanForecast({ events }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const request = useMemo(() => forecastRequest(events), [events]);

  const { from, to } = computeRange(90);
  const {
    data: pmcPoints,
    error: pmcError,
    isLoading: pmcLoading,
    mutate: mutatePmc,
  } = useSWR<PmcPoint[]>(request.kind === "remote" ? ["/pmc", { from, to }] : null, {
    fetcher: () =>
      callOrvalValidated(
        (f) => getPmcApiV1PmcGet({ from, to }, {}, f),
        z.array(PmcPointView),
      ).then((rows) => rows.map(mapPmcPoint)),
    shouldRetryOnError: false,
  });

  const prediction = useMemo<Generated.WorkoutPredictionRequest | null>(() => {
    if (request.kind !== "remote" || !pmcPoints || pmcPoints.length < MIN_PMC_HISTORY_DAYS) return null;
    const last = pmcPoints[pmcPoints.length - 1];
    if (!last) return null;
    return {
      historical_daily_tss: historicalLoad(pmcPoints),
      planned_workouts: request.planned,
      current_ctl: last.ctl,
      current_atl: last.atl,
      horizon_days: FORECAST_HORIZON_DAYS,
    };
  }, [request, pmcPoints]);

  const {
    data: predicted,
    error: predictError,
    isLoading: predictLoading,
  } = useSWR<readonly WorkoutPredictionPoint[]>(
    prediction ? ["/workouts/predict", refreshNonce, prediction] : null,
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => predictWorkoutApiV1WorkoutsPredictPost(prediction!, {}, f),
          z.array(Generated.WorkoutPredictionPoint),
        ),
      shouldRetryOnError: false,
    },
  );

  const forecast = useMemo<RenderForecastState>(() => {
    if (request.kind === "static") return request.state;
    if (pmcError) return { kind: "error", message: pmcError instanceof Error ? pmcError.message : "预测失败" };
    if (pmcLoading) return { kind: "loading" };

    const historical = historicalLoad(pmcPoints ?? []);
    if (!pmcPoints || pmcPoints.length < MIN_PMC_HISTORY_DAYS) {
      return {
        kind: "partial",
        message: "历史 PMC 数据不足，先完成更多训练再预测趋势",
        details: [`当前 ${pmcPoints?.length ?? 0} 天，需要至少 ${MIN_PMC_HISTORY_DAYS} 天`],
        points: [], historical, planned: request.planned,
      };
    }
    if (predictError) return { kind: "error", message: predictError instanceof Error ? predictError.message : "预测失败" };
    if (predictLoading || !predicted) return { kind: "loading" };
    return completeForecastState(request, predicted, historical);
  }, [request, pmcPoints, pmcError, pmcLoading, predicted, predictError, predictLoading]);

  const { chartPoints, historical, planned } = useMemo(() => chartData(forecast), [forecast]);
  const refreshForecast = useCallback(
    () => { setRefreshNonce((value) => value + 1); void mutatePmc(); },
    [mutatePmc],
  );

  const buildOption = useCallback(
    () => buildForecastOption({ chartConfig, chartPoints, historical, planned }),
    [chartPoints, historical, planned, chartConfig],
  );

  useECharts(chartRef, buildOption, [chartPoints, historical, planned, chartConfig], { chartConfig });

  const renderOverlay = () => {
    if (forecast.kind === "loading") return <div className="absolute inset-0 flex items-center justify-center text-subheadline text-text-secondary">{LOADING_LABEL}</div>;
    switch (forecast.kind) {
      case "empty":
        return <div data-testid="plan-forecast-empty" className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center"><p className="text-subheadline text-text-secondary">暂无计划训练</p><p className="text-caption1 text-text-muted">在日历上添加训练后，将预测 28 天负荷趋势</p></div>;
      case "error":
        return <div data-testid="plan-forecast-error" className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"><p className="text-subheadline text-error">预测加载失败</p><p className="text-caption1 text-text-muted">{forecast.message}</p></div>;
      case "partial":
        return <div data-testid="plan-forecast-partial" className="absolute inset-x-4 bottom-3 rounded-lg border border-border-default bg-surface-card/95 px-4 py-3 text-left shadow-elevated"><p className="text-subheadline font-medium text-text-primary">{forecast.message}</p><p className="mt-1 text-caption1 text-text-muted">{forecast.details.slice(0, 3).join(" / ")}</p></div>;
      case "valid":
        return null;
      default:
        return assertNever(forecast);
    }
  };

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <div>
          <h3 className="text-subheadline font-semibold text-text-primary">28日训练负荷预测</h3>
          <p className="mt-1 hidden text-caption1 text-text-muted lg:block">
            {TSB_ZONES.map((zone) => zone.shortLabel).join(" / ")}
          </p>
        </div>
        <Button variant="ghost" onClick={refreshForecast} aria-label="刷新预测">
          <RotateCw className="size-4" aria-hidden />
        </Button>
      </div>

      {/* Mobile progressive disclosure: simplified summary card. */}
      <div className="px-3 pb-3 lg:hidden">
        <PlanForecastSummary
          events={events}
          points={chartPoints}
          planned={planned}
        />
      </div>

      {/* Desktop chart hidden on mobile to avoid squeezing 7-axis series into 390px. */}
      <div data-testid="plan-forecast-chart" className="relative hidden min-h-[22rem] w-full px-3 pb-2 lg:block">
        <div ref={chartRef} data-testid="plan-forecast-chart-root" className="h-[22rem] w-full" />
        {renderOverlay()}
      </div>
      {(forecast.kind === "valid" || forecast.kind === "partial") && chartPoints.length > 0 && (
        <div className="hidden flex-wrap gap-x-4 gap-y-1 border-t border-border-default px-3 py-2 text-caption1 text-text-muted lg:flex">
          <span>实际负荷</span>
          <span>计划负荷</span>
          <span>PMC 轨迹</span>
          <span>CTL / ATL / TSB</span>
          <span>风险 / 新鲜区间</span>
        </div>
      )}
    </Card>
  );
}
