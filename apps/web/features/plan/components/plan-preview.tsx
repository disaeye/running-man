import { formatPaceFromSeconds } from "@shared/lib/format";

interface PreviewSegment {
  type: string;
  duration_min: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  repetitions?: number | null;
  recovery_min?: number | null;
  rpe_min?: number | null;
  rpe_max?: number | null;
}

export interface PreviewEvent {
  event_id: string;
  date: string;
  name: string;
  training_type: string;
  category?: string;
  duration_min: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  segments: readonly PreviewSegment[];
  phase: string;
}

export interface PreviewPhase {
  name: string;
  start_date: string;
  end_date: string;
}

export interface PreservedEvent {
  date: string;
  name: string;
  reason: string;
}

export interface GeneratePreview {
  phases_created: number;
  events_created: number;
  affected_dates: readonly string[] | null;
  preserved?: readonly PreservedEvent[] | null;
  phases?: readonly PreviewPhase[] | null;
  events?: readonly PreviewEvent[] | null;
  training_paces_available?: boolean | null;
  training_load_available?: boolean | null;
}

const PHASE_LABELS: Record<string, string> = {
  base: "基础期",
  build: "强化期",
  peak: "巅峰期",
  taper: "减量期",
  race: "比赛日",
};

const SEGMENT_LABELS: Record<string, string> = {
  warmup: "热身",
  easy: "轻松跑",
  recovery: "恢复跑",
  long: "长距离跑",
  tempo: "节奏段",
  threshold: "阈值段",
  interval: "间歇段",
  intervals: "间歇跑",
  cooldown: "放松跑",
};

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-caption1 text-text-muted">{label}</p>
      <p className="mt-1 font-mono text-title2 font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

export function PlanPreview({ preview }: { preview: GeneratePreview }) {
  const dateCount = preview.affected_dates?.length ?? 0;
  const firstDate = preview.affected_dates?.[0] ?? null;
  const lastDate = preview.affected_dates?.at(-1) ?? null;
  return (
    <div className="rounded-xl border border-border-default bg-surface-overlay/45 p-4" data-testid="plan-generate-preview">
      <p className="text-subheadline font-semibold text-text-primary">覆盖预览</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PreviewMetric label="训练阶段" value={preview.phases_created} />
        <PreviewMetric label="训练安排" value={preview.events_created} />
        <PreviewMetric label="覆盖日期" value={dateCount} />
      </div>
      {firstDate && lastDate && (
        <p className="mt-3 text-caption1 text-text-secondary">
          {firstDate} 至 {lastDate}。历史、已完成和手动修改过的训练会保留。
        </p>
      )}
      {!preview.training_paces_available && (
        <p className="mt-1 text-caption1 text-text-muted">当前没有有效阈值配速；训练强度依据时长和 RPE 安排。</p>
      )}
      {preview.preserved && preview.preserved.length > 0 && (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3">
          <p className="text-caption1 font-semibold text-warn">以下训练会保留，不参与重排</p>
          <ul className="mt-1.5 space-y-1">
            {preview.preserved.map((item, index) => (
              <li key={`${item.date}-${index}`} className="text-caption1 text-text-secondary">
                {item.date} · {item.name || "计划课"} · {item.reason === "done" ? "已完成" : "已手动修改"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.phases && preview.phases.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
          {preview.phases.map((phase) => (
            <li
              key={`${phase.name}-${phase.start_date}`}
              className="rounded-md bg-surface-card/70 px-2 py-1 text-caption1 text-text-secondary"
            >
              {PHASE_LABELS[phase.name] ?? phase.name} · {phase.start_date.slice(5)}–{phase.end_date.slice(5)}
            </li>
          ))}
        </ul>
      )}
      {preview.events && preview.events.length > 0 && (
        <ol className="mt-3 space-y-2 border-t border-border-subtle pt-3 md:max-h-[34dvh] md:overflow-y-auto md:pr-1">
          {preview.events.map((event) => (
            <li key={event.event_id} className="rounded-lg bg-surface-card/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption1 font-medium text-text-primary">{event.date} · {event.name}</span>
              </div>
              {event.training_type === "race" ? (
                <p className="mt-1 text-caption1 font-medium text-accent-strong">比赛日 · 目标比赛</p>
              ) : (
                <p className="mt-1 text-caption1 text-text-secondary">
                  {event.duration_min} 分钟 · {PHASE_LABELS[event.phase] ?? event.phase}
                  {event.pace_min_s_km != null && event.pace_max_s_km != null
                    ? ` · ${formatPaceFromSeconds(event.pace_min_s_km)}–${formatPaceFromSeconds(event.pace_max_s_km)} /公里`
                    : " · 按 RPE 控制强度"}
                </p>
              )}
              {event.segments.map((segment, index) => (
                <p key={`${event.event_id}-${index}`} className="mt-1 text-caption1 text-text-muted">
                  {SEGMENT_LABELS[segment.type] ?? segment.type} · {segment.duration_min} 分钟
                  {segment.repetitions ? ` × ${segment.repetitions} 组` : ""}
                  {segment.rpe_min != null && segment.rpe_max != null ? ` · RPE ${segment.rpe_min}–${segment.rpe_max}` : ""}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
      {preview.events && preview.events_created > preview.events.length && (
        <p className="mt-2 text-caption1 text-text-muted">
          预览列出前 {preview.events.length} 项示例训练；共将生成 {preview.events_created} 项计划课程。
        </p>
      )}
    </div>
  );
}
