/**
 * Measurement primitives for the UX contract gate: overflow, touch-target
 * size and console errors, all read off one loaded document.
 *
 * They live here rather than in the spec because the spec declares one test
 * per (layer, route, width) surface, and the spec file has a 250-line
 * budget — the primitives are shared by every surface, the declaration is
 * per surface.
 *
 * The thresholds, selector and skips are the same as the visual gate's
 * `assertUxContract`; the two gates must agree on what "too small" means.
 */
import type { Page } from "@playwright/test";

/**
 * Tailwind utility prefixes. A class token whose prefix lands here says nothing
 * about identity, so the first token that misses this list is the one to report
 * (`shell-main-inner`, `rail-athlete`, …).
 */
export const UTILITY_PREFIXES: readonly string[] = [
  "flex", "inline", "grid", "block", "hidden", "static", "fixed", "absolute", "relative", "sticky",
  "items", "justify", "content", "self", "place", "gap", "space", "p", "px", "py", "pt", "pb", "pl", "pr",
  "m", "mx", "my", "mt", "mb", "ml", "mr", "w", "h", "min", "max", "size", "text", "font", "leading",
  "tracking", "rounded", "border", "bg", "ring", "shadow", "transition", "duration", "delay", "ease",
  "animate", "motion", "cursor", "overflow", "truncate", "shrink", "grow", "basis", "order", "z", "top",
  "right", "bottom", "left", "inset", "opacity", "outline", "divide", "appearance", "whitespace", "break",
  "aspect", "col", "row", "sr-only", "focus", "hover", "active", "disabled", "group", "peer", "antialiased",
  "transform", "scale", "rotate", "translate", "snap", "touch", "resize", "fill", "stroke", "object", "origin",
  "backdrop", "filter", "blur", "will", "pointer", "isolate", "float", "list", "align", "indent", "select",
];

export const MIN_TARGET_HEIGHT = 40;
export const TARGET_SELECTOR = 'button, [role="button"], [role="combobox"], select, input';

/**
 * Charts and SWR revalidations mount after `networkidle`, as in the visual
 * gate. The wait for that is a condition, not a duration: font metrics decide
 * line height and therefore control height, and the target count depends on
 * text measurement, so the page has to be measured after the fonts are in.
 * Two animation frames cover one layout plus one paint — the first callback
 * runs before the paint, the second after it — so one settled frame is
 * guaranteed to have been measured.
 */
export const SETTLE_SCRIPT = async (): Promise<void> => {
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};

const HTML_SLICE = 300;
const VALUE_SLICE = 24;

export interface TargetRow {
  readonly kind: string; readonly value: string; readonly tag: string;
  readonly height: number; readonly html: string;
}

export interface SurfaceResult {
  readonly overflowed: boolean; readonly scrollWidth: number; readonly clientWidth: number;
  readonly targetCount: number; readonly rows: readonly TargetRow[];
}

export async function measureSurface(page: Page): Promise<SurfaceResult> {
  return page.evaluate(
    ({ selector, minHeight, utilityPrefixes, htmlSlice, valueSlice }) => {
      const identityClass = (el: Element): string => {
        for (const token of (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)) {
          if (token.includes(":")) continue;
          if (utilityPrefixes.includes(token.split("-")[0] ?? token)) continue;
          return token;
        }
        return "";
      };
      const identify = (el: Element): { kind: string; value: string } => {
        const candidates: ReadonlyArray<readonly [string, string]> = [
          ["aria-label", el.getAttribute("aria-label") ?? ""],
          ["name", el.getAttribute("name") ?? ""],
          ["text", (el.textContent ?? "").trim()],
          ["data-testid", el.getAttribute("data-testid") ?? ""],
          ["data-slot", el.getAttribute("data-slot") ?? ""],
          ["class", identityClass(el)],
        ];
        for (const [kind, raw] of candidates) {
          const value = raw.trim();
          if (value) return { kind, value: value.slice(0, valueSlice) };
        }
        return { kind: "tag", value: el.tagName };
      };
      const rows: TargetRow[] = [];
      const targets = [...document.querySelectorAll(selector)];
      for (const el of targets) {
        if (el.hasAttribute("disabled")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height === 0) continue; // display:none — not a rendered target
        if (rect.height >= minHeight) continue;
        const { kind, value } = identify(el);
        rows.push({
          kind, value, tag: el.tagName,
          height: Math.round(rect.height * 10) / 10,
          html: el.outerHTML.slice(0, htmlSlice).replace(/\s+/g, " "),
        });
      }
      const root = document.documentElement;
      return {
        overflowed: root.scrollWidth > root.clientWidth,
        scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
        targetCount: targets.length, rows,
      };
    },
    {
      selector: TARGET_SELECTOR, minHeight: MIN_TARGET_HEIGHT,
      utilityPrefixes: UTILITY_PREFIXES, htmlSlice: HTML_SLICE, valueSlice: VALUE_SLICE,
    },
  );
}

/** The elements whose right edge crosses the viewport — the actual cause. */
export async function findOverflowCulprits(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => element.getBoundingClientRect().right > viewportWidth + 1)
      .slice(0, 6)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const classes = (element.getAttribute("class") ?? "").split(/\s+/).slice(0, 3).join(".");
        return `${element.tagName.toLowerCase()}.${classes} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`;
      });
  });
}

/**
 * `/_not-found` is a 404 page, so its own document request logs a 404 console
 * entry that no app change can remove. The visual gate filters the same case.
 */
export function isUnavoidableConsoleEntry(url: string): boolean {
  return url.includes("/_not-found");
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("rm.theme", selectedTheme);
  }, theme);
}
