"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";

export function Page({ title, eyebrow, right, back, onBack, children }: {
  title: string;
  eyebrow?: ReactNode;
  right?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="page-stack">
      <header className="mb-2 flex items-end justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          {back ? <button type="button" onClick={onBack} aria-label="返回" className="-ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button> : null}
          <div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1 data-page-title className="num text-3xl font-bold leading-tight">{title}</h1></div>
        </div>
        {right}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function PageCard({ title, action, children, className = "", hero = false, testId }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  hero?: boolean;
  testId?: string;
}) {
  return <section data-testid={testId} className={`${hero ? "surface-hero" : "surface"} p-4 ${className}`}>{title || action ? <div className="mb-3 flex items-center justify-between gap-2">{title ? <h2 className="eyebrow">{title}</h2> : null}{action}</div> : null}{children}</section>;
}

export function Stat({ label, value, unit, sub, tone = "", focal = false }: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: string;
  /** 只给首页的主决策数字，一次遮罩揭示。 */
  focal?: boolean;
}) {
  return <div className="min-w-0"><div className="text-caption1 text-muted-foreground">{label}</div><div className={`num text-2xl font-semibold leading-tight ${tone} ${focal ? "focal-reveal" : ""}`}>{value}{unit ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span> : null}</div>{sub ? <div className="text-caption1 text-muted-foreground">{sub}</div> : null}</div>;
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "warn" | "bad" | "info" | "outline" }) {
  const colors = { muted: "bg-secondary text-muted-foreground", primary: "bg-primary/15 text-accent-strong", warn: "bg-warn/15 text-warn", bad: "bg-destructive/15 text-destructive", info: "bg-fitness/15 text-fitness", outline: "border border-border/70 bg-transparent text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption1 font-medium ${colors[tone]}`}>{children}</span>;
}

/**
 * 数据来源标签。
 *
 * device=设备同步，manual=人工设置，estimate=系统估算。
 */
export type SourceKind = "device" | "manual" | "estimate";

const SOURCE_LABELS: Record<SourceKind, string> = {
  device: "设备同步",
  manual: "人工设置",
  estimate: "系统估算",
};

export function SourceTag({ source }: { source: SourceKind }) {
  const tone = source === "device" ? "info" : source === "manual" ? "muted" : "warn";
  return <Tag tone={tone}>{SOURCE_LABELS[source]}</Tag>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (T | { value: T; label: string })[]; onChange: (value: T) => void }) {
  const entries: readonly { key: T; label: string }[] = options.map((option) =>
    typeof option === "string" ? { key: option, label: option } : { key: option.value, label: option.label },
  );
  return (
    <div className="relative flex rounded-full bg-secondary p-1">
      <SlidingIndicator
        variant="accent-pill"
        options={entries.map((entry) => ({ key: entry.key, selected: entry.key === value }))}
      />
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.key}
          data-indicator-key={entry.key}
          onClick={() => onChange(entry.key)}
          aria-pressed={entry.key === value}
          className={`tactile relative z-10 inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-transparent px-3 text-xs font-medium ${entry.key === value ? "text-primary-foreground" : "text-muted-foreground hover:text-text-primary"}`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, max, tone = "bg-primary", className = "" }: { value: number; max: number; tone?: string; className?: string }) {
  const ratio = Math.min(1, max > 0 ? value / max : 0);
  return <div className={`h-1.5 w-full overflow-hidden rounded-full bg-secondary ${className}`}><div className={`fill-motion h-full rounded-full ${tone}`} style={{ transform: `scaleX(${ratio})` }} /></div>;
}
