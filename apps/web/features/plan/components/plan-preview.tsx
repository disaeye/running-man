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
  predicted_tss: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  segments: readonly PreviewSegment[];
  phase: string;
}

export interface PreviewPhase {
  name: string;
  start_date: string;
  end_date: string;
  target_weekly_tss: number;
}

export interface GeneratePreview {
  phases_created: number;
  events_created: number;
  affected_dates: readonly string[] | null;
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

function formatPace(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

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
      {preview.training_load_available === false && (
        <p className="mt-2 text-caption1 text-warning">近期训练负荷数据不足，计划负荷采用你提供的每周目标。</p>
      )}
      {!preview.training_paces_available && (
        <p className="mt-1 text-caption1 text-text-muted">当前没有有效阈值配速；训练强度依据时长和 RPE 安排。</p>
      )}
      {preview.phases && preview.phases.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border-subtle pt-3">
          {preview.phases.map((phase) => (
            <li key={`${phase.name}-${phase.start_date}`} className="text-caption1 text-text-secondary">
              {PHASE_LABELS[phase.name] ?? phase.name} · {phase.start_date} 至 {phase.end_date} · {Math.round(phase.target_weekly_tss)} TSS/周
            </li>
          ))}
        </ul>
      )}
      {preview.events && preview.events.length > 0 && (
        <ol className="mt-3 max-h-56 space-y-2 overflow-y-auto border-t border-border-subtle pt-3">
          {preview.events.map((event) => (
            <li key={event.event_id} className="rounded-lg bg-surface-card/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption1 font-medium text-text-primary">{event.date} · {event.name}</span>
                <span className="shrink-0 font-mono text-caption2 text-text-muted">{Math.round(event.predicted_tss)} TSS</span>
              </div>
              {event.training_type === "race" ? (
                <p className="mt-1 text-caption1 font-medium text-accent-strong">比赛日 · 目标比赛</p>
              ) : (
                <p className="mt-1 text-caption1 text-text-secondary">
                  {event.duration_min} 分钟 · {PHASE_LABELS[event.phase] ?? event.phase}
                  {event.pace_min_s_km != null && event.pace_max_s_km != null
                    ? ` · ${formatPace(event.pace_min_s_km)}–${formatPace(event.pace_max_s_km)} /公里`
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
      {preview.events_created > 10 && (
        <p className="mt-2 text-caption1 text-text-muted">
          预览列出{preview.events?.length ?? 0} 项训练；共{preview.events_created} 项计划课程。
        </p>
      )}
    </div>
  );
}
