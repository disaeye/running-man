"use client";

import { useMemo, useState } from "react";
import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Input } from "@shared/ui/input";
import { useSourceCoverage } from "@features/data/hooks/useSyncJobs";

interface BackfillDialogProps {
  open: boolean;
  onClose(): void;
  onStartBackfill(fromDate: string): Promise<void>;
  isBusy?: boolean;
}

function subMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function BackfillDialog({
  open,
  onClose,
  onStartBackfill,
  isBusy = false,
}: BackfillDialogProps) {
  const { coverage } = useSourceCoverage("intervals_icu");
  const [fromDate, setFromDate] = useState(() => subMonths(12));

  const presets = useMemo(
    () => [
      { label: "近 6 个月", date: subMonths(6) },
      { label: "近 1 年", date: subMonths(12) },
      { label: "近 2 年", date: subMonths(24) },
      { label: "2024 年至今", date: "2024-01-01" },
    ],
    [],
  );

  const handleSubmit = async () => {
    if (!fromDate) return;
    await onStartBackfill(fromDate);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>导入更早历史数据</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-caption1">
          <p className="text-text-secondary leading-relaxed">
            日常同步自动覆盖全部历史。如需重新拉取某个时间点之后的数据，请选择起始日期。系统将按日历月分批拉取，中途可随时查看进度。
          </p>

          <div className="rounded-xl border border-border-default bg-surface-sunken/60 p-3 space-y-1">
            <span className="text-caption1 font-medium text-text-muted">
              当前本地数据覆盖
            </span>
            <p className="font-medium text-text-primary">
              {coverage?.firstActivityDate && coverage?.lastActivityDate
                ? `${coverage.firstActivityDate} 至 ${coverage.lastActivityDate}（已导入 ${coverage.activityCount} 条活动）`
                : "尚未导入历史活动"}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-subheadline font-medium text-text-primary">
              快捷起始时间
            </span>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  size="xs"
                  variant={fromDate === preset.date ? "default" : "secondary"}
                  onClick={() => setFromDate(preset.date)}
                  type="button"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-subheadline font-medium text-text-primary">
              起始日期（从该日拉取至今）
            </span>
            <Input
              type="date"
              value={fromDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isBusy}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isBusy || !fromDate}>
              {isBusy ? "排队中…" : "开始分批导入"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
