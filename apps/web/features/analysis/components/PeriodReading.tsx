"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Section } from "@shared/ui/Section";
import { zoneFor } from "@shared/lib/metric-zone";

export interface PeriodReadingProps {
  readonly loading: boolean;
  readonly error: string | null;
  /** PMC points inside the active range, oldest first. */
  readonly points: readonly { readonly ctl: number | null; readonly tsb: number | null }[];
  readonly pillars: readonly { readonly title: string; readonly verdict: string }[];
  readonly rangeLabel: string;
}

/**
 * 本期解读：用所选周期的真实数字生成两句以上结论，放在图表之前。
 *
 * 文案来自所选周期内的真实数字，说明里只写计算依据。当前是本地摘要，
 * 生成服务接入后沿用现有的加载、数据不足、失败、就绪四态。
 */
export function PeriodReading({ loading, error, points, pillars, rangeLabel }: PeriodReadingProps) {
  const [expanded, setExpanded] = useState(false);
  const digest = useMemo(() => buildDigest(points, pillars), [points, pillars]);
  const insufficient = !loading && error == null && points.length < 14;
  const visibleDigest = expanded ? digest : digest.slice(0, 2);
  const hiddenCount = Math.max(0, digest.length - visibleDigest.length);

  return (
    <Section
      title="本期解读"
      testId="analysis-period-reading"
      action={<span className="text-caption1 text-text-muted">{rangeLabel}</span>}
    >
      <div className="p-5 text-subheadline leading-relaxed text-text-secondary">
        {loading ? (
          <p role="status" aria-busy="true">正在计算这一期的变化…</p>
        ) : error ? (
          <p className="text-error" role="alert">
            这一期没有算出来：{error}
          </p>
        ) : insufficient ? (
          <p>
            这个范围只有 {points.length} 天数据。解读需要至少 14 天，还差 {14 - points.length} 天。
          </p>
        ) : (
          <div className="space-y-2">
            <ol className="space-y-1.5">
              {visibleDigest.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-accent-strong" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ol>
            {digest.length > 2 ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((prev) => !prev)}
                className="tactile focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-subheadline text-accent-strong hover:underline"
              >
                <span>{expanded ? "收起解读" : `展开其余 ${hiddenCount} 条解读`}</span>
                <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </Section>
  );
}

function buildDigest(
  points: PeriodReadingProps["points"],
  pillars: PeriodReadingProps["pillars"],
): string[] {
  const lines: string[] = [];
  const first = points[0];
  const last = points[points.length - 1];

  if (first?.ctl != null && last?.ctl != null) {
    const startCtl = Math.round(first.ctl * 10) / 10;
    const endCtl = Math.round(last.ctl * 10) / 10;
    const delta = Math.round((endCtl - startCtl) * 10) / 10;
    const direction = delta >= 0 ? "升" : "降";
    lines.push(
      `体能从 ${startCtl.toFixed(1)} ${direction}到 ${endCtl.toFixed(1)}，共 ${Math.abs(delta).toFixed(1)}，${Math.abs(delta) < 2 ? "基本持平" : delta > 0 ? "在积累" : "在回落"}。`,
    );
  }
  if (last?.tsb != null) {
    const roundedTsb = Math.round(last.tsb);
    const zone = zoneFor("tsb", roundedTsb);
    lines.push(
      `状态收在 ${roundedTsb}，${zone ? `${zone.label}：${zone.description}` : "暂无区间"}`,
    );
  }
  for (const pillar of pillars) {
    lines.push(`${pillar.title}：${pillar.verdict}`);
  }
  return lines;
}
