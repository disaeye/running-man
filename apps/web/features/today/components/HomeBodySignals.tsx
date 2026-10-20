"use client";

import { AlertCircle, Heart, Moon, Waves } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { termExplain } from "@shared/config/terms";
import type { DataCaveat } from "@features/today/hooks/useCoachContext";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

interface HomeBodySignalsProps {
  wellness: readonly WellnessPoint[];
  caveats: readonly DataCaveat[];
}

type WellnessKey = "sleep_secs" | "hrv" | "resting_hr";

const AVERAGE_WINDOW = 7;

/**
 * Three columns, each a value and the seven-day mean it should be read against.
 *
 * The mean is not a caveat or a footnote: a resting heart rate of 52 means
 * nothing without the athlete's own baseline beside it. With the two side by
 * side an outlier is visible without a sentence explaining that it is one.
 */
export function HomeBodySignals({ wellness, caveats }: HomeBodySignalsProps) {
  const latest = wellness.at(-1);
  const sleepHours = latest?.sleep_secs != null ? latest.sleep_secs / 3600 : null;

  return (
    <Card padding="md" aria-labelledby="signals-heading">
      <h2 id="signals-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
        生理恢复
      </h2>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        <SignalColumn
          icon={<Moon className="size-4" aria-hidden="true" />}
          label="睡眠"
          term="SLEEP_DURATION"
          value={sleepHours != null ? sleepHours.toFixed(1) : null}
          unit="h"
          average={average(wellness, "sleep_secs", (v) => v / 3600)}
          averageUnit="h"
        />
        <SignalColumn
          icon={<Waves className="size-4" aria-hidden="true" />}
          label="HRV"
          term="HRV"
          value={latest?.hrv != null ? `${Math.round(latest.hrv)}` : null}
          unit="ms"
          average={average(wellness, "hrv", (v) => v)}
          averageUnit="ms"
        />
        <SignalColumn
          icon={<Heart className="size-4" aria-hidden="true" />}
          label="静息心率"
          term="RHR"
          value={latest?.resting_hr != null ? `${Math.round(latest.resting_hr)}` : null}
          unit="bpm"
          average={average(wellness, "resting_hr", (v) => v)}
          averageUnit="bpm"
        />
      </dl>

      {caveats.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border-subtle pt-3" data-testid="recovery-caveats">
          {groupCaveats(caveats).map((line) => (
            <p
              key={line}
              className="flex items-start gap-2 text-caption1 leading-snug text-warning"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{line}</span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

const CAVEAT_FIELD_LABELS: Readonly<Record<string, string>> = {
  hrv: "HRV",
  resting_hr: "静息心率",
  sleep_secs: "睡眠",
  wellness: "健康数据",
  data_gaps: "历史数据",
};

/**
 * One line per distinct issue, naming the fields it covers.
 *
 * Two caveats can share an issue — HRV and resting heart rate both report
 * 缺少 7 天数据 — and rendered separately they read as the same warning twice.
 */
function groupCaveats(caveats: readonly DataCaveat[]): string[] {
  const byIssue = new Map<string, string[]>();
  for (const caveat of caveats) {
    const fields = byIssue.get(caveat.issue) ?? [];
    fields.push(CAVEAT_FIELD_LABELS[caveat.field] ?? caveat.field);
    byIssue.set(caveat.issue, fields);
  }
  return [...byIssue].map(([issue, fields]) =>
    fields.length > 1 ? `${issue}：${fields.join("、")}` : issue,
  );
}

function average(  wellness: readonly WellnessPoint[],
  key: WellnessKey,
  scale: (value: number) => number,
): number | null {
  const values = wellness
    .slice(-AVERAGE_WINDOW)
    .map((point) => point[key])
    .filter((value): value is number => value != null)
    .map(scale);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function SignalColumn({
  icon,
  label,
  term,
  value,
  unit,
  average: mean,
  averageUnit,
}: {
  icon: React.ReactNode;
  label: string;
  term: "SLEEP_DURATION" | "HRV" | "RHR";
  value: string | null;
  unit: string;
  average: number | null;
  averageUnit: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-caption1 text-text-muted">
        <span className="text-text-muted">{icon}</span>
        {label}
        <MetricInlineDisclosure label={label} explanation={termExplain(term)} />
      </dt>
      <dd className="mt-1">
        <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
          {value ?? "--"}
        </span>
        <span className="ml-1 text-caption1 text-text-muted">{value == null ? "" : unit}</span>
        <span className="mt-0.5 block font-mono text-caption1 tabular-nums text-text-muted">
          {mean == null ? "无 7 日均值" : `均 ${mean.toFixed(mean >= 100 ? 0 : 1)}${averageUnit}`}
        </span>
      </dd>
    </div>
  );
}
