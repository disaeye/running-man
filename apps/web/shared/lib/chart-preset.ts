import type { EChartsOption } from "echarts";
import { formatDuration as formatDurationValue, formatHeartRate, formatPace as formatPaceValue } from "./format";
import type { ChartColors } from "./chart-tokens";
import { OKABE_ITO } from "./chart-tokens";

export type ChartSeriesHint = string;

export interface BuildBaseOptionParams {
  readonly colors: ChartColors;
  readonly seriesHints?: readonly ChartSeriesHint[];
}

export function formatTss(value: number | null): string {
  if (value == null) return "--";
  return `${value.toFixed(1)} TSS`;
}

export function formatHr(value: number | null): string {
  return formatHeartRate(value);
}

export function formatPace(value: number | null): string {
  return formatPaceValue(value);
}

export function formatDuration(value: number | null): string {
  return formatDurationValue(value);
}

export function buildBaseOption({ colors, seriesHints = [] }: BuildBaseOptionParams): EChartsOption {
  return {
    backgroundColor: "transparent",
    textStyle: {
      color: colors.textSecondary,
      fontFamily: "system-ui, -apple-system, Segoe UI, Noto Sans SC, sans-serif",
      fontSize: 12,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderSubtle,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: colors.textSecondary, fontSize: 12 },
      axisPointer: { lineStyle: { color: colors.borderDefault } },
    },
    legend: {
      top: 0,
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 8,
      data: [...seriesHints],
      textStyle: { color: colors.textSecondary, fontSize: 11 },
    },
    grid: { left: 48, right: 16, top: 40, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      axisLine: { lineStyle: { color: colors.borderSubtle } },
      axisTick: { show: false },
      axisLabel: { color: colors.textMuted, fontSize: 11 },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: colors.borderSubtle, opacity: 0.3 } },
      axisLabel: { color: colors.textMuted, fontSize: 11 },
    },
  };
}

/**
 * v7 ECharts theme objects — registered in echarts-setup.ts.
 *
 * These provide base styling (grid, axis, tooltip, legend structure) for
 * light and dark modes. The categorical color palette is Okabe-Ito (colorblind-safe).
 *
 * Runtime CSS var colors (PMC semantic, chart-accent, etc.) are applied per-chart
 * via buildBaseOption(), which overrides these theme defaults.
 */

const FONT_FAMILY = "system-ui, -apple-system, Segoe UI, Noto Sans SC, sans-serif";

export const v7LightTheme = {
  color: OKABE_ITO,
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
  },
  grid: {
    left: 48,
    right: 16,
    top: 40,
    bottom: 24,
    containLabel: true,
  },
  categoryAxis: {
    axisTick: { show: false },
    axisLabel: { fontSize: 11 },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { opacity: 0.3 } },
    axisLabel: { fontSize: 11 },
  },
  tooltip: {
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { fontSize: 12 },
  },
  legend: {
    icon: "roundRect",
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { fontSize: 11 },
  },
};

export const v7DarkTheme = {
  color: OKABE_ITO,
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
  },
  grid: {
    left: 48,
    right: 16,
    top: 40,
    bottom: 24,
    containLabel: true,
  },
  categoryAxis: {
    axisTick: { show: false },
    axisLabel: { fontSize: 11 },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { opacity: 0.3 } },
    axisLabel: { fontSize: 11 },
  },
  tooltip: {
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { fontSize: 12 },
  },
  legend: {
    icon: "roundRect",
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { fontSize: 11 },
  },
};
