"use client";

import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";

interface ResyncDialogProps {
  open: boolean;
  onClose(): void;
  onConfirm(): Promise<void>;
  isBusy?: boolean;
}

/** 全量重拉会清空本地已导入的活动与健康数据，必须经运动员确认后执行。 */
export function ResyncDialog({ open, onClose, onConfirm, isBusy = false }: ResyncDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isBusy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>重新同步全部历史？</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-caption1">
          <p className="text-text-secondary leading-relaxed">
            将清空 Intervals.icu 已导入的活动、数据流与健康记录，然后从账号最早的活动开始，按自然月重新拉取全部历史。手动上传的活动不受影响，期间无法发起其他同步任务。
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isBusy}>
              取消
            </Button>
            <Button onClick={() => void handleConfirm()} disabled={isBusy} data-testid="resync-confirm">
              {isBusy ? "排队中…" : "清空并重新同步"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
