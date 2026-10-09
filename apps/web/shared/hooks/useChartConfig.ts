"use client";

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { buildBaseOption } from "@shared/lib/chart-preset";
import { getChartColors, type ChartColors } from "@shared/lib/chart-tokens";

export interface ChartConfig {
  readonly colors: ChartColors;
  readonly baseOption: EChartsOption;
  readonly isDark: boolean;
}

interface ThemeSnapshot {
  readonly colors: ChartColors;
  readonly isDark: boolean;
}

function readThemeSnapshot(): ThemeSnapshot {
  if (typeof document === "undefined") {
    return { colors: getChartColors(), isDark: false };
  }
  const root = document.documentElement;
  return {
    colors: getChartColors(),
    isDark: root.classList.contains("dark"),
  };
}

export function useChartConfig(): ChartConfig {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>(() => readThemeSnapshot());

  useEffect(() => {
    const root = document.documentElement;
    const updateSnapshot = () => setSnapshot(readThemeSnapshot());
    const observer = new MutationObserver(updateSnapshot);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("storage", updateSnapshot);
    updateSnapshot();
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", updateSnapshot);
    };
  }, []);

  const baseOption = useMemo(
    () => buildBaseOption({ colors: snapshot.colors }),
    [snapshot.colors],
  );

  return useMemo(
    () => ({ colors: snapshot.colors, baseOption, isDark: snapshot.isDark }),
    [baseOption, snapshot.colors, snapshot.isDark],
  );
}
