"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";

interface DisconnectConfirmDialogProps {
  open: boolean;
  onClose(): void;
  onConfirm(clearData: boolean): Promise<boolean | void>;
  isBusy?: boolean;
}

export function DisconnectConfirmDialog({
  open,
  onClose,
  onConfirm,
  isBusy = false,
}: DisconnectConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isBusy) onClose(); }}>
      <DialogContent className="max-w-md" mobileSheet>
        <DialogHeader>
          <DialogTitle>断开 Intervals.icu 连接</DialogTitle>
        </DialogHeader>
        {open ? (
          <DisconnectConfirmBody onClose={onClose} onConfirm={onConfirm} isBusy={isBusy} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DisconnectConfirmBody({
  onClose,
  onConfirm,
  isBusy,
}: Omit<DisconnectConfirmDialogProps, "open">) {
  const [clearData, setClearData] = useState(false);

  const handleConfirm = async () => {
    const ok = await onConfirm(clearData);
    if (ok !== false) onClose();
  };

  return (
    <div className="flex flex-col gap-4 text-caption1">
          <p className="text-text-secondary leading-relaxed">
            断开连接后，系统将停止自动同步。请选择如何处理当前已导入的活动、时序流与健康数据。
          </p>

          <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-surface-sunken/60 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="clearData"
                className="mt-0.5"
                checked={!clearData}
                onChange={() => setClearData(false)}
              />
              <div>
                <span className="font-medium text-text-primary block">
                  仅断开连接（推荐）
                </span>
                <span className="text-caption1 text-text-muted block mt-0.5">
                  保留已导入的全部历史活动与图表，仅解除授权。后续重新连接无需重新导入。
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-border-default/60">
              <input
                type="radio"
                name="clearData"
                className="mt-0.5 text-error"
                checked={clearData}
                onChange={() => setClearData(true)}
              />
              <div>
                <span className="font-medium text-error block">
                  断开并清空该来源全部数据
                </span>
                <span className="text-caption1 text-text-muted block mt-0.5">
                  物理删除所有来自 Intervals.icu 的活动摘要、时序流与健康日志，并更新相关训练统计。
                </span>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={isBusy}>
              取消
            </Button>
            <Button
              variant={clearData ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={isBusy}
            >
              {isBusy ? "正在处理…" : clearData ? "确认断开并清空" : "确认断开"}
            </Button>
          </div>
        </div>
  );
}
