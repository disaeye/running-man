"use client";

import { useState } from "react";
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
  const initial = value != null ? splitPace(value) : { minutes: null, seconds: null };
  const [prevValue, setPrevValue] = useState<number | null>(value);
  const [minText, setMinText] = useState<string>(initial.minutes != null ? String(initial.minutes) : "");
  const [secText, setSecText] = useState<string>(initial.seconds != null ? String(initial.seconds) : "");

  if (prevValue !== value) {
    setPrevValue(value);
    const synced = value != null ? splitPace(value) : { minutes: null, seconds: null };
    setMinText(synced.minutes != null ? String(synced.minutes) : "");
    setSecText(synced.seconds != null ? String(synced.seconds) : "");
  }

  const commit = (nextMinText: string, nextSecText: string) => {
    setMinText(nextMinText);
    setSecText(nextSecText);
    if (nextMinText === "" && nextSecText === "") {
      setPrevValue(null);
      onChange(null);
      return;
    }
    const mins = nextMinText === "" ? 0 : Math.max(0, Math.min(99, Number(nextMinText)));
    const secs = nextSecText === "" ? 0 : Math.max(0, Math.min(59, Number(nextSecText)));
    const total = mins * 60 + secs;
    const nextVal = total > 0 ? total : null;
    setPrevValue(nextVal);
    onChange(nextVal);
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={ariaLabel ?? "配速"}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={minText}
        placeholder="4"
        aria-label="分"
        onChange={(e) => {
          const raw = e.target.value;
          const clamped = raw === "" ? "" : String(Math.max(0, Math.min(99, Math.floor(Number(raw)))));
          commit(clamped, secText);
        }}
        className="w-16 text-center font-mono tabular-nums"
      />
      <span className="text-subheadline text-text-muted" aria-hidden="true">:</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        value={secText}
        placeholder="30"
        aria-label="秒"
        onChange={(e) => {
          const raw = e.target.value;
          const clamped = raw === "" ? "" : String(Math.max(0, Math.min(59, Math.floor(Number(raw)))));
          commit(minText, clamped);
        }}
        className="w-16 text-center font-mono tabular-nums"
      />
    </div>
  );
}
