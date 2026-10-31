import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { CoachReadiness } from "@features/today/hooks/useCoachContext";

export function LovableRecovery({ readiness, score, conclusionTestId, readingsTestId }: {
  readiness: CoachReadiness | null;
  score: number | null;
  conclusionTestId?: string;
  readingsTestId?: string;
}) {
  const readings = readiness?.readings;
  const sleep = readings?.sleep_secs;
  return <PageCard title="恢复信号" action={<Tag tone="warn">训练参考</Tag>}>
    <div className="flex items-center gap-4">
      <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-warn) ${(score ?? 0) * 3.6}deg, var(--color-secondary) 0)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-card"><span data-testid={conclusionTestId} className="num text-3xl font-bold">{score ?? NO_VALUE}</span></div></div>
      <div className="grid flex-1 grid-cols-2 gap-3"><Stat label="来源 Readiness" value={score ?? "未记录"} /><Stat label="睡眠" value={sleep ? (sleep.value / 3600).toFixed(1) : "未记录"} unit={sleep ? "h" : undefined} sub={sleep?.baseline != null ? `7日均值 ${(sleep.baseline / 3600).toFixed(1)}h` : undefined} /></div>
    </div>
    <div data-testid={readingsTestId} className="mt-4 grid grid-cols-3 gap-2"><Chip label="HRV" reading={readings?.hrv} unit="ms" /><Chip label="晨起 RHR" reading={readings?.resting_hr} unit="bpm" /><Chip label="酸痛度" value="未记录" /></div>
  </PageCard>;
}

function Chip({ label, reading, value, unit }: { label: string; reading?: { value: number; baseline: number | null } | null; value?: string; unit?: string }) {
  return <div className="rounded-xl bg-secondary p-2.5"><div className="text-[11px] text-muted-foreground">{label}</div><div className={reading?.value == null && !value ? "text-sm text-muted-foreground" : "num text-xl font-semibold"}>{value ?? reading?.value ?? "未记录"}{reading?.value != null && unit ? <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}</div>{reading?.baseline != null ? <div className="text-[10px] text-muted-foreground">基线 {reading.baseline}</div> : null}</div>;
}
