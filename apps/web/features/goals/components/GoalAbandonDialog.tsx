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
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 放弃目标的二次确认。删除连同历史进度与里程碑一起生效，不可撤销，
 * 所以确认前必须过这一层。
 *
 * 请求在途时弹层不关闭：此时结果还没回来，关掉会让界面看起来像没发生。
 */
export function GoalAbandonDialog({
  open,
  goalTitle,
  abandoning,
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
          目标 “{goalTitle}” 将被删除，历史进度与里程碑也会一并清除。此操作不可撤销。
        </p>
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
