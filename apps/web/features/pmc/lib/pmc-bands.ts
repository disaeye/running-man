export type TsbBandTone = "error" | "warning" | "accent" | "success";

export interface TsbBand {
  readonly label: string;
  readonly shortLabel: string;
  readonly min: number;
  readonly max: number;
  readonly tone: TsbBandTone;
  readonly opacity: number;
}

export function getTsbBands(isDark: boolean): readonly TsbBand[] {
  const softOpacity = isDark ? 0.14 : 0.1;
  const quietOpacity = isDark ? 0.1 : 0.06;

  return [
    {
      label: "过载风险",
      shortLabel: "风险 -30",
      min: -50,
      max: -30,
      tone: "error",
      opacity: softOpacity,
    },
    {
      label: "疲劳累积",
      shortLabel: "疲劳 -10",
      min: -30,
      max: -10,
      tone: "warning",
      opacity: softOpacity,
    },
    {
      label: "TSB",
      shortLabel: "平衡 -10 至 +10",
      min: -10,
      max: 10,
      tone: "accent",
      opacity: quietOpacity,
    },
    {
      label: "新鲜窗口",
      shortLabel: "新鲜 +10",
      min: 10,
      max: 50,
      tone: "success",
      opacity: softOpacity,
    },
  ] as const;
}
