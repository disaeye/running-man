"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import type { ChartConfig } from "./useChartConfig";

interface UseEChartsOptions {
  readonly chartConfig?: ChartConfig;
}

function mergeChartOption(baseOption: EChartsCoreOption, option: EChartsCoreOption): EChartsCoreOption {
  return echarts.util.merge(echarts.util.clone(baseOption), option, true);
}

/**
 * Shared hook extracting ECharts lifecycle (init / resize / setOption / dispose)
 * from chart components. Keeps chart-specific config (series, axes, tooltip)
 * in the component.
 *
 * Applies the registered v7 theme (v7-light / v7-dark) on init and re-initialises
 * when the theme changes (light ↔ dark toggle) so structural defaults
 * (OKABE_ITO categorical palette, grid, axis, tooltip, legend) stay in sync.
 *
 * @param containerRef - ref to the chart container `<div>`
 * @param buildOption  - function returning the current ECharts option object
 * @param deps         - dependency array fed to the option-update effect
 */
export function useECharts(
  containerRef: React.RefObject<HTMLDivElement | null>,
  buildOption: () => EChartsCoreOption,
  deps: React.DependencyList,
  options: UseEChartsOptions = {},
) {
  const chartRef = useRef<echarts.ECharts | null>(null);
  const themeName = options.chartConfig?.isDark ? "v7-dark" : "v7-light";

  // Track container appearance as state: components may mount their chart
  // <div> conditionally (only after data arrives), so the ref can resolve to
  // null at hook mount and to an element on a later render. Refs cannot be
  // read in an effect dependency array (react-hooks/refs), so mirror the
  // resolved element into state — the init effect below re-runs when it
  // changes.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (containerRef.current !== container) {
      setContainer(containerRef.current);
    }
  }, [containerRef, container]);

  // --- mount: init chart with v7 theme + ResizeObserver + dispose on unmount ---
  // Re-runs when themeName changes (light ↔ dark) so the new theme is applied,
  // and when the container appears/disappears (conditional chart mounts).
  useEffect(() => {
    if (!container) return;

    const chart = echarts.init(container, themeName);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [themeName, container]);

  // --- update: push new option whenever deps change ---
  useEffect(() => {
    if (!chartRef.current) return;
    const option = buildOption();
    chartRef.current.setOption(
      options.chartConfig ? mergeChartOption(options.chartConfig.baseOption, option) : option,
      true,
    );
    // deps is the caller-supplied dependency array (e.g. [data])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, options.chartConfig?.baseOption]);
}
