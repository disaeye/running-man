interface WarningBadgeProps {
  isOvertrainingRisk: boolean;
  isHighLoadRisk: boolean;
  isFresh: boolean;
}

export function WarningBadge({
  isOvertrainingRisk,
  isHighLoadRisk,
  isFresh,
}: WarningBadgeProps) {
  if (isOvertrainingRisk) {
    return (
      <span className="inline-block rounded-sm bg-error/15 px-2 py-0.5 text-caption1 font-medium text-error">
        过度训练风险
      </span>
    );
  }
  if (isHighLoadRisk) {
    return (
      <span className="inline-block rounded-sm bg-warning/15 px-2 py-0.5 text-caption1 font-medium text-warning">
        高负荷风险
      </span>
    );
  }
  if (isFresh) {
    return (
      <span className="inline-block rounded-sm bg-success/15 px-2 py-0.5 text-caption1 font-medium text-success">
        状态良好
      </span>
    );
  }
  return null;
}
