"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { apiFetch } from "@shared/lib/api";
import { useToast } from "@shared/ui/Toast";

interface Props {
  activityId: string;
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({ activityId, open, onClose }: Props) {
  const { toast } = useToast();
  const [prevActivityId, setPrevActivityId] = useState(activityId);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  if (prevActivityId !== activityId) {
    setPrevActivityId(activityId);
    setShareUrl(null);
    setConfirmRevoke(false);
  }

  const handleShare = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ token: string; url: string }>(
        `/activities/${activityId}/share`,
        { method: "POST" },
      );
      setShareUrl(result.url);
      setConfirmRevoke(false);
      toast("分享链接已创建", "success");
    } catch {
      toast("创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setLoading(true);
    try {
      await apiFetch(`/activities/${activityId}/share`, { method: "DELETE" });
      setShareUrl(null);
      setConfirmRevoke(false);
      toast("已取消分享", "success");
    } catch {
      toast("取消失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("已复制分享链接", "success");
    } catch {
      toast("复制失败，请手动选中链接复制", "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="sm:max-w-sm" mobileSheet>
        <DialogHeader><DialogTitle>分享活动</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="rounded-xl bg-surface-overlay p-3 text-caption1 leading-relaxed text-text-secondary">
            公开范围：仅展示活动名称、日期、距离、时长、平均配速、平均心率与爬升；不包含 GPS 原始坐标及起止位置隐私。
          </p>
          {!shareUrl ? (
            <Button onClick={() => void handleShare()} disabled={loading}>
              {loading ? "创建中…" : "创建分享链接"}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-base px-3 py-2">
                <input
                  readOnly
                  aria-label="分享链接"
                  value={shareUrl}
                  className="min-w-0 flex-1 bg-transparent text-caption1 text-text-primary outline-none"
                />
                <Button variant="ghost" className="min-h-11 shrink-0 text-caption1" onClick={handleCopy}>
                  复制
                </Button>
              </div>
              {confirmRevoke ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption1">
                  <span className="text-error">撤销后原链接将立即失效</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(false)} disabled={loading}>
                      保留
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void handleRevoke()} disabled={loading}>
                      确认撤销
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="text-error" onClick={() => setConfirmRevoke(true)}>
                  取消分享
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
