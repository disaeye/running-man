import type { EChartsCoreOption } from "echarts/core";
import type { ChartConfig } from "@shared/hooks/useChartConfig";
import { getTsbBands, type TsbBandTone } from "@features/pmc/lib/pmc-bands";
import type { WorkoutPredictionPoint } from "@features/calendar/components/types";

export const FORECAST_SERIES = ["实际 TSS", "计划TSS", "预测TSS", "CTL", "ATL", "TSB"] as const;

interface ForecastOptionParams {
  readonly chartConfig: ChartConfig;
  readonly chartPoints: readonly WorkoutPredictionPoint[];
  readonly historical: Readonly<Record<string, number>>;
  readonly planned: Readonly<Record<string, number>>;
}

type ForecastRiskMarkPoint = {
  readonly coord: readonly [number, number];
  readonly itemStyle: { readonly color: string };
};

function isForecastRiskMarkPoint(value: ForecastRiskMarkPoint | null): value is ForecastRiskMarkPoint {
  return value !== null;
}

function bandColor(tone: TsbBandTone, chartConfig: ChartConfig): string {
  const colors = chartConfig.colors;
  switch (tone) {
    case "error":
      return colors.error;
    case "warning":
      return colors.warning;
    case "accent":
      return colors.accent;
    case "success":
      return colors.success;
  }
}

function projectedValue(
  pointsByDay: ReadonlyMap<string, WorkoutPredictionPoint>,
  day: string,
  metric: keyof Pick<WorkoutPredictionPoint, "projected_tss" | "projected_ctl" | "projected_atl" | "projected_tsb">,
): number | null {
  return pointsByDay.get(day)?.[metric] ?? null;
}

export function buildForecastOption({ chartConfig, chartPoints, historical, planned }: ForecastOptionParams): EChartsCoreOption {
  const colors = chartConfig.colors;
  const baseOption = chartConfig.baseOption;
  const pointsByDay = new Map(chartPoints.map((point) => [point.day, point]));
  const days = Array.from(new Set([...Object.keys(historical), ...Object.keys(planned), ...pointsByDay.keys()])).sort();
  const tsbBands = getTsbBands(chartConfig.isDark);

  return {
    ...baseOption,
    legend: {
      ...baseOption.legend,
      data: [...FORECAST_SERIES],
      type: "scroll",
      top: 4,
      left: "center",
      width: "92%",
    },
    grid: { left: 28, right: 36, top: 56, bottom: 32, containLabel: true },
    xAxis: {
      ...baseOption.xAxis,
      data: days.map(formatAxisDay),
      axisLabel: { color: colors.textMuted, fontSize: 11, interval: "auto", hideOverlap: true, margin: 10 },
    },
    yAxis: [
      {
        ...baseOption.yAxis,
        name: "负荷",
        nameGap: 12,
        nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      },
      {
        type: "value",
        name: "TSB",
        nameGap: 12,
        nameTextStyle: { color: colors.textMuted, fontSize: 10 },
        min: -50,
        max: 50,
        splitLine: { show: false },
        axisLabel: { color: colors.textMuted, fontSize: 10 },
      },
    ],
    series: [
      { name: "实际 TSS", type: "bar", data: days.map((day) => historical[day] ?? null), itemStyle: { color: colors.textMuted, opacity: 0.42 } },
      { name: "计划TSS", type: "bar", data: days.map((day) => planned[day] ?? null), itemStyle: { color: colors.accent, opacity: 0.38 } },
      { name: "预测TSS", type: "line", data: days.map((day) => projectedValue(pointsByDay, day, "projected_tss")), smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: colors.success, type: "dashed" }, itemStyle: { color: colors.success } },
      { name: "CTL", type: "line", data: days.map((day) => projectedValue(pointsByDay, day, "projected_ctl")), smooth: true, showSymbol: false, lineStyle: { width: 2, color: colors.ctl }, itemStyle: { color: colors.ctl } },
      { name: "ATL", type: "line", data: days.map((day) => projectedValue(pointsByDay, day, "projected_atl")), smooth: true, showSymbol: false, lineStyle: { width: 2, color: colors.atl }, itemStyle: { color: colors.atl } },
      {
        name: "TSB", type: "line", yAxisIndex: 1, data: days.map((day) => projectedValue(pointsByDay, day, "projected_tsb")), smooth: true, showSymbol: false,
        lineStyle: { width: 1.5, color: colors.tsb }, itemStyle: { color: colors.tsb },
        markLine: {
          silent: true,
          symbol: "none",
          label: { color: colors.textMuted, formatter: "{b}" },
          lineStyle: { color: colors.borderSubtle, type: "dashed" },
          data: [
            { name: "风险 -30", yAxis: -30 },
            { name: "疲劳 -10", yAxis: -10 },
            { name: "平衡 0", yAxis: 0 },
            { name: "新鲜 +10", yAxis: 10 },
          ],
        },
        markArea: {
          silent: true,
          label: { color: colors.textMuted, fontSize: 10 },
          data: tsbBands.map((band) => [
            { name: band.label, yAxis: band.min, itemStyle: { color: bandColor(band.tone, chartConfig), opacity: band.opacity } },
            { yAxis: band.max },
          ]),
        },
        markPoint: {
          symbolSize: 6,
          data: chartPoints
            .map((point) => {
              const coord = [days.indexOf(point.day), point.projected_tsb] as const;
              if (point.is_overtraining_risk || point.is_high_load_risk) return { coord, itemStyle: { color: colors.error } };
              if (point.is_fresh) return { coord, itemStyle: { color: colors.success } };
              return null;
            })
            .filter(isForecastRiskMarkPoint),
        },
      },
    ],
  };
}

function formatAxisDay(day: string): string {
  const [, month, date] = day.split("-");
  return month && date ? `${month}/${date}` : day;
}
