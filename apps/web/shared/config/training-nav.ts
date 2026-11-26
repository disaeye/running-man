/**
 * 训练工作区的二级导航：日历、记录、力量三个入口共用一个页头，
 * 各自维护自己的 URL 查询参数，切换入口时不携带其他入口的参数。
 */
export type TrainingTabId = "calendar" | "activities" | "strength";

export interface TrainingTab {
  readonly id: TrainingTabId;
  readonly label: string;
  readonly href: string;
}

export const TRAINING_TABS: readonly TrainingTab[] = [
  { id: "calendar", label: "日历", href: "/calendar" },
  { id: "activities", label: "记录", href: "/activities" },
  { id: "strength", label: "力量", href: "/strength" },
] as const;

/** `/activities/*` 的详情页同样归属「记录」，一级导航据此高亮「训练」。 */
export function activeTrainingTabFromPath(pathname: string): TrainingTabId | null {
  for (const tab of TRAINING_TABS) {
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) return tab.id;
  }
  return null;
}

export function activityDetailUrl(activityId: string, returnTo: string): string {
  return `/activities/${encodeURIComponent(activityId)}?${new URLSearchParams({ returnTo })}`;
}

export function trainingReturnUrl(value: string | null): string | null {
  if (!value || !TRAINING_TABS.some(({ href }) => value === href || value.startsWith(`${href}?`))) {
    return null;
  }
  return value;
}

export type StrengthTabId = "log" | "analytics";

/** `?tab=` 只区分两种模式；缺省或未知值都是记录训练。 */
export function resolveStrengthTab(raw: string | null): StrengthTabId {
  return raw === "analytics" ? "analytics" : "log";
}

export function strengthTabUrl(tab: StrengthTabId, date?: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (date) params.set("date", date);
  return `/strength?${params}`;
}

/** 力量工作台的记录入口；带上日期时预填为该日的训练日期。 */
export function strengthLogUrl(date?: string | null): string {
  return strengthTabUrl("log", date);
}
