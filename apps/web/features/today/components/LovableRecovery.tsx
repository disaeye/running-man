import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { CoachReadiness } from "@features/today/hooks/useCoachContext";

export function LovableRecovery({ readiness, soreness, score, conclusionTestId, readingsTestId }: {
  readiness: CoachReadiness | null;
  soreness: number | null;
  score: number | null;
  conclusionTestId?: string;
  readingsTestId?: string;
}) {
  const readings = readiness?.readings;
  const sleep = readings?.sleep_secs;
  const completeness = [readings?.hrv, readings?.resting_hr, sleep].filter((reading) => reading?.value != null).length + (soreness != null ? 1 : 0);
  return <PageCard title="恢复信号" action={<Tag tone="warn">输入完整度 {completeness}/4</Tag>}>
    <div className="flex items-center gap-4">
      <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-warn) ${(score ?? 0) * 3.6}deg, var(--color-secondary) 0)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-card"><span data-testid={conclusionTestId} className="num text-3xl font-bold">{score ?? NO_VALUE}</span></div></div>
      <div className="grid flex-1 grid-cols-2 gap-3"><Stat label="来源 Readiness" value={score ?? "未记录"} /><Stat label="睡眠" value={sleep ? (sleep.value / 3600).toFixed(1) : "未记录"} unit={sleep ? "h" : undefined} sub={sleep?.baseline != null ? `7日均值 ${(sleep.baseline / 3600).toFixed(1)}h` : undefined} /></div>
    </div>
    <div data-testid={readingsTestId} className="mt-4 grid grid-cols-3 gap-2"><Chip label="HRV" reading={readings?.hrv} unit="ms" lowerIsBetter={false} /><Chip label="晨起 RHR" reading={readings?.resting_hr} unit="bpm" lowerIsBetter /><Chip label="酸痛度" value={soreness != null ? `${Math.round(soreness / 20)}/5` : "未记录"} /></div>
  </PageCard>;
}

function Chip({ label, reading, value, unit, lowerIsBetter = true }: { label: string; reading?: { value: number; baseline: number | null } | null; value?: string; unit?: string; lowerIsBetter?: boolean }) {
  const adverse = reading?.baseline != null && (lowerIsBetter ? reading.value > reading.baseline * 1.05 : reading.value < reading.baseline * 0.95);
  return <div className="rounded-xl bg-secondary p-2.5"><div className="text-caption1 text-muted-foreground">{label}</div><div className={`num text-xl font-semibold ${adverse ? "text-fatigue" : reading?.baseline != null ? "text-form" : ""}`}>{value ?? (reading?.value != null ? Math.round(reading.value) : "未记录")}{reading?.value != null && unit ? <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span> : null}</div>{reading?.baseline != null ? <div className="text-caption1 text-muted-foreground">基线 {reading.baseline}</div> : null}</div>;
}
