"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

interface MetricHelpTipProps {
  readonly label: string;
  readonly text: string;
  readonly className?: string;
}

/**
 * 指标概念轻提示：默认收敛为 `?` 按钮，点击后原地展开简短解释，
 * 避免在首屏正文常驻大段公式/术语科普。
 */
export function MetricHelpTip({ label, text, className = "" }: MetricHelpTipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`查看${label}说明`}
        className="focus-ring inline-flex min-h-10 min-w-10 -my-2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-secondary hover:text-text-primary"
      >
        <HelpCircle className="size-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          role="note"
          className="mt-1.5 block rounded-lg border border-border-subtle bg-surface-overlay px-2.5 py-1.5 text-caption1 font-normal leading-relaxed text-text-secondary"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
