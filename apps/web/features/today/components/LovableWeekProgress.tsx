import { Check } from "lucide-react";
import { Bar } from "@shared/ui/MetricBar";
import { PageCard } from "@shared/ui/Card";
import { TextLink } from "@shared/ui/TextLink";
import { activityLocalDay } from "@shared/lib/training-day";
import { buildWeekModel, type MetricKey } from "@features/calendar/lib/training-week";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

/**
 * 本周进度：
 * 顶部单块主进度（突出跑量与单根进度条，右侧并列时长与 TSS）+ 底部紧凑 7 日状态圆点条。
 */
export function LovableWeekProgress({ activities, events, timezone, weekStart, todayKey }: {
  activities: ActivitySummary[];
  events: CalendarEventDTO[];
  timezone: string;
  weekStart: string;
  todayKey: string;
}) {
  const activeEvents = events.filter(
    (event) => event.status !== "deleted" && event.training_type !== "race",
  );
  const weekEnd = addDays(weekStart, 6);
  const { comparison } = buildWeekModel({
    from: weekStart,
    to: weekEnd,
    today: todayKey,
    timezone,
    family: "all",
    activities,
    events: activeEvents,
  });
  const rowDefinitions: { key: MetricKey; label: string; unit: string; digits: number; tone: string }[] = [
    { key: "distanceKm", label: "跑量", unit: "km", digits: 1, tone: "bg-sport-run" },
    { key: "durationMin", label: "时长", unit: "h", digits: 1, tone: "bg-fitness" },
    { key: "tss", label: "TSS", unit: "", digits: 0, tone: "bg-accent-strong" },
  ];
  const rows = rowDefinitions.map((row) => {
    const scale = row.key === "durationMin" ? 60 : 1;
    const actualKnown = comparison.actualKnown[row.key];
    const plannedKnown = comparison.plannedKnown[row.key] && comparison.metrics[row.key].planned > 0;
    const value = actualKnown ? comparison.metrics[row.key].actual / scale : null;
    const plan = plannedKnown ? comparison.metrics[row.key].planned / scale : null;
    return { ...row, value, plan };
  });

  const distance = rows[0]!;
  const secondaryRows = rows.slice(1);
  const hasPlan = rows.some((row) => (row.plan ?? 0) > 0);
  const distancePct = distance.plan != null && distance.plan > 0 && distance.value != null
    ? Math.min(999, Math.round((distance.value / distance.plan) * 100))
    : null;
  const barMax = Math.max(distance.value ?? 0, distance.plan ?? 0, 1);

  const doneDays = new Set(activities.map((activity) => activityLocalDay(activity.start_time, timezone)));
  const plannedDays = new Set(activeEvents.map((event) => activityLocalDay(event.start_time, timezone)));

  return (
    <PageCard
      title="本周进度"
      testId="home-week-progress"
      action={hasPlan ? undefined : <TextLink href="/calendar" arrow>去排课</TextLink>}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-caption1 text-text-muted">{distance.label}</span>
            <div className="num flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-xl font-bold text-text-primary">
                {distance.value != null ? distance.value.toFixed(distance.digits) : "未记录"}
              </span>
              {distance.plan != null ? (
                <span className="text-caption1 text-text-muted">/ {distance.plan.toFixed(distance.digits)}</span>
              ) : null}
              {distance.value != null ? (
                <span className="font-sans text-caption1 text-text-muted">{distance.unit}</span>
              ) : null}
              {distancePct != null ? (
                <span className="ml-1 text-caption1 font-medium text-text-secondary">({distancePct}%)</span>
              ) : null}
            </div>
          </div>
          {distance.plan != null ? (
            <div className="mt-2">
              <Bar value={distance.value ?? 0} max={barMax} tone={distance.tone} />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-5 border-t border-border-subtle pt-2.5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          {secondaryRows.map((row) => (
            <div key={row.key} className="min-w-0">
              <div className="text-caption1 text-text-muted">{row.label}</div>
              <div className="num mt-0.5 font-mono text-subheadline font-semibold tabular-nums text-text-primary">
                {row.value != null ? row.value.toFixed(row.digits) : "未记录"}
                {row.plan != null ? (
                  <span className="font-normal text-text-muted">/{row.plan.toFixed(row.digits)}</span>
                ) : null}
                {row.value != null && row.unit ? (
                  <span className="ml-0.5 font-sans text-caption1 font-normal text-text-muted">{row.unit}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-7 gap-1 border-t border-border-subtle pt-3" aria-label="本周每日训练状态">
        {Array.from({ length: 7 }, (_, index) => {
          const key = addDays(weekStart, index);
          const done = doneDays.has(key);
          const planned = plannedDays.has(key);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className="flex flex-col items-center gap-1 py-0.5 text-caption1"
            >
              <span className={isToday ? "font-semibold text-accent-strong" : "text-text-muted"}>
                {"一二三四五六日"[index]}
              </span>
              <span
                className={`relative flex size-5 items-center justify-center rounded-full ${
                  done
                    ? "bg-success text-text-inverse"
                    : planned
                      ? "border border-fitness/70"
                      : "bg-surface-overlay"
                } ${isToday ? "ring-1 ring-accent-strong ring-offset-1 ring-offset-card" : ""} ${isToday && !done ? "pulse-dot" : ""}`}
              >
                {done ? <Check className="size-3 stroke-[3]" aria-hidden /> : null}
              </span>
              <span className={`num font-mono text-caption1 tabular-nums ${isToday ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                {Number(key.slice(8))}
              </span>
            </div>
          );
        })}
      </div>
    </PageCard>
  );
}
