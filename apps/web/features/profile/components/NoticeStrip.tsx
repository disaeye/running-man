"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Info } from "lucide-react";
import { useNotifications, type NoticeItem } from "@features/today/hooks/useNotifications";
import { activityLocalDay, useAthleteTimezoneState } from "@shared/lib/training-day";

/** 严重度到呈现的映射：规则只产出 warning 与 info。 */
const SEVERITY_VIEW: Record<string, { Icon: typeof Info; cls: string }> = {
  warning: { Icon: AlertTriangle, cls: "text-warn" },
  error: { Icon: AlertTriangle, cls: "text-error" },
  info: { Icon: Info, cls: "text-text-secondary" },
};

interface NoticeGroup {
  readonly title: string;
  readonly body: string | null;
  readonly severity: string;
  readonly ids: readonly string[];
}

/** 过滤往日的信息类提醒，把同文提醒合并成组，并按严重度排序。 */
function groupNotices(notices: readonly NoticeItem[], timezone: string): NoticeGroup[] {
  const today = activityLocalDay(new Date(), timezone);
  const rank = (s: string) => (s === "error" ? 0 : s === "warning" ? 1 : 2);
  const byText = new Map<string, NoticeGroup>();
  for (const notice of notices) {
    if (notice.severity === "info" && activityLocalDay(notice.created_at, timezone) !== today) continue;
    const key = `${notice.title}\n${notice.body ?? ""}`;
    const existing = byText.get(key);
    if (existing) {
      byText.set(key, { ...existing, ids: [...existing.ids, notice.id] });
    } else {
      byText.set(key, { title: notice.title, body: notice.body ?? null, severity: notice.severity, ids: [notice.id] });
    }
  }
  return [...byText.values()].sort((a, b) => rank(a.severity) - rank(b.severity));
}

/**
 * 「我的」页提醒条：只保留当天生成的提醒与需要处理的警告，往日的信息类提醒
 * （例如前一天的「今天有计划训练」）不再出现；同一天内重复生成的同文提醒合并成一条，
 * 「知道了」一次标记整组已读。默认只展示最高优先级 1 条，其余收纳可一键展开。
 */
export function NoticeStrip() {
  const { notices, markRead } = useNotifications();
  const { timezone } = useAthleteTimezoneState();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => groupNotices(notices, timezone), [notices, timezone]);
  if (groups.length === 0) return null;

  const visible = expanded ? groups.slice(0, 5) : groups.slice(0, 1);
  const hiddenCount = groups.length - visible.length;

  const dismiss = async (ids: readonly string[]) => {
    setBusy(true);
    try {
      for (const id of ids) await markRead(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5" data-testid="profile-notices">
      <ul className="space-y-1.5" aria-label="提醒">
        {visible.map((group) => {
          const view = SEVERITY_VIEW[group.severity] ?? SEVERITY_VIEW.info!;
          return (
            <NoticeLine
              key={group.ids[0]}
              group={group}
              expanded={expanded}
              busy={busy}
              icon={view.Icon}
              iconCls={view.cls}
              onDismiss={() => void dismiss(group.ids)}
            />
          );
        })}
      </ul>
      {groups.length > 1 ? (
        <div className="flex justify-end">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="focus-ring tactile rounded-full px-2 text-subheadline text-text-muted hover:text-text-primary"
          >
            {expanded ? "收起其余提醒" : `展开其余 ${hiddenCount} 条未读提醒`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NoticeLine({ group, expanded, busy, icon: Icon, iconCls, onDismiss }: {
  readonly group: NoticeGroup;
  readonly expanded: boolean;
  readonly busy: boolean;
  readonly icon: typeof Info;
  readonly iconCls: string;
  readonly onDismiss: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl bg-secondary px-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${iconCls}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-subheadline font-medium text-text-primary">{group.title}</p>
        {group.body ? (
          <p className={`text-caption1 text-text-secondary ${expanded ? "" : "truncate"}`}>{group.body}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onDismiss}
        className="focus-ring tactile flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-subheadline text-accent-strong disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        {busy ? "处理中" : "知道了"}
      </button>
    </li>
  );
}
