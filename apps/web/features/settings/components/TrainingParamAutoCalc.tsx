import { Badge } from "@shared/ui/Badge";
import { AlertTriangle } from "lucide-react";
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_VARIANT,
  METHOD_LABEL,
  formatPace,
  type AutoCalcResult,
} from "./settings-training-params-model";

export function HrMaxAutoCalc({
  data,
  onApply,
}: {
  data: AutoCalcResult["hr_max"] | undefined;
  onApply: () => void;
}) {
  if (!data) return null;
  if (!data.data_sufficient) {
    return (
      <span className="inline-flex items-center gap-1 text-caption1 text-warning">
        <AlertTriangle className="h-4 w-4 text-warning" />
        数据不足（{data.session_count}/5次活动），无法估算
      </span>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="text-caption1 text-text-muted">
        估算 {data.hr_max} bpm
      </span>
      <Badge variant={CONFIDENCE_VARIANT[data.confidence ?? "low"]}>
        置信度 {CONFIDENCE_LABEL[data.confidence ?? "low"]}
      </Badge>
      <span className="text-caption1 text-text-muted" title={METHOD_LABEL[data.method ?? ""]}>
        基于 {data.session_count} 次活动
      </span>
      <button onClick={onApply} className="text-caption1 text-accent-strong hover:underline">
        应用
      </button>
    </div>
  );
}

export function LthrAutoCalc({
  data,
  onApply,
}: {
  data: AutoCalcResult["lthr"] | undefined;
  onApply: () => void;
}) {
  if (!data) return null;
  if (!data.data_sufficient) {
    return (
      <span className="inline-flex items-center gap-1 text-caption1 text-warning">
        <AlertTriangle className="h-4 w-4 text-warning" />
        数据不足，需要更多高强度活动
      </span>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="text-caption1 text-text-muted" title={METHOD_LABEL[data.method ?? ""]}>
        估算 {data.lthr} bpm
      </span>
      <Badge variant={CONFIDENCE_VARIANT[data.confidence ?? "low"]}>
        置信度 {CONFIDENCE_LABEL[data.confidence ?? "low"]}
      </Badge>
      <button onClick={onApply} className="text-caption1 text-accent-strong hover:underline">
        应用
      </button>
    </div>
  );
}

export function ThresholdPaceAutoCalc({
  data,
  onApply,
}: {
  data: AutoCalcResult["threshold_pace"] | undefined;
  onApply?: () => void;
}) {
  if (!data) return null;
  if (!data.data_sufficient) {
    return (
      <span className="inline-flex items-center gap-1 text-caption1 text-warning">
        <AlertTriangle className="h-4 w-4 text-warning" />
        数据不足（{data.effort_count}/4次跑步），无法估算
      </span>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="text-caption1 text-text-muted">
        估算 {formatPace(data.threshold_pace_s_per_km!)} /km
      </span>
      <Badge variant={CONFIDENCE_VARIANT[data.confidence ?? "low"]}>
        置信度 {CONFIDENCE_LABEL[data.confidence ?? "low"]}
      </Badge>
      <span className="text-caption1 text-text-muted" title="临界速度">
        基于 {data.effort_count} 次跑步
      </span>
      {onApply && (
        <button onClick={onApply} className="text-caption1 text-accent-strong hover:underline">
          应用
        </button>
      )}
    </div>
  );
}
