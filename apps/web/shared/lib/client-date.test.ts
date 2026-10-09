import { describe, expect, it } from "vitest";
import { formatDateLabelFor, rendersEmptyOnServer } from "./client-date";

/**
 * Regression tests for a hydration mismatch that shipped to production.
 *
 * The dashboard header rendered `new Date().toLocaleDateString("zh-CN", …)`
 * directly. Vercel pre-renders client components in UTC while the athlete reads
 * the page in Asia/Shanghai, so the server emitted "9月13日星期日" and the
 * browser rendered "9月14日星期一". React reports the text mismatch as error
 * error 418 and throws away the server-rendered subtree — visible in the console on
 * every dashboard page, and invisible to a screenshot.
 */
describe("useClientDateLabel", () => {
  const OPTIONS: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    weekday: "long",
  };

  it("renders nothing on the server so both sides agree", () => {
    // The empty string is the mechanism, not a placeholder: it is the only
    // value the server and the client's first render can both produce, because
    // only one of them knows the real date.
    expect(rendersEmptyOnServer()).toBe("");
  });

  it("formats the same instant differently per timezone", () => {
    // 2026-09-13T20:00Z is the 14th in Shanghai and still the 13th in UTC.
    // This is the exact divergence that produced the mismatch.
    const instant = new Date("2026-09-13T20:00:00Z");

    const utc = formatDateLabelFor(instant, "UTC", OPTIONS);
    const shanghai = formatDateLabelFor(instant, "Asia/Shanghai", OPTIONS);

    expect(utc).toContain("13");
    expect(shanghai).toContain("14");
    expect(utc).not.toBe(shanghai);
  });

  it("takes the athlete timezone, not the browser's", () => {
    const instant = new Date("2026-09-13T20:00:00Z");

    // A traveller on a UTC laptop whose profile says Asia/Shanghai must still
    // see their own training day, matching the rest of the app.
    expect(formatDateLabelFor(instant, "Asia/Shanghai", OPTIONS)).toContain("14");
  });

  it("falls back rather than blanking when the timezone is unusable", () => {
    const label = formatDateLabelFor(new Date("2026-09-13T20:00:00Z"), "Not/AZone", OPTIONS);

    expect(label).not.toBe("");
  });
});
