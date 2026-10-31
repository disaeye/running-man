import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

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
      <header className="mb-0 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          {back ? <button type="button" onClick={onBack} aria-label="返回" className="-ml-1 rounded-full p-1 text-muted-foreground hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button> : null}
          <div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1 data-page-title className="num text-3xl font-bold leading-tight">{title}</h1></div>
        </div>
        {right}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function PageCard({ title, action, children, className = "", hero = false }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  hero?: boolean;
}) {
  return <section className={`${hero ? "surface-hero" : "surface"} p-4 ${className}`}>{title || action ? <div className="mb-3 flex items-center justify-between gap-2">{title ? <h2 className="eyebrow">{title}</h2> : null}{action}</div> : null}{children}</section>;
}

export function Stat({ label, value, unit, sub, tone = "" }: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{label}</div><div className={`num text-2xl font-semibold leading-tight ${tone}`}>{value}{unit ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span> : null}</div>{sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}</div>;
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "warn" | "bad" | "info" }) {
  const colors = { muted: "bg-secondary text-muted-foreground", primary: "bg-primary/15 text-accent-strong", warn: "bg-warn/15 text-warn", bad: "bg-destructive/15 text-destructive", info: "bg-fitness/15 text-fitness" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[tone]}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (T | { value: T; label: string })[]; onChange: (value: T) => void }) {
  return <div className="flex rounded-full bg-secondary p-1">{options.map((option) => { const key = typeof option === "string" ? option : option.value; const label = typeof option === "string" ? option : option.label; return <button type="button" key={key} onClick={() => onChange(key)} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${value === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>; })}</div>;
}

export function Bar({ value, max, tone = "bg-primary", className = "" }: { value: number; max: number; tone?: string; className?: string }) {
  return <div className={`h-1.5 w-full overflow-hidden rounded-full bg-secondary ${className}`}><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%` }} /></div>;
}
