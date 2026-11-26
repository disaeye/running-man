"use client";

import { useEffect, useId, useState } from "react";
import { usePrefersReducedMotion } from "@shared/lib/use-prefers-reduced-motion";
import { readingKind } from "./reading-sequence";

export function useReadingSequence(key: string | null) {
  const reduced = usePrefersReducedMotion();
  const owner = useId();
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const kind = reduced || settledKey === key ? "static" : readingKind(owner, key, reduced);

  useEffect(() => {
    if (kind === "static") return;
    const timer = window.setTimeout(() => setSettledKey(key), kind === "first" ? 700 : 900);
    return () => window.clearTimeout(timer);
  }, [key, kind]);

  return { playing: kind === "first", updated: kind === "updated" };
}
