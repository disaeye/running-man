"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@shared/lib/use-prefers-reduced-motion";

interface CountUpProps {
  readonly value: number;
  readonly animateOnMount?: boolean;
  readonly decimals?: number;
  readonly durationMs?: number;
  readonly suffix?: string;
}

/**
 * 数值滚动计数：挂载或数值变更时做缓出插值，尊重 prefers-reduced-motion，
 * 搭配 tabular-nums 确保等宽无抖动。
 */
export function CountUp({
  value,
  decimals = 0,
  durationMs = 440,
  suffix = "",
  animateOnMount = true,
}: CountUpProps) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const mountedAnimRef = useRef(!animateOnMount);

  useEffect(() => {
    if (reduced || !Number.isFinite(value)) {
      fromRef.current = value;
      return;
    }
    const start = !mountedAnimRef.current ? 0 : fromRef.current;
    mountedAnimRef.current = true;
    if (start === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + (value - start) * eased;
      fromRef.current = next;
      setShown(next);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
        setShown(value);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduced, animateOnMount]);

  const rendered = reduced ? value : shown;
  return (
    <>
      {rendered.toFixed(decimals)}
      {suffix}
    </>
  );
}
