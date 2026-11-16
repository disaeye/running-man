"use client";

import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";

interface GoalAbandonDialogProps {
  open: boolean;
  goalTitle: string;
  abandoning: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 放弃目标的二次确认。删除连同历史进度与里程碑一起生效，
 * 确认后有 5 秒撤销窗口（goals 页的 toast 通道），所以确认前必须过这一层。
 *
 * 请求在途时弹层不关闭：此时结果还没回来，关掉会让界面看起来像没发生。
 */
export function GoalAbandonDialog({
  open,
  goalTitle,
  abandoning,
  error,
  onCancel,
  onConfirm,
}: GoalAbandonDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (abandoning) return;
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>放弃这个目标？</DialogTitle>
        </DialogHeader>
        <p className="text-subheadline text-text-secondary">
          目标“{goalTitle}”及其历史进度和里程碑将被删除。确认后 5 秒内可撤销。
        </p>
        {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={abandoning}
            data-testid="abandon-goal-cancel"
          >
            保留目标
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={abandoning}
            data-testid="abandon-goal-confirm"
            className="bg-error text-text-inverse hover:bg-error/90"
          >
            {abandoning ? "正在放弃…" : "确认放弃"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
