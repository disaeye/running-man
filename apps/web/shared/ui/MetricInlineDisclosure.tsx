"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TermExplanation } from "@shared/config/terms";

interface MetricInlineDisclosureProps {
  label: string;
  children?: ReactNode;
  explanation?: TermExplanation;
  className?: string;
}

export function MetricInlineDisclosure({
  label,
  children,
  explanation,
  className = "",
}: MetricInlineDisclosureProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const panelId = `metric-disclosure-${label}`;
  const ariaLabel = `${label} 解释`;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const content = explanation ? <StructuredExplanation exp={explanation} /> : children;

  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        className="focus-ring ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-caption2 font-semibold leading-none text-text-muted transition-colors hover:bg-surface-raised hover:text-text-secondary"
      >
        i
      </button>
      {open && (
        <>
          <div
            id={panelId}
            role="region"
            aria-label={ariaLabel}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface-raised px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-elevated transition-transform duration-200 ease-out sm:hidden"
          >
            <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-text-muted/30" />
            <p className="mb-2 text-footnote font-semibold uppercase tracking-wider text-text-secondary">
              {label}
            </p>
            {content}
          </div>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 sm:hidden"
          />

          <span
            role="region"
            aria-label={ariaLabel}
            className="absolute right-0 top-full z-50 mt-1 hidden w-64 max-w-[260px] rounded-lg bg-surface-raised p-3 shadow-elevated transition-opacity duration-150 sm:block"
          >
            {content}
          </span>
        </>
      )}
    </span>
  );
}

function StructuredExplanation({ exp }: { exp: TermExplanation }) {
  return (
    <div className="space-y-2.5">
      <p className="text-subheadline leading-relaxed text-text-primary">
        {exp.summary}
      </p>

      {exp.reference && (
        <div className="rounded-lg bg-surface-overlay px-3 py-2">
          <p className="mb-0.5 text-caption1 font-semibold uppercase tracking-wider text-text-muted">
            参考区间
          </p>
          <p className="tabular-nums text-caption1 text-text-secondary">
            {exp.reference}
          </p>
        </div>
      )}

      {exp.note && (
        <p className="border-l-2 border-border-subtle pl-2.5 text-caption2 leading-snug text-text-muted">
          {exp.note}
        </p>
      )}
    </div>
  );
}
