"use client";

import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Input } from "@shared/ui/input";

export function IntervalsConnectDialog({
  open,
  onClose,
  athleteId,
  setAthleteId,
  apiKey,
  setApiKey,
  error,
  isBusy,
  onConnect,
}: {
  open: boolean;
  onClose(): void;
  athleteId: string;
  setAthleteId(v: string): void;
  apiKey: string;
  setApiKey(v: string): void;
  error?: string | null;
  isBusy: string | null;
  onConnect(): void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && isBusy !== "connect") onClose(); }}>
      <DialogContent mobileSheet>
        <DialogHeader><DialogTitle>配置 Intervals.icu</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConnect();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-caption1 text-text-secondary">
            打开{" "}
            <a
              href="https://intervals.icu/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-strong underline-offset-2 hover:underline"
            >
              Settings → Developer Settings
            </a>
            ，复制 Athlete ID（i 开头）和 API Key。
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-subheadline font-medium text-text-secondary">Athlete ID</span>
            <Input value={athleteId} onChange={(e) => setAthleteId(e.target.value)} placeholder="例如 i12345" autoComplete="username" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-subheadline font-medium text-text-secondary">API Key</span>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Intervals.icu API Key" autoComplete="current-password" />
          </label>
          {error ? (
            <p role="alert" className="text-caption1 text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy === "connect"}>
              取消
            </Button>
            <Button type="submit" disabled={isBusy !== null || !athleteId.trim() || !apiKey.trim()}>
              {isBusy === "connect" ? "连接中…" : "连接"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
