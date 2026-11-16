"use client";

import { AlertTriangle, Check, Info } from "lucide-react";
import { useNotifications } from "@features/today/hooks/useNotifications";

/** 严重度到呈现的映射：规则只产出 warning 与 info。 */
const SEVERITY_VIEW: Record<string, { Icon: typeof Info; cls: string }> = {
  warning: { Icon: AlertTriangle, cls: "text-warn" },
  error: { Icon: AlertTriangle, cls: "text-error" },
  info: { Icon: Info, cls: "text-text-secondary" },
};

/** 首页提示层：未读通知一行一条，最多三条，看了即消。 */
export function HomeNoticeStrip() {
  const { notices, markRead } = useNotifications();
  if (notices.length === 0) return null;
  return (
    <ul data-testid="home-notices" className="space-y-2" aria-label="提醒">
      {notices.slice(0, 3).map((notice) => {
        const view = SEVERITY_VIEW[notice.severity] ?? SEVERITY_VIEW.info!;
        return (
          <li key={notice.id} className="flex items-start gap-2.5 rounded-xl bg-secondary p-3">
            <view.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${view.cls}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-subheadline font-medium text-text-primary">{notice.title}</p>
              {notice.body ? (
                <p className="mt-0.5 text-caption1 text-text-secondary">{notice.body}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void markRead(notice.id)}
              className="focus-ring tactile flex min-h-11 items-center gap-1 rounded-full px-2 text-caption1 text-accent-strong"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              知道了
            </button>
          </li>
        );
      })}
    </ul>
  );
}
