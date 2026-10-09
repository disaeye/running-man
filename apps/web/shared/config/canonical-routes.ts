/**
 * Canonical route model — single source of truth for URL normalization.
 *
 * Normalizes legacy tab/section/view aliases to canonical URLs so deep links
 * and bookmarked URLs always resolve to the current contract. Pure logic
 * only; no React or Next.js imports.
 *
 * Three independent URL-state dimensions live here:
 *
 * - `?tab=` on `/analysis`        (overview | load | performance | intensity)
 * - `?view=` on `/calendar`       (week | month | list)
 * - `?section=` on `/settings`    (data | training | account; legacy `profile` → account)
 *
 * Each dimension has its own alias table and round-trip URL builders.
 * Pages import the resolved tab/section/view and the canonical-write
 * helpers so deep-link parsing, share-link copy, replace-style navigation,
 * and initial-load alias settling never duplicate string conditionals.
 */

export type AnalysisTabId = "load" | "performance" | "intensity";
export type AnalysisPageTab = "overview" | AnalysisTabId;

/** Canonical `/calendar?view=` values. Legacy `strength` resolves to `list` via `CALENDAR_VIEW_ALIASES`. */
export type CalendarViewId = "week" | "month" | "list";
export type SettingsSectionId = "data" | "training" | "account";

const ANALYSIS_TAB_ALIASES: Readonly<Record<string, AnalysisTabId>> = {
  ability: "performance",
  recovery: "load",
};

const CANONICAL_ANALYSIS_TABS: ReadonlySet<AnalysisTabId> = new Set([
  "load",
  "performance",
  "intensity",
]);

const CALENDAR_VIEW_ALIASES: Readonly<Record<string, CalendarViewId>> = {
  strength: "list",
};

const CANONICAL_CALENDAR_VIEWS: ReadonlySet<CalendarViewId> = new Set([
  "week",
  "month",
  "list",
]);

const CANONICAL_SETTINGS_SECTIONS: ReadonlySet<SettingsSectionId> = new Set([
  "data",
  "training",
  "account",
]);

const SETTINGS_SECTION_ALIASES: Readonly<Record<string, SettingsSectionId>> = {
  profile: "account",
};

function isAnalysisTabId(value: string): value is AnalysisTabId {
  return CANONICAL_ANALYSIS_TABS.has(value as AnalysisTabId);
}
function isCalendarViewId(value: string): value is CalendarViewId {
  return CANONICAL_CALENDAR_VIEWS.has(value as CalendarViewId);
}
function isSettingsSectionId(value: string): value is SettingsSectionId {
  return CANONICAL_SETTINGS_SECTIONS.has(value as SettingsSectionId);
}

/**
 * Resolve a raw `?tab=` value on `/analysis` to a canonical tab.
 */
export function resolveAnalysisPageTab(raw: string | null): AnalysisPageTab {
  if (raw == null || raw === "" || raw === "overview") return "overview";
  if (isAnalysisTabId(raw)) return raw;
  const aliasTarget = ANALYSIS_TAB_ALIASES[raw];
  if (aliasTarget) return aliasTarget;
  return "overview";
}

/**
 * Resolve a raw `?view=` value on `/calendar` to a canonical view.
 * Accepts legacy `strength` (now folded into the 日志 view) and maps
 * it to `list`; falls back to `week` for unknown / missing values.
 */
export function resolveCalendarView(raw: string | null): CalendarViewId {
  if (raw != null && isCalendarViewId(raw)) return raw;
  if (raw != null) {
    const aliasTarget = CALENDAR_VIEW_ALIASES[raw];
    if (aliasTarget) return aliasTarget;
  }
  return "week";
}

/**
 * Resolve a raw `?section=` value on `/settings` to a canonical section.
 * Accepts both `?section=<id>` and legacy `?tab=<id>`; falls back to `"data"`.
 */
export function resolveSettingsSection(
  sectionParam: string | null,
  tabParam: string | null,
): SettingsSectionId {
  if (sectionParam != null) {
    if (isSettingsSectionId(sectionParam)) return sectionParam;
    const alias = SETTINGS_SECTION_ALIASES[sectionParam];
    if (alias) return alias;
  }
  if (tabParam != null) {
    if (isSettingsSectionId(tabParam)) return tabParam;
    const alias = SETTINGS_SECTION_ALIASES[tabParam];
    if (alias) return alias;
  }
  return "data";
}

/**
 * Canonical `/analysis` URL for a given tab. `"overview"` collapses to bare.
 */
export function analysisTabUrl(tab: AnalysisPageTab): string {
  return tab === "overview" ? "/analysis" : `/analysis?tab=${tab}`;
}

/**
 * Canonical `/calendar` URL for a given view. `"week"` collapses to bare.
 */
export function calendarViewUrl(view: CalendarViewId, pathname = "/calendar"): string {
  return view === "week" ? pathname : `${pathname}?view=${view}`;
}

/**
 * Canonical `/settings` URL for a given section. `"data"` collapses to bare.
 */
export function settingsSectionUrl(
  section: SettingsSectionId,
  pathname = "/settings",
): string {
  return section === "data" ? pathname : `${pathname}?section=${section}`;
}

/**
 * Build the canonical replacement URL the settings page writes when the
 * user actively picks a new section. Always canonicalizes: drops legacy
 * `?tab=`, drops stale `?section=`, preserves everything else.
 */
export function settingsSectionNavUrl(
  currentParams: URLSearchParams,
  nextSection: SettingsSectionId,
  pathname = "/settings",
): string {
  const preserved = new URLSearchParams();
  for (const [key, value] of currentParams.entries()) {
    if (key === "section" || key === "tab") continue;
    preserved.set(key, value);
  }
  if (nextSection !== "data") preserved.set("section", nextSection);
  const query = preserved.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

/**
 * Compose a *replace-style* update for an arbitrary canonical page URL.
 * Returns `pathname` unchanged when the partial query is empty so callers
 * can safely pass it to `router.replace(url, { scroll: false })`.
 */
export function canonicalTabUrl(
  pathname: string,
  params: Readonly<Record<string, string | null>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") search.set(key, value);
  }
  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

function joinUrl(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

/**
 * Rewrite `params` so that `ownedKey=value` if present (insertion order
 * matches `params`); `ownedKey` is removed if `ownedValue` is null. The
 * original insertion order of all other keys is preserved so the visible
 * URL only re-orders when the owned key actually changes.
 */
function replaceOwnedKey(
  pathname: string,
  params: URLSearchParams,
  ownedKey: string,
  ownedValue: string | null,
): string {
  const next = new URLSearchParams();
  let inserted = false;
  for (const [key, value] of params.entries()) {
    if (key === ownedKey) {
      if (!inserted && ownedValue !== null) {
        next.set(ownedKey, ownedValue);
        inserted = true;
      }
      continue;
    }
    next.set(key, value);
  }
  if (!inserted && ownedValue !== null) next.set(ownedKey, ownedValue);
  return joinUrl(pathname, next);
}

/**
 * True when the canonical desired URL (built by `replaceOwnedKey` on
 * `params`) equals the `joinUrl` of `params`. Used by the
 * `canonicalSearch*` helpers to short-circuit when current is already
 * canonical, preserving original key ordering in both directions.
 */
function isAlreadyCanonical(
  pathname: string,
  params: URLSearchParams,
  ownedKey: string,
  ownedValue: string | null,
): boolean {
  return (
    replaceOwnedKey(pathname, params, ownedKey, ownedValue) ===
    joinUrl(pathname, params)
  );
}

/**
 * Build the canonical `/analysis` URL the page should *replace to* on
 * initial load, or `null` when the current URL is already canonical so
 * the caller can skip `router.replace` and prevent a replace loop.
 *
 * Aliases covered:
 * - `?tab=ability` → `?tab=performance`
 * - `?tab=recovery` → `?tab=load`
 * - `?tab=overview` (or empty/null) → bare `/analysis`
 * - unknown / garbage → bare `/analysis`
 * - canonical values pass through unchanged.
 *
 * Non-`tab` query params are preserved.
 */
export function canonicalAnalysisSearch(
  currentParams: URLSearchParams,
  pathname = "/analysis",
): string | null {
  const rawTab = currentParams.get("tab");
  const resolved = resolveAnalysisPageTab(rawTab);
  const canonicalTab = resolved === "overview" ? null : resolved;
  if (isAlreadyCanonical(pathname, currentParams, "tab", canonicalTab)) return null;
  return replaceOwnedKey(pathname, currentParams, "tab", canonicalTab);
}

export function canonicalCalendarSearch(
  currentParams: URLSearchParams,
  pathname = "/calendar",
): string | null {
  const rawView = currentParams.get("view");
  const resolved = resolveCalendarView(rawView);
  const canonicalView = resolved === "week" ? null : resolved;
  if (isAlreadyCanonical(pathname, currentParams, "view", canonicalView)) return null;
  return replaceOwnedKey(pathname, currentParams, "view", canonicalView);
}

/**
 * Build the canonical `/settings` URL the page should *replace to* on
 * initial load, or `null` when already canonical.
 *
 * Critical contract: legacy `?tab=<id>` deep links always settle to
 * canonical `?section=<id>` (or bare `/settings` for `data`). The
 * resolver keeps accepting `?tab=` for back-compat reads; the URL the
 * page shows must canonicalize so a reload does not bring back the
 * legacy key. Non-settings keys are preserved.
 */
export function canonicalSettingsSearch(
  currentParams: URLSearchParams,
  pathname = "/settings",
): string | null {
  const resolved = resolveSettingsSection(
    currentParams.get("section"),
    currentParams.get("tab"),
  );

  const desired = new URLSearchParams();
  for (const [key, value] of currentParams.entries()) {
    if (key === "section" || key === "tab") continue;
    desired.set(key, value);
  }
  if (resolved !== "data") desired.set("section", resolved);
  const desiredUrl = joinUrl(pathname, desired);

  const currentSection = currentParams.get("section");
  const currentTab = currentParams.get("tab");

  const sectionMatches =
    currentSection === null ? resolved === "data" : currentSection === resolved;
  const tabMatches = currentTab === null;

  if (!sectionMatches || !tabMatches) return desiredUrl;

  const currentOwned = new URLSearchParams();
  for (const [key, value] of currentParams.entries()) {
    if (key === "section" || key === "tab") continue;
    currentOwned.set(key, value);
  }
  if (currentSection !== null) currentOwned.set("section", currentSection);

  return currentOwned.toString() === desired.toString() ? null : desiredUrl;
}

/**
 * All recognized analysis tab values including aliases, for validation
 * paths (the route matrix uses this to reject canonical references to
 * `tab=ability` / `tab=recovery`).
 */
export const ANALYSIS_TAB_ALL_INPUTS: readonly string[] = [
  "overview",
  "load",
  "performance",
  "intensity",
  "ability",
  "recovery",
] as const;

export const CALENDAR_VIEW_ALL_INPUTS: readonly string[] = [
  "week",
  "month",
  "list",
  "strength",
] as const;

export const SETTINGS_SECTION_ALL_INPUTS: readonly string[] = [
  "data",
  "training",
  "account",
  "profile",
] as const;
