/**
 * Runtime chart token reader — reads CSS variables from :root/.dark
 * so ECharts colors respond to theme changes (light/dark).
 *
 * Usage: call inside useEffect/useECharts callback, not at module level.
 *
 * v7 additions:
 * - OKABE_ITO: colorblind-safe categorical palette (8 colors) for non-semantic series.
 * - PMC semantic colors (ctl/atl/tsb) remain convention blue/violet/gold via CSS vars.
 * - chart-accent: Winter Sky Indigo accent (#5a6f9a) via CSS var.
 */

/**
 * Okabe-Ito colorblind-safe categorical palette (8 colors).
 * Source: https://jfly.uni-graz.at/wp-content/uploads/2020/09/ColorblindFriendlyPoints.pdf
 * Use for non-semantic series (e.g., multi-stream charts, category comparisons).
 * PMC series use semantic colors (ctl/atl/tsb) from CSS vars, NOT this palette.
 */
export const OKABE_ITO: readonly string[] = [
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#009E73", // bluish green
  "#F0E442", // yellow
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#CC79A7", // reddish purple
  "#000000", // black
];

export interface ChartColors {
  ctl: string;
  atl: string;
  tsb: string;
  move: string;
  exercise: string;
  stand: string;
  hrRest: string;
  sleep: string;
  weight: string;
  success: string;
  warning: string;
  error: string;
  accent: string;
  zone1: string;
  zone2: string;
  zone3: string;
  zone4: string;
  zone5: string;
  sportRun: string;
  sportVirtualRun: string;
  sportTrailRun: string;
  sportRide: string;
  sportVirtualRide: string;
  sportBike: string;
  sportSwim: string;
  sportWalk: string;
  sportHike: string;
  sportAlpineSki: string;
  sportWorkout: string;
  sportWeightTraining: string;
  dataEmphasis: string;
  loadHeatmap: string;
  calendarToday: string;
  activePhase: string;
  surfaceRaised: string;
  surfaceCard: string;
  surfaceBase: string;
  surfaceOverlay: string;
  borderSubtle: string;
  borderDefault: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}


/** Expand #rgb / rgb() to #rrggbb so alpha suffixes are legal for Canvas. */
export function normalizeCssColor(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const m8 = /^#([0-9a-fA-F]{8})$/.exec(v);
  const hex8 = m8?.[1];
  if (hex8) return `#${hex8.slice(0, 6)}`;
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(v);
  const hex6 = m6?.[1];
  if (hex6) return `#${hex6}`;
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(v);
  const short = m3?.[1] ?? "";
  if (short.length === 3) {
    const r = short[0] ?? "0";
    const g = short[1] ?? "0";
    const b = short[2] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (rgb) {
    const toHex = (n: string | undefined) =>
      Math.max(0, Math.min(255, Number(n ?? 0))).toString(16).padStart(2, "0");
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }
  return v;
}

/**
 * Append an 8-bit alpha hex (e.g. "20") to a color for ECharts gradients.
 * Never concatenates onto short hex (#06c + "20" → illegal #06c20).
 */
export function withAlpha(color: string, alphaHex: string): string {
  const base = normalizeCssColor(color);
  if (!base) return "transparent";
  if (!/^#([0-9a-fA-F]{6})$/.test(base)) return base;
  const a = alphaHex.replace(/^#/, "").slice(0, 2).padStart(2, "0");
  return `${base}${a}`;
}

function readVar(name: string): string {
  if (typeof window === "undefined") return "";
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return normalizeCssColor(value);
}

/** Read all chart-relevant CSS variables. Call inside useEffect. */
export function getChartColors(): ChartColors {
  return {
    ctl: readVar("--color-ctl"),
    atl: readVar("--color-atl"),
    tsb: readVar("--color-tsb"),
    move: readVar("--color-move"),
    exercise: readVar("--color-exercise"),
    stand: readVar("--color-stand"),
    hrRest: readVar("--color-hr-rest"),
    sleep: readVar("--color-sleep"),
    weight: readVar("--color-weight"),
    success: readVar("--color-success"),
    warning: readVar("--color-warning"),
    error: readVar("--color-error"),
    accent: readVar("--color-chart-accent"),
    zone1: readVar("--color-zone-1"),
    zone2: readVar("--color-zone-2"),
    zone3: readVar("--color-zone-3"),
    zone4: readVar("--color-zone-4"),
    zone5: readVar("--color-zone-5"),
    sportRun: readVar("--color-sport-run"),
    sportVirtualRun: readVar("--color-sport-virtualrun"),
    sportTrailRun: readVar("--color-sport-trailrun"),
    sportRide: readVar("--color-sport-ride"),
    sportVirtualRide: readVar("--color-sport-virtualride"),
    sportBike: readVar("--color-sport-bike"),
    sportSwim: readVar("--color-sport-swim"),
    sportWalk: readVar("--color-sport-walk"),
    sportHike: readVar("--color-sport-hike"),
    sportAlpineSki: readVar("--color-sport-alpineski"),
    sportWorkout: readVar("--color-sport-workout"),
    sportWeightTraining: readVar("--color-sport-weighttraining"),
    dataEmphasis: readVar("--color-data-emphasis"),
    loadHeatmap: readVar("--color-load-heatmap"),
    calendarToday: readVar("--color-calendar-today"),
    activePhase: readVar("--color-active-phase"),
    surfaceRaised: readVar("--color-surface-raised"),
    surfaceCard: readVar("--color-surface-card"),
    surfaceBase: readVar("--color-surface-base"),
    surfaceOverlay: readVar("--color-surface-overlay"),
    borderSubtle: readVar("--color-border-subtle"),
    borderDefault: readVar("--color-border-default"),
    textPrimary: readVar("--color-text-primary"),
    textSecondary: readVar("--color-text-secondary"),
    textMuted: readVar("--color-text-muted"),
  };
}
