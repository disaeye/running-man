"use client";

import { Input } from "./input";

interface PaceInputProps {
  /** Pace in seconds per kilometre. `null` = empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  "aria-label"?: string;
}

function splitPace(sPerKm: number): { minutes: number; seconds: number } {
  let minutes = Math.floor(sPerKm / 60);
  let seconds = Math.round(sPerKm % 60);
  if (seconds >= 60) {
    minutes += 1;
    seconds = 0;
  }
  return { minutes, seconds };
}

/**
 * Structured pace input (mm:ss) for pace-like fields (min/km, min/100m).
 * Two number segments joined by a colon — no free-text parsing.
 */
export function PaceInput({ value, onChange, id, "aria-label": ariaLabel }: PaceInputProps) {
  const { minutes, seconds } = value != null ? splitPace(value) : { minutes: null, seconds: null };

  const emit = (nextMinutes: number | null, nextSeconds: number | null) => {
    // 0 minutes is not a valid pace — treat it as empty so clearing the
    // minutes segment (or typing 0) keeps the seconds-only value clean.
    const minutesValue = nextMinutes != null && nextMinutes > 0 ? nextMinutes : null;
    if (minutesValue == null && (nextSeconds == null || nextSeconds === 0)) {
      onChange(null);
      return;
    }
    onChange((minutesValue ?? 0) * 60 + (nextSeconds ?? 0));
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={ariaLabel ?? "配速"}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={minutes ?? ""}
        placeholder="4"
        aria-label="分"
        onChange={(e) => {
          const raw = e.target.value;
          emit(raw === "" ? null : Math.max(0, Math.min(99, Number(raw))), seconds);
        }}
        className="w-16 text-center font-mono tabular-nums"
      />
      <span className="text-subheadline text-text-muted" aria-hidden="true">:</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        value={seconds ?? ""}
        placeholder="30"
        aria-label="秒"
        onChange={(e) => {
          const raw = e.target.value;
          emit(minutes, raw === "" ? null : Math.max(0, Math.min(59, Number(raw))));
        }}
        className="w-16 text-center font-mono tabular-nums"
      />
    </div>
  );
}
