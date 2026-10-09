"use client";

import { Badge } from "@shared/ui/Badge";
import { Skeleton } from "@shared/ui/Skeleton";
import { Progress } from "@shared/ui/Progress";
import { EmptyState } from "@shared/ui/EmptyState";
import { DataState } from "@shared/ui/DataState";
import { ToastProvider, useToast } from "@shared/ui/Toast";
import { Button } from "@shared/ui/button";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { Inbox } from "lucide-react";

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => toast("操作成功", "success")}>Success</Button>
      <Button size="sm" variant="outline" onClick={() => toast("操作失败", "error")}>Error</Button>
      <Button size="sm" variant="outline" onClick={() => toast("提示信息", "info")}>Info</Button>
      <Button size="sm" variant="outline" onClick={() => toast("注意警告", "warning")}>Warning</Button>
    </div>
  );
}

export function FeedbackGallery() {
  return (
    <ToastProvider>
      <div className="flex flex-col gap-8">
        <div>
          <SectionHeader title="Badge Variants" subtitle="All 6 semantic variants" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="info">Info</Badge>
          </div>
        </div>

        <div>
          <SectionHeader title="Skeleton" subtitle="Text / Rectangular / Circular" />
          <div className="mt-4 flex flex-col gap-2 max-w-sm">
            <Skeleton variant="text" />
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="rectangular" height={80} />
            <Skeleton variant="circular" width={48} height={48} />
          </div>
        </div>

        <div>
          <SectionHeader title="Progress" subtitle="SM / Default / LG" />
          <div className="mt-4 flex flex-col gap-4 max-w-sm">
            <Progress value={65} label="CTL 目标进度" showValue max={100} />
            <Progress value={30} size="sm" />
            <Progress value={90} size="lg" barClass="bg-success" />
          </div>
        </div>

        <div>
          <SectionHeader title="EmptyState" />
          <EmptyState
            icon={<Inbox />}
            title="暂无活动"
            description="导入 FIT/GPX 文件后活动将在此显示"
            action={<Button size="sm">导入活动</Button>}
            className="mt-4"
          />
        </div>

        <div>
          <SectionHeader title="DataState" subtitle="All 7 states" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <DataState state="loading" source="Intervals.icu" />
            <DataState state="ready" source="Intervals.icu" dataAsOf="2026-07-19T08:00:00Z">
              <p className="text-subheadline text-text-primary">数据已就绪</p>
            </DataState>
            <DataState state="source-error" source="Strava" drillDownHref="/data" />
            <DataState state="source-empty" source={null} drillDownHref="/data" />
            <DataState state="stale" source="Intervals.icu" dataAsOf="2026-01-01T00:00:00Z" drillDownHref="/data" />
            <DataState state="field-missing" source="健康数据" drillDownHref="/data" />
            <DataState state="needs-action" drillDownHref="/data" />
          </div>
        </div>

        <div>
          <SectionHeader title="Toast" subtitle="Click to trigger each variant" />
          <div className="mt-4">
            <ToastDemo />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
