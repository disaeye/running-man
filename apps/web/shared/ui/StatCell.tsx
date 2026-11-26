"use client";

import type { ReactNode } from "react";
import type { TermKey } from "@shared/config/terms";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";

/** 读数格视为缺失的取值；其中短横线统一显示为「未记录」，其余标记（如「样本不足」）原样显示。 */
const MISSING_STAT_VALUES = new Set(["未记录", "样本不足", NO_VALUE, "--", "-"]);
const DASH_VALUES = new Set(["--", "-"]);

function missingLabel(value: ReactNode): ReactNode {
  if (value == null) return NO_VALUE;
  if (typeof value === "string" && DASH_VALUES.has(value.trim())) return NO_VALUE;
  return value;
}

export interface StatCellProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: string;
  /** 只给首页的主决策数字，一次遮罩揭示。 */
  focal?: boolean;
  termKey?: TermKey;
  helpAlign?: "left" | "right";
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone = "",
  focal = false,
  termKey,
  helpAlign = "left",
}: StatCellProps) {
  const isMissing = value == null || (typeof value === "string" && MISSING_STAT_VALUES.has(value.trim()));
  const sizeClass = focal ? "text-3xl sm:text-metric-xl" : "text-2xl";

  return (
    <div className="min-w-0">
      <div className="flex items-center text-caption1 text-text-muted">
        <span className="truncate">{label}</span>
        {termKey ? <MetricInlineDisclosure termKey={termKey} align={helpAlign} /> : null}
      </div>
      <div className={`num ${sizeClass} font-semibold leading-tight ${tone || "text-text-primary"} ${focal ? "focal-reveal" : ""}`}>
        {isMissing ? missingLabel(value) : value}
        {!isMissing && unit ? (
          <span className="ml-0.5 font-sans text-caption1 font-normal text-text-muted">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="text-caption1 text-text-muted">{sub}</div> : null}
    </div>
  );
}

export const StatCell = Stat;
