"use client";

import { Inbox } from "lucide-react";
import { Badge, Tag } from "@shared/ui/Badge";
import { Bar } from "@shared/ui/MetricBar";
import { SourceTag } from "@shared/ui/SourceTag";
import { Skeleton } from "@shared/ui/Skeleton";
import { EmptyState } from "@shared/ui/EmptyState";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { ToastProvider, useToast } from "@shared/ui/Toast";
import { Button } from "@shared/ui/button";
import { ShowcaseHeading } from "./ShowcaseHeading";

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
          <ShowcaseHeading title="Badge & Tag & SourceTag" subtitle="Unified semantic status pills" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag tone="primary">Primary Tag</Tag>
            <SourceTag source="device" />
            <SourceTag source="manual" />
            <SourceTag source="estimate" />
          </div>
        </div>

        <div>
          <ShowcaseHeading title="MetricInlineDisclosure" subtitle="Touch-friendly 44px inline metric explanation" />
          <div className="mt-4 flex items-center gap-6 text-subheadline text-text-primary">
            <span className="inline-flex items-center">CTL <MetricInlineDisclosure termKey="CTL" /></span>
            <span className="inline-flex items-center">TSB <MetricInlineDisclosure termKey="TSB" /></span>
            <span className="inline-flex items-center">VO₂max <MetricInlineDisclosure termKey="VO2MAX" /></span>
          </div>
        </div>

        <div>
          <ShowcaseHeading title="MetricBar" subtitle="Hardware-accelerated scaleX progress bar" />
          <div className="mt-4 max-w-sm space-y-3">
            <Bar value={65} max={100} />
            <Bar value={88} max={100} tone="bg-success" />
          </div>
        </div>

        <div>
          <ShowcaseHeading title="Skeleton" subtitle="Text / Rectangular / Circular" />
          <div className="mt-4 flex max-w-sm flex-col gap-2">
            <Skeleton variant="text" />
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="rectangular" height={64} />
            <Skeleton variant="circular" width={40} height={40} />
          </div>
        </div>

        <div>
          <ShowcaseHeading title="EmptyState & Toast" />
          <div className="mt-4 space-y-4">
            <EmptyState
              icon={<Inbox />}
              title="暂无活动"
              description="导入 FIT/GPX 文件后活动将在此显示"
              action={<Button size="sm">导入活动</Button>}
            />
            <ToastDemo />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
