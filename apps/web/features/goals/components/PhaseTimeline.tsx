"use client";

import { Check } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { PHASE_ORDER, PHASE_LABELS, estimateCurrentPhase } from "./goal-utils";
import type { Goal } from "@shared/types/goals";

interface PhaseTimelineProps {
  goal: Goal;
}

export function PhaseTimeline({ goal }: PhaseTimelineProps) {
  if (!goal.target_date) return null;

  const currentPhase = estimateCurrentPhase(goal);
  const currentIndex = PHASE_ORDER.indexOf(currentPhase as typeof PHASE_ORDER[number]);

  return (
    <Card>
      <h3 className="mb-4 text-subheadline font-semibold uppercase tracking-wider text-text-muted">
        训练阶段
      </h3>

      <div className="relative flex items-center gap-0">
        {PHASE_ORDER.map((phase, i) => {
          const isCurrent = phase === currentPhase;
          const isPast = i < currentIndex;
          const isLast = i === PHASE_ORDER.length - 1;

          return (
            <div key={phase} className="flex flex-1 flex-col items-center">
              {/* Node */}
              <div className="relative flex w-full items-center">
                {/* Connector line before node */}
                {i > 0 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      isPast ? "bg-ctl" : "bg-border-subtle"
                    }`}
                  />
                )}

                {/* Node dot */}
                <div
                  className={`
                    relative z-10 flex h-8 w-8 shrink-0 items-center justify-center
                    rounded-full text-caption1 font-bold transition-all duration-300
                    ${isCurrent
                      ? "bg-accent text-accent-foreground shadow-[0_0_12px_var(--color-ctl)]"
                      : isPast
                        ? "bg-ctl/30 text-ctl"
                        : "bg-surface-overlay text-text-muted border border-border-subtle"
                    }
                  `.trim()}
                >
                  {isPast ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </div>

                {/* Connector line after node */}
                {isLast ? (
                  <div className="h-0.5 flex-1" />
                ) : (
                  <div
                    className={`h-0.5 flex-1 ${
                      isPast
                        ? "bg-ctl"
                        : i === currentIndex
                          ? "bg-border-subtle"
                          : "bg-border-subtle"
                    }`}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`
                  mt-2 text-center text-caption1 leading-tight
                  ${isCurrent
                    ? "font-semibold text-ctl"
                    : isPast
                      ? "text-text-secondary"
                      : "text-text-muted"
                  }
                `.trim()}
              >
                {PHASE_LABELS[phase] ?? phase}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
