"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { SEGMENT_TYPE_LABEL } from "@features/calendar/components/types";
import {
  formatPaceInput,
  formatSegmentDuration,
  type BuilderSegment,
} from "@features/calendar/lib/workout-prescription";

export function WorkoutSegmentsList({
  segments,
  editingId,
  onEdit,
  onMove,
  onRemove,
}: {
  readonly segments: readonly BuilderSegment[];
  readonly editingId: string | null;
  readonly onEdit: (segment: BuilderSegment) => void;
  readonly onMove: (index: number, delta: -1 | 1) => void;
  readonly onRemove: (id: string) => void;
}) {
  if (segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" data-testid="wb-segments">
      {segments.map((s, index) => {
        const isEditing = editingId === s.id;
        return (
          <div
            key={s.id}
            className={`flex items-center justify-between gap-1 rounded-lg px-3 py-1.5 text-caption1 ${
              isEditing ? "border border-accent bg-accent/10" : "bg-surface-overlay/50"
            }`}
          >
            <button
              type="button"
              onClick={() => onEdit(s)}
              className="num min-w-0 flex-1 py-1.5 text-left text-text-primary hover:underline"
              title="点击编辑该段落"
            >
              <span className="font-medium text-accent-strong">{SEGMENT_TYPE_LABEL[s.segment_type]}</span>
              {s.repetitions && s.repetitions > 1 ? ` × ${s.repetitions} 组` : ""} · {formatSegmentDuration(s.duration_s)}
              {s.pace_min_s_km != null ? ` · ${formatPaceInput(s.pace_min_s_km)}–${formatPaceInput(s.pace_max_s_km ?? s.pace_min_s_km)}/km` : ""}
              {s.repetitions && s.repetitions > 1 && s.recovery_s ? `（恢复 ${formatSegmentDuration(s.recovery_s)}）` : ""}
            </button>
            <div className="flex shrink-0 items-center">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => onMove(index, -1)}
                  className="flex size-9 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
                  aria-label={`上移 ${SEGMENT_TYPE_LABEL[s.segment_type]} 段落`}
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
              ) : null}
              {index < segments.length - 1 ? (
                <button
                  type="button"
                  onClick={() => onMove(index, 1)}
                  className="flex size-9 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
                  aria-label={`下移 ${SEGMENT_TYPE_LABEL[s.segment_type]} 段落`}
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                className="flex size-11 items-center justify-center rounded-md text-text-muted hover:text-error"
                aria-label={`移除 ${SEGMENT_TYPE_LABEL[s.segment_type]} 段落`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
