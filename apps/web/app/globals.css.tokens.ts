// Extracted token tables for globals.css design-system contract test.
// Kept in a sibling module so the test file stays under the 250 LOC ceiling.

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/** Page paper is winter overcast; text contrast is vs card white (glass surface). */
export const LIGHT_SURFACE = "#ffffff";
export const DARK_SURFACE = "#0a0c12";

export const REQUIRED_VALUES = {
  light: {
    "--color-accent": "#5a6f9a",
    "--color-chrome-accent": "#5a6f9a",
    "--color-primary": "#5a6f9a",
    "--color-ring": "#7a8fb5",
    "--color-surface-base": "#eef2f6",
    "--color-surface-raised": "#ffffff",
    "--color-surface-card": "#ffffff",
    "--color-accent-strong": "#3d4f73",
    "--color-chart-accent": "#5a6f9a",
    "--color-surface-dark": "#1d1d1f",
    "--color-ctl": "#0066cc",
    "--color-atl": "#8742AF",
    "--color-tsb": "#946018",
  },
  dark: {
    "--color-accent": "#8a9bb8",
    "--color-chrome-accent": "#8a9bb8",
    "--color-primary": "#8a9bb8",
    "--color-ring": "#a8b6ce",
    "--color-surface-base": "#0a0c12",
    "--color-surface-raised": "#12151c",
    "--color-surface-card": "#10131a",
    "--color-accent-strong": "#c5d0e0",
    "--color-chart-accent": "#8a9bb8",
    "--color-ctl": "#2997ff",
    "--color-atl": "#BF7EE8",
    "--color-tsb": "#E8B454",
  },
} as const;

export const REQUIRED_THEME_TOKENS = [
  "--color-accent",
  "--color-chrome-accent",
  "--color-primary",
  "--color-ring",
  "--color-surface-dark",
  "--color-surface-dark-elevated",
  "--color-surface-dark-soft",
  "--color-on-primary",
  "--color-on-dark",
  "--color-on-dark-soft",
  "--color-ink",
  "--color-accent-strong",
  "--color-chart-accent",
  "--color-primary-active",
  "--color-primary-disabled",
  "--color-sport-run",
  "--color-sport-virtualrun",
  "--color-sport-trailrun",
  "--color-sport-ride",
  "--color-sport-virtualride",
  "--color-sport-bike",
  "--color-sport-swim",
  "--color-sport-walk",
  "--color-sport-hike",
  "--color-sport-alpineski",
  "--color-sport-workout",
  "--color-sport-weighttraining",
  "--color-data-emphasis",
  "--color-load-heatmap",
  "--color-calendar-today",
  "--color-active-phase",
  "--color-decor-rose",
  "--color-decor-rose-10",
  "--color-decor-rose-20",
  "--color-decor-rose-60",
  "--color-decor-mint",
  "--color-decor-mint-10",
  "--color-decor-mint-20",
  "--color-decor-mint-60",
  "--color-decor-butter",
  "--color-decor-butter-10",
  "--color-decor-butter-20",
  "--color-decor-butter-60",
  "--color-decor-lavender",
  "--color-decor-lavender-10",
  "--color-decor-lavender-20",
  "--color-decor-lavender-60",
  "--color-decor-peach",
  "--color-decor-peach-10",
  "--color-decor-peach-20",
  "--color-decor-peach-60",
  "--color-decor-sky",
  "--color-decor-sky-10",
  "--color-decor-sky-20",
  "--color-decor-sky-60",
] as const;

export const TEXT_USED_TOKENS = [
  "--color-accent-strong",
  "--color-ctl",
  "--color-atl",
  "--color-tsb",
  "--color-hr-rest",
  "--color-sleep",
  "--color-weight",
  "--color-recovery-good",
  "--color-recovery-moderate",
  "--color-recovery-poor",
  "--color-zone-1",
  "--color-zone-2",
  "--color-zone-3",
  "--color-zone-4",
  "--color-zone-5",
  "--color-sport-run",
  "--color-sport-virtualrun",
  "--color-sport-trailrun",
  "--color-sport-ride",
  "--color-sport-virtualride",
  "--color-sport-bike",
  "--color-sport-swim",
  "--color-sport-walk",
  "--color-sport-hike",
  "--color-sport-alpineski",
  "--color-sport-workout",
  "--color-sport-weighttraining",
  "--color-data-emphasis",
  "--color-load-heatmap",
  "--color-calendar-today",
  "--color-active-phase",
  "--color-decor-rose",
  "--color-decor-mint",
  "--color-decor-butter",
  "--color-decor-lavender",
  "--color-decor-peach",
  "--color-decor-sky",
] as const;

export function section(css: string, selector: ":root" | ".dark" | "@theme inline"): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(css);
  const body = match?.[1];
  if (body === undefined) throw new Error(`Missing CSS section ${selector}`);
  return body;
}

export function tokenValue(body: string, token: string): string {
  const match = new RegExp(`${token}:\\s*([^;]+);`, "i").exec(body);
  const value = match?.[1]?.trim();
  if (value === undefined) throw new Error(`Missing token ${token}`);
  return value;
}

function rgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match?.[1];
  if (value === undefined) throw new Error(`Expected 6-digit hex, got ${hex}`);
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrast(foreground: string, background: string): number {
  const first = luminance(rgb(foreground));
  const second = luminance(rgb(background));
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

function lab(hex: string): readonly [number, number, number] {
  const linear = rgb(hex);
  const pivot = (value: number): number => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const x = pivot((0.4124 * linear.r + 0.3576 * linear.g + 0.1805 * linear.b) / 0.95047);
  const y = pivot(0.2126 * linear.r + 0.7152 * linear.g + 0.0722 * linear.b);
  const z = pivot((0.0193 * linear.r + 0.1192 * linear.g + 0.9505 * linear.b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function hue(a: number, b: number): number {
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return degrees >= 0 ? degrees : degrees + 360;
}

export function deltaE00(firstHex: string, secondHex: string): number {
  const [l1, a1, b1] = lab(firstHex);
  const [l2, a2, b2] = lab(secondHex);
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cMean = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp1 = hue(ap1, b1);
  const hp2 = hue(ap2, b2);
  const deltaL = l2 - l1;
  const deltaC = cp2 - cp1;
  const rawDeltaH = Math.abs(hp1 - hp2) <= 180 ? hp2 - hp1 : hp2 <= hp1 ? hp2 - hp1 + 360 : hp2 - hp1 - 360;
  const deltaH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((rawDeltaH * Math.PI) / 360);
  const lMean = (l1 + l2) / 2;
  const cpMean = (cp1 + cp2) / 2;
  const hpMean = Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos(((hpMean - 30) * Math.PI) / 180) + 0.24 * Math.cos((2 * hpMean * Math.PI) / 180) + 0.32 * Math.cos(((3 * hpMean + 6) * Math.PI) / 180) - 0.2 * Math.cos(((4 * hpMean - 63) * Math.PI) / 180);
  const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cpMean;
  const sh = 1 + 0.015 * cpMean * t;
  const rotation = 30 * Math.exp(-(((hpMean - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cpMean ** 7 / (cpMean ** 7 + 25 ** 7));
  const rt = -rc * Math.sin((2 * rotation * Math.PI) / 180);
  return Math.sqrt((deltaL / sl) ** 2 + (deltaC / sc) ** 2 + (deltaH / sh) ** 2 + rt * (deltaC / sc) * (deltaH / sh));
}
