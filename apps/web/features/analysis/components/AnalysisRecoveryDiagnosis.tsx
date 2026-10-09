import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import { READINESS_LEVEL_LABEL } from "@features/today/components/ReadinessHeroCard";
import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import {
  buildRecoveryDiagnosis,
  buildRecoveryDrivers,
  type DriverStat,
} from "./recovery-diagnosis";

const FACTOR_LABEL: Record<string, string> = {
  sleep: "睡眠",
  resting_hr: "静息心率",
  tsb: "训练应激平衡",
  atl_velocity: "疲劳累积速度",
};

export function RecoverySparseState() {
  return (
    <Card padding="md" data-testid="recovery-sparse-state">
      <SectionHeader title="恢复诊断需要至少 3 天健康记录" />
      <p className="mt-3 text-footnote leading-relaxed text-text-secondary">
        记录睡眠、静息心率、HRV 或 VO₂max 后，Analysis 会把恢复趋势与训练负荷放在同一时间轴解释，而不是给出单日行动建议。
      </p>
    </Card>
  );
}

export function RecoveryDiagnosisCard({
  wellness,
  latestLoad,
  readiness,
}: {
  readonly wellness: WellnessPoint[];
  readonly latestLoad: PmcPoint | null;
  readonly readiness: LocalReadiness | null;
}) {
  const diagnosis = buildRecoveryDiagnosis(readiness, latestLoad, wellness.length);
  const drivers = buildRecoveryDrivers(wellness);
  return (
    <Card
      padding="md"
      data-testid="recovery-diagnosis-summary"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
            恢复
          </p>
          <h3 className={`mt-1.5 text-title2 font-semibold ${diagnosis.tone}`}>
            {diagnosis.title}
          </h3>
          <p className="sr-only">{diagnosis.detail}</p>
        </div>
        <Badge variant={diagnosis.variant} className="w-fit text-subheadline">
          {diagnosis.badge}
        </Badge>
      </div>
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
        {readiness.factors.map((factor) => (
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
            <p className="sr-only">{factor.detail}</p>
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
