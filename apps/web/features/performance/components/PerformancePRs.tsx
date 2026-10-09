"use client";

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { Badge } from "@shared/ui/Badge";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { formatDate } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";

export interface PersonalRecord {
  /** Record type, e.g. "fastest_5k", "longest_run" */
  type: string;
  /** Human-readable Chinese label */
  label: string;
  /** Sport type e.g. "Run", "Ride" */
  sport: string;
  /** Activity date (ISO) */
  date: string;
  /** Activity ID */
  activityId: string;
  value_formatted: string;
}

function getRecordTypeBadge(type: string): "success" | "warning" | "info" | "neutral" {
  if (type.includes("fastest") || type.includes("best")) return "success";
  if (type.includes("longest")) return "warning";
  if (type.includes("elevation")) return "info";
  return "neutral";
}

/**
 * Tab 5: 个人纪录
 * Card-based PR display for running & cycling records only.
 */
export function PerformancePRs() {
  const { data: records, loading, error } = usePersonalRecords();

  const bySport = useMemo(() => {
    const map = new Map<string, PersonalRecord[]>();
    for (const pr of records) {
      const existing = map.get(pr.sport) ?? [];
      existing.push(pr);
      map.set(pr.sport, existing);
    }
    return map;
  }, [records]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-subheadline text-text-muted">
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-subheadline text-error">
        {error}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <EmptyState
        title="暂无个人纪录"
        description="当你的训练数据积累到一定程度，系统将自动识别并突出显示你的最佳表现"
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {Array.from(bySport.entries()).map(([sport, prs]) => {
        const config = getSportConfig(sport);
        return (
          <section key={sport}>
            <h2 className="mb-4 text-subheadline font-semibold uppercase tracking-wider text-text-muted">
              {config.label || sport}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {prs.map((pr, idx) => (
                <Card key={`${pr.type}-${idx}`} padding="sm" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-caption1 font-medium text-text-secondary">
                      {pr.label}
                    </span>
                    <Badge variant={getRecordTypeBadge(pr.type)}>
                      PR
                    </Badge>
                  </div>
                  <p className="font-mono text-title1 font-bold text-text-primary">
                    {pr.value_formatted}
                  </p>
                  <p className="text-caption1 text-text-muted">
                    {formatDate(pr.date)}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
