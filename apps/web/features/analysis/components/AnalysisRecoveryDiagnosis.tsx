import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { READINESS_LEVEL_LABEL } from "@features/today/lib/readiness-level";
import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import { buildRecoveryDrivers, type DriverStat } from "./recovery-diagnosis";

const FACTOR_LABEL: Record<string, string> = {
  sleep: "睡眠",
  resting_hr: "静息心率",
  hrv: "心率变异",
};

export function RecoverySparseState() {
  return (
    <Card padding="md" data-testid="recovery-sparse-state">
      <SectionHeader title="健康记录不足" />
      <p className="mt-3 text-footnote leading-relaxed text-text-secondary">
        记录睡眠、静息心率和心率变异后，这里会显示这些指标的变化。
      </p>
    </Card>
  );
}

export function RecoveryDiagnosisCard({
  wellness,
}: {
  readonly wellness: WellnessPoint[];
}) {
  const drivers = buildRecoveryDrivers(wellness);
  return (
    <Card
      padding="md"
      data-testid="recovery-diagnosis-summary"
      className="flex flex-col gap-5"
    >
      <SectionHeader title="恢复信号" />
      <div
        data-testid="recovery-driver-matrix"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {drivers.map((driver) => (
          <DriverCard key={driver.label} driver={driver} />
        ))}
      </div>
    </Card>
  );
}

export function ReadinessDriverHistory({
  readiness,
}: {
  readonly readiness: LocalReadiness;
}) {
  return (
    <Card padding="md" data-testid="readiness-driver-history">
      <SectionHeader
        title="因子"
        action={
          <span className="text-caption1 text-text-muted">
            {readiness.score}/100 ·{" "}
            {READINESS_LEVEL_LABEL[readiness.level] ?? readiness.level}
          </span>
        }
      />
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {readiness.factors
          .filter((factor) => factor.name in FACTOR_LABEL)
          .map((factor) => (
            <div
              key={factor.name}
              className="rounded-xl bg-surface-overlay/55 px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-subheadline font-medium text-text-primary">
                  {FACTOR_LABEL[factor.name] ?? factor.name}
                </span>
                <Badge variant={factorVariant(factor.impact)}>
                  {factor.score != null ? `${Math.round(factor.score)}` : factor.impact}
                </Badge>
              </div>
              <p className="mt-1 text-caption1 leading-snug text-text-secondary">{factor.detail}</p>
            </div>
        ))}
      </div>
    </Card>
  );
}

function DriverCard({ driver }: { readonly driver: DriverStat }) {
  return (
    <div className="rounded-xl bg-surface-overlay/55 px-3 py-3">
      <span className="text-caption1 font-medium text-text-muted">{driver.label}</span>
      <div className={`mt-1 font-mono text-title3 font-semibold tabular-nums ${driver.tone}`}>
        {driver.value}
      </div>
      <p className="mt-1 text-caption2 text-text-muted">{driver.detail}</p>
    </div>
  );
}

function factorVariant(
  impact: "positive" | "negative" | "neutral",
): "success" | "error" | "neutral" {
  if (impact === "positive") return "success";
  if (impact === "negative") return "error";
  return "neutral";
}
