import { describe, expect, it } from "vitest";
import { cn } from "@shared/lib/utils";

describe("cn", () => {
  it("keeps a custom font size next to a colour class", () => {
    expect(cn("font-mono text-title1 font-normal tabular-nums", "text-accent-strong")).toContain(
      "text-title1",
    );
  });

  it("keeps every custom font size when a colour follows", () => {
    for (const size of [
      "text-metric-xl",
      "text-metric-lg",
      "text-conclusion",
      "text-display-sm",
      "text-title1",
      "text-title2",
      "text-title3",
      "text-headline",
      "text-body",
      "text-callout",
      "text-subheadline",
      "text-footnote",
      "text-caption1",
      "text-caption2",
    ]) {
      expect(cn(size, "text-text-muted")).toContain(size);
    }
  });

  it("still lets the later font size win over the earlier one", () => {
    expect(cn("text-title1", "text-title3")).toBe("text-title3");
  });

  it("still lets the later colour win over the earlier one", () => {
    expect(cn("text-text-primary", "text-text-muted")).toBe("text-text-muted");
  });
});
