import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { CoachReadiness } from "@features/today/hooks/useCoachContext";

export function LovableRecovery({ readiness, soreness, score, today, conclusionTestId, readingsTestId }: {
  readiness: CoachReadiness | null;
  soreness: number | null;
  score: number | null;
  today?: string;
  conclusionTestId?: string;
  readingsTestId?: string;
}) {
  const readings = readiness?.readings;
  const sleep = readings?.sleep_secs;
  const completeness = [readings?.hrv, readings?.resting_hr, sleep].filter((reading) => reading?.value != null).length + (soreness != null ? 1 : 0);
  return <PageCard title="恢复信号" action={<Tag tone="warn">输入完整度 {completeness}/4</Tag>}>
    <div className="flex items-center gap-4">
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <div className="relative grid h-20 w-20 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-warn) ${(score ?? 0) * 3.6}deg, var(--color-secondary) 0)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-card"><span data-testid={conclusionTestId} className="num text-3xl font-bold">{score ?? NO_VALUE}</span></div></div>
        <Tag tone="outline">来源 本地测算</Tag>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3"><Stat label="就绪分数" value={score ?? "未记录"} /><Stat label="睡眠" value={sleep ? (sleep.value / 3600).toFixed(1) : "未记录"} unit={sleep ? "h" : undefined} sub={sleep?.baseline != null ? `7日均值 ${(sleep.baseline / 3600).toFixed(1)}h` : undefined} /></div>
    </div>
    <div data-testid={readingsTestId} className="mt-4 grid grid-cols-3 gap-2"><Chip label="HRV" reading={readings?.hrv} unit="ms" lowerIsBetter={false} source="Intervals.icu" today={today} /><Chip label="静息心率" reading={readings?.resting_hr} unit="bpm" source="Intervals.icu" today={today} /><Chip label="酸痛度（自评）" value={soreness != null ? `${Math.round(soreness)}/4` : "未记录"} source="训练页记录" /></div>
    <p className="mt-3 text-caption1 text-muted-foreground">心率类指标来自 Intervals.icu 的健康数据同步；酸痛度在训练页手动记录；就绪分数由这些输入本地计算。</p>
  </PageCard>;
}

function Chip({ label, reading, value, unit, lowerIsBetter = true, source, today }: { label: string; reading?: { value: number; baseline: number | null; observedOn?: string | null } | null; value?: string; unit?: string; lowerIsBetter?: boolean; source?: string; today?: string }) {
  const adverse = reading?.baseline != null && (lowerIsBetter ? reading.value > reading.baseline * 1.05 : reading.value < reading.baseline * 0.95);
  // 读数来自前一日时如实标注：设备分开上报各项指标，静息心率常在次日晨才到位。
  const staleDay = reading?.observedOn && today && reading.observedOn !== today ? reading.observedOn.slice(5) : null;
  return <div className="rounded-xl bg-secondary p-2.5"><div className="flex items-baseline justify-between gap-1"><span className="text-caption1 text-muted-foreground">{label}</span>{staleDay ? <span className="num text-caption2 text-muted-foreground">{staleDay}</span> : source ? <span className="text-caption2 text-muted-foreground">{source}</span> : null}</div><div className={`num text-xl font-semibold ${adverse ? "text-fatigue" : reading?.baseline != null ? "text-form" : ""}`}>{value ?? (reading?.value != null ? Math.round(reading.value) : "未记录")}{reading?.value != null && unit ? <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span> : null}</div>{reading?.baseline != null ? <div className="text-caption1 text-muted-foreground">基线 {reading.baseline}</div> : null}</div>;
}
