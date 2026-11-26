"use client";

import { useEffect, useRef } from "react";

/**
 * 顶部阅读进度条：贴合视口顶部的 2px 荧光细线，随主内容滚动填满。
 *
 * 滚动位置直接写进 DOM（rAF 合并同一帧的多次 scroll 事件），不经过 React 状态，
 * 也不加 transform 过渡：进度条与滚动位置同步，快速滚动时不会追着跑。
 * 进度条本体常驻，只通过透明度淡入淡出，避免开始滚动时突然出现。
 */
export function ScrollProgressBar({ containerId = "main-content" }: { containerId?: string }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = document.getElementById(containerId);
    const fill = fillRef.current;
    if (!fill) return;

    let frame = 0;
    const paint = () => {
      frame = 0;
      const ratio = computeRatio(container);
      fill.style.transform = `scaleX(${ratio})`;
      fill.style.opacity = ratio > 0.005 ? "1" : "0";
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(paint);
    };

    paint();
    container?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      container?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [containerId]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-[2px] bg-transparent"
    >
      <div
        ref={fillRef}
        data-testid="scroll-progress-fill"
        className="h-full origin-left bg-gradient-to-r from-ctl via-accent to-accent-strong opacity-0 transition-opacity duration-fast ease-default"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

function computeRatio(container: HTMLElement | null): number {
  if (container && container.scrollHeight > container.clientHeight + 8) {
    const max = container.scrollHeight - container.clientHeight;
    return Math.min(1, Math.max(0, container.scrollTop / max));
  }
  const winMax = document.documentElement.scrollHeight - window.innerHeight;
  if (winMax > 8) {
    return Math.min(1, Math.max(0, window.scrollY / winMax));
  }
  return 0;
}
