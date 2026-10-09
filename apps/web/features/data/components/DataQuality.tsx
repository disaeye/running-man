"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/Skeleton";
import { apiErrorMessage } from "@shared/lib/api";
import { useDataQuality, type QualityIssue } from "@features/data/hooks/useDataQuality";

const STATUS_LABEL = { ok: "正常", warning: "需要关注", error: "需要处理" } as const;
const STATUS_VARIANT = { ok: "success", warning: "warning", error: "error" } as const;

export function DataQuality() {
  const { data, loading, refreshing, error, reload } = useDataQuality();

  if (loading) {
    return (
      <Card>
        <div className="space-y-3" data-testid="data-quality-loading" role="status" aria-busy="true">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-callout font-semibold text-text-primary">数据质量</h2>
            <p className="mt-2 text-subheadline text-error" role="alert" data-testid="data-quality-error">
              {error ? apiErrorMessage(error) : "数据质量暂不可用"}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="size-4" aria-hidden /> 重试
          </Button>
        </div>
      </Card>
    );
  }

  const { summary, issues, coverage } = data;
  const status = summary.status in STATUS_LABEL ? summary.status as keyof typeof STATUS_LABEL : "warning";
  const activities = coverage.activities;
  const metrics = [
    ["心率", activities.with_hr, activities.total_activities],
    ["GPS", activities.with_gps, activities.total_activities],
    ["功率", activities.with_power, activities.total_activities],
    ["流数据", activities.with_streams, activities.total_activities],
    ["睡眠", coverage.wellness.sleep_days_28d, 28],
    ["静息心率", coverage.wellness.rhr_days_28d, 28],
    ["HRV", coverage.wellness.hrv_days_28d ?? 0, 28],
    ["力量训练", coverage.strength?.sessions_14d ?? 0, 14],
  ] as const;

  return (
    <Card data-testid="data-quality-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-callout font-semibold text-text-primary">数据质量</h2>
          <p className="mt-1 text-caption1 text-text-muted">
            后端规则检查 · {summary.last_checked_at ? new Date(summary.last_checked_at).toLocaleString("zh-CN") : "刚刚"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <span className="text-caption1 text-text-muted" role="status">正在更新…</span>}
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="data-quality-coverage">
        {metrics.map(([label, observed, expected]) => {
          const percentage = expected > 0 ? Math.round((observed / expected) * 100) : 0;
          const tone = percentage >= 80 ? "bg-success" : percentage >= 50 ? "bg-warning" : "bg-error";
          return (
            <div key={label} className="rounded-lg bg-surface-base p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption1 text-text-muted">{label}</span>
                <span className="font-mono text-caption1 tabular-nums text-text-secondary">
                  {observed}/{expected}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
              </div>
              <span className="mt-1 block text-right font-mono text-caption1 tabular-nums text-text-muted">{percentage}%</span>
            </div>
          );
        })}
      </div>

      {issues.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 text-subheadline text-success" role="status">
          <CheckCircle2 className="size-4" aria-hidden /> 数据状态良好，暂无异常
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          <p className="text-caption1 font-medium text-text-secondary">{summary.issue_count} 个问题影响数据完整性</p>
          <ul className="space-y-2">
            {issues.map((issue) => <QualityIssueRow key={issue.key} issue={issue} />)}
          </ul>
          <Link href="/settings?section=data" className="mt-2 inline-flex min-h-[44px] items-center text-caption1 font-medium text-accent-strong hover:underline">
            打开数据设置 →
          </Link>
        </div>
      )}

      {coverage.uploads != null && (coverage.uploads.runs_30d ?? 0) > 0 && (
        <p className="mt-3 text-caption1 text-text-muted" data-testid="data-quality-uploads">
          近30天手动上传 {coverage.uploads.runs_30d ?? 0} 个批次
          {(coverage.uploads.failed_30d ?? 0) > 0
            ? `，其中 ${coverage.uploads.failed_30d ?? 0} 个批次存在失败文件`
            : "，全部成功"}
        </p>
      )}
    </Card>
  );
}

function QualityIssueRow({ issue }: { issue: QualityIssue }) {
  const Icon = issue.severity === "error" ? AlertTriangle : issue.severity === "warning" ? AlertTriangle : Info;
  const color = issue.severity === "error" ? "text-error" : issue.severity === "warning" ? "text-warning" : "text-info";
  return (
    <li className="flex items-start gap-2 rounded-md bg-surface-base px-3 py-2 text-subheadline">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <span className="flex-1 text-text-primary">{issue.label}</span>
      {issue.count != null && <span className="font-mono text-caption1 tabular-nums text-text-muted">{issue.count} 条</span>}
    </li>
  );
}
