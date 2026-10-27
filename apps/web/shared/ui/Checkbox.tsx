"use client";

import { Check } from "lucide-react";
import { cn } from "@shared/lib/utils";

interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly className?: string;
}

/**
 * A 20px checkbox square inside a 40px hit area.
 *
 * The input itself carries the whole 40px box, because it is the element a hit
 * test and the 40px touch-target gate both measure — padding on a wrapper
 * would not count for it. `appearance-none` and no fill leave the native
 * control unpainted without hiding it: the square and the tick are siblings,
 * so the visual stays 20px while the target stays 40px.
 */
export function Checkbox({ checked, onChange, className }: CheckboxProps) {
  return (
    <span className={cn("relative inline-grid size-10 shrink-0 place-items-center", className)}>
      <input
        type="checkbox"
        data-slot="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="focus-ring peer absolute inset-0 size-full cursor-pointer appearance-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none size-5 rounded border border-border-default bg-surface-card transition-colors peer-checked:border-accent-strong peer-checked:bg-accent-strong"
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute size-3.5 text-on-accent opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );
}
