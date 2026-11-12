"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** 服务端不跑布局副作用，避免水合阶段的 useLayoutEffect 警告。 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface IndicatorOption {
  readonly key: string;
  readonly selected: boolean;
}

type Variant = "surface-pill" | "accent-pill" | "underline";

interface Geometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function measure(
  container: HTMLElement,
  selected: string,
  variant: Variant,
): Geometry | null {
  const active = Array.from(
    container.querySelectorAll<HTMLElement>("[data-indicator-key]"),
  ).find((element) => element.dataset.indicatorKey === selected);
  if (!active) return null;
  const parent = container.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  const x = rect.left - parent.left;
  const y = rect.top - parent.top;
  if (variant === "underline") {
    const width = Math.max(16, rect.width * 0.4);
    return {
      x: x + (rect.width - width) / 2,
      y: parent.height - 3,
      width,
      height: 3,
    };
  }
  return { x, y, width: rect.width, height: rect.height };
}

/**
 * 选中指示条在入口之间滑动，让「现在在哪一项」有空间连续性。
 *
 * 位置从真实 DOM 量取，所以入口文字长度变化、侧栏折叠、手机横竖屏切换都不用
 * 维护一套百分比表。容器取自身的 parentElement：调用方只需保证指示条是容器内
 * 的直接子元素，不用再维护一个在子组件 layout effect 里还没赋值的 ref。
 */
export function SlidingIndicator({
  options,
  variant,
}: {
  readonly options: readonly IndicatorOption[];
  readonly variant: Variant;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const selected = options.find((option) => option.selected)?.key ?? "";

  useIsomorphicLayoutEffect(() => {
    const container = indicatorRef.current?.parentElement;
    if (!container) return;

    const publish = () => setGeometry(measure(container, selected, variant));
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(container);
    for (const child of container.querySelectorAll("[data-indicator-key]")) {
      observer.observe(child);
    }
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, [selected, variant, options.length]);

  return (
    <span
      ref={indicatorRef}
      aria-hidden="true"
      data-variant={variant}
      data-testid="sliding-indicator"
      className="motion-indicator"
      style={
        geometry
          ? {
              width: `${geometry.width}px`,
              height: `${geometry.height}px`,
              transform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`,
              opacity: 1,
            }
          : { opacity: 0 }
      }
    />
  );
}
