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
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ token: string; url: string }>(
        `/activities/${activityId}/share`,
        { method: "POST" },
      );
      setShareUrl(result.url);
      toast("分享链接已创建", "success");
    } catch {
      toast("创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    try {
      await apiFetch(`/activities/${activityId}/share`, { method: "DELETE" });
      setShareUrl(null);
      toast("已取消分享", "success");
    } catch {
      toast("取消失败", "error");
    }
  };

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast("已复制", "success");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>分享活动</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          {!shareUrl ? (
            <Button onClick={handleShare} disabled={loading}>
              {loading ? "创建中…" : "创建分享链接"}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-base px-3 py-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-caption1 text-text-primary outline-none"
                />
                <Button variant="ghost" className="!py-1 text-caption1" onClick={handleCopy}>
                  复制
                </Button>
              </div>
              <Button variant="ghost" className="text-error" onClick={handleRevoke}>
                取消分享
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
