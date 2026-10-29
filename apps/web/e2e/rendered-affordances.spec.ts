/**
 * Rendered affordances — what the browser actually paints.
 *
 * The static token gate reads `--color-*` values out of the stylesheet. While
 * `--color-accent` was missing from `@theme inline`, Tailwind emitted no
 * `.bg-accent` rule at all, and the static gate happily reported 5.03:1 for
 * `text-on-accent` on `bg-accent`: the token was correct, the rule the browser
 * received did not exist. Every primary button rendered as a white label with
 * no fill and no border.
 *
 * Token arithmetic cannot see that. This spec measures computed styles on the
 * rendered page: filled button variants must actually have a fill, no text node
 * may fall below WCAG AA against the colour behind it, no request may return a
 * 5xx, and nothing may log an error.
 *
 * @tag: rendered-affordances
 */
import { test, expect, type Page } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

const ROUTES = ["/", "/activities", "/analysis", "/calendar", "/goals", "/settings"] as const;

/** Variants whose affordance is a fill. `ghost`, `link` and `outline` are not. */
const FILLED_VARIANTS = new Set(["default", "secondary", "destructive"]);

type RenderedReport = {
  readonly filllessButtons: readonly { text: string; variant: string | null }[];
  readonly lowContrast: readonly { text: string; ratio: number; limit: number }[];
  readonly transparentCards: readonly string[];
  readonly zeroSizedButtons: readonly { text: string; variant: string | null }[];
};

async function report(page: Page): Promise<RenderedReport> {
  return page.evaluate((filledVariants: string[]) => {
    const filled = new Set(filledVariants);

    const parse = (value: string) => {
      const match = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
      };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (
      first: { r: number; g: number; b: number },
      second: { r: number; g: number; b: number },
    ) => {
      const [a, b] = [luminance(first), luminance(second)];
      const high = Math.max(a, b);
      const low = Math.min(a, b);
      return (high + 0.05) / (low + 0.05);
    };
    const blend = (
      fg: { r: number; g: number; b: number; a: number },
      bg: { r: number; g: number; b: number; a: number },
    ) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const paintedBackground = (el: Element) => {
      let node: Element | null = el;
      let accumulated: { r: number; g: number; b: number; a: number } | null = null;
      while (node) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour && colour.a > 0) accumulated = accumulated ? blend(accumulated, colour) : colour;
        if (accumulated && accumulated.a >= 1) return accumulated;
        node = node.parentElement;
      }
      return accumulated ?? { r: 8, g: 10, b: 15, a: 1 };
    };
    const isTransparent = (value: string) =>
      value === "rgba(0, 0, 0, 0)" || value === "transparent" || value === "none";

    const filllessButtons: { text: string; variant: string | null }[] = [];
    const zeroSizedButtons: { text: string; variant: string | null }[] = [];
    for (const button of document.querySelectorAll("[data-slot='button'], button")) {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      const variant = button.getAttribute("data-variant");
      const text = (button.textContent || "").trim().slice(0, 24);
      // A zero box on a hidden node is a responsive duplicate, not a defect:
      // the desktop and mobile toolbars both exist in the DOM and only one is
      // painted. `checkVisibility` walks the ancestor chain for that.
      if (!button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (box.width === 0 || box.height === 0) {
        zeroSizedButtons.push({ text, variant });
        continue;
      }
      if (style.visibility === "hidden" || style.display === "none") continue;
      const bordered = parseFloat(style.borderTopWidth) > 0;
      if (variant && filled.has(variant) && isTransparent(style.backgroundColor) && !bordered) {
        filllessButtons.push({ text, variant });
      }
    }

    const lowContrast: { text: string; ratio: number; limit: number }[] = [];
    for (const el of document.querySelectorAll("*")) {
      const ownText = [...el.childNodes].some(
        (node) => node.nodeType === 3 && (node.textContent || "").trim().length > 1,
      );
      if (!ownText) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const foreground = parse(style.color);
      if (!foreground) continue;
      const background = paintedBackground(el);
      const effective = foreground.a < 1 ? blend(foreground, background) : foreground;
      const ratio = contrast(effective, background);
      const size = parseFloat(style.fontSize);
      const bold = Number.parseInt(style.fontWeight, 10) >= 700;
      const limit = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < limit) {
        lowContrast.push({
          text: (el.textContent || "").trim().slice(0, 26),
          ratio: Number(ratio.toFixed(2)),
          limit,
        });
      }
    }

    const transparentCards = [...document.querySelectorAll("[data-slot='card']")]
      .filter((card) => isTransparent(getComputedStyle(card).backgroundColor))
      .map((card) => (card.textContent || "").trim().slice(0, 20));

    return { filllessButtons, lowContrast, transparentCards, zeroSizedButtons };
  }, [...FILLED_VARIANTS]);
}

async function auditRoute(page: Page, route: string, theme: "light" | "dark") {
  const problems: string[] = [];
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text().slice(0, 160));
  });
  page.on("pageerror", (error) => failures.push(error.message.slice(0, 160)));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });

  if (route !== "/login") await mockDashboard(page);
  await page.addInitScript((value) => {
    window.localStorage.setItem("rm.theme", value);
  }, theme);
  const response = await page.goto(route, { waitUntil: "networkidle" });
  expect(response?.status(), `${route} did not render`).toBe(200);

  const painted = await report(page);
  const label = `${theme} ${route}`;
  expect(painted.filllessButtons, `${label}: filled variants with no fill`).toEqual([]);
  expect(painted.zeroSizedButtons, `${label}: buttons with no box`).toEqual([]);
  expect(painted.transparentCards, `${label}: cards with no fill`).toEqual([]);
  expect(painted.lowContrast, `${label}: text below WCAG AA`).toEqual([]);
  expect(failures, `${label}: failed requests`).toEqual([]);
  expect(problems, `${label}: console errors`).toEqual([]);
}

test.describe("rendered affordances", () => {
  for (const route of ROUTES) {
    test(`${route} paints its controls`, async ({ page }) => {
      await auditRoute(page, route, "dark");
    });
  }

  test("/settings paints its controls in the light theme", async ({ page }) => {
    await auditRoute(page, "/settings", "light");
  });
});

test.describe("login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the submit button has a fill", async ({ page }) => {
    await auditRoute(page, "/login", "dark");
  });
});
