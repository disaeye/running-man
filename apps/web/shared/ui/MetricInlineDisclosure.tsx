"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TERMS, type TermExplanation, type TermKey } from "@shared/config/terms";

interface MetricInlineDisclosureProps {
  label?: string;
  termKey?: TermKey;
  children?: ReactNode;
  explanation?: TermExplanation;
  align?: "left" | "right";
  className?: string;
}

export function MetricInlineDisclosure({
  label,
  termKey,
  children,
  explanation,
  align = "left",
  className = "",
}: MetricInlineDisclosureProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  const term = termKey ? TERMS[termKey] : undefined;
  const resolvedLabel = label ?? term?.label ?? "";
  const resolvedExplanation = explanation ?? term?.explanation;
  const ariaLabel = `${resolvedLabel} 解释`;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const content = resolvedExplanation ? <StructuredExplanation exp={resolvedExplanation} /> : children;

  return (
    <span ref={ref} className={`relative inline-flex items-center ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        className="focus-ring -mx-1.5 -my-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary"
      >
        <span
          aria-hidden
          className="inline-flex size-4 items-center justify-center rounded-full border border-border-default bg-surface-overlay text-caption2 font-semibold leading-none"
        >
          i
        </span>
      </button>
      {open && (
        <>
          <span
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 block bg-black/30 transition-opacity duration-200 sm:hidden"
          />
          <span
            id={panelId}
            role="region"
            aria-label={ariaLabel}
            className="fixed inset-x-0 bottom-0 z-50 block rounded-t-2xl border-t border-border-default bg-surface-raised px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-elevated transition-transform duration-200 ease-out sm:hidden"
          >
            <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-text-muted/30" />
            <span className="mb-2 block text-caption1 font-semibold text-text-secondary">
              {resolvedLabel}
            </span>
            {content}
          </span>

          <span
            role="region"
            aria-label={ariaLabel}
            className={`absolute top-full z-50 mt-1 hidden w-64 max-w-[260px] rounded-lg border border-border-default bg-surface-raised p-3 text-left font-sans font-normal normal-case tracking-normal shadow-elevated transition-opacity duration-150 sm:block ${
              align === "right" ? "right-0" : "left-0"
            }`}
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
    <span className="block space-y-2.5">
      <span className="block text-subheadline leading-relaxed text-text-primary">
        {exp.summary}
      </span>

      {exp.reference && (
        <span className="block rounded-lg bg-surface-overlay px-3 py-2">
          <span className="mb-0.5 block text-caption1 font-semibold text-text-muted">
            参考区间
          </span>
          <span className="block tabular-nums text-caption1 text-text-secondary">
            {exp.reference}
          </span>
        </span>
      )}

      {exp.note && (
        <span className="block border-l-2 border-border-subtle pl-2.5 text-caption1 leading-snug text-text-muted">
          {exp.note}
        </span>
      )}
    </span>
  );
}
