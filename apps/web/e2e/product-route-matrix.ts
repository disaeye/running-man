export const THEMES = ["light", "dark"] as const;
export const VIEWPORTS = ["mobile-375", "tablet-768", "desktop-1280"] as const;

export type ThemeName = (typeof THEMES)[number];
export type ViewportName = (typeof VIEWPORTS)[number];
export type RouteKind = "public" | "share" | "dashboard" | "activity-detail" | "settings" | "redirect-alias";

export const REQUIRED_PUBLIC_IDENTITIES = ["public-landing", "public-login", "public-register", "public-not-found"] as const;
export const REQUIRED_SHARE_IDENTITIES = ["share-ready", "share-expired", "share-not-found", "share-network-error"] as const;
export const REQUIRED_ACTIVITY_IDENTITIES = ["activity-valid", "activity-not-found", "activity-partial-streams"] as const;
export const REQUIRED_CALENDAR_IDENTITIES = ["calendar-week", "calendar-month", "calendar-list", "calendar-strength"] as const;
export const REQUIRED_ANALYSIS_IDENTITIES = ["analysis-overview", "analysis-load", "analysis-performance", "analysis-intensity"] as const;
export const REQUIRED_SETTINGS_IDENTITIES = ["settings-data", "settings-training", "settings-account"] as const;

export type RequiredIdentity =
  | (typeof REQUIRED_PUBLIC_IDENTITIES)[number]
  | (typeof REQUIRED_SHARE_IDENTITIES)[number]
  | (typeof REQUIRED_ACTIVITY_IDENTITIES)[number]
  | (typeof REQUIRED_CALENDAR_IDENTITIES)[number]
  | (typeof REQUIRED_ANALYSIS_IDENTITIES)[number]
  | (typeof REQUIRED_SETTINGS_IDENTITIES)[number]
  | "today-home"
  | "goals";
export type ProductRouteEntry = {
  readonly evidenceName: string;
  readonly routeKind: RouteKind;
  readonly canonicalIdentity: RequiredIdentity;
  readonly path: string;
  readonly requiredStates: readonly string[];
  readonly themes: readonly ThemeName[];
  readonly viewports: readonly ViewportName[];
  readonly todo15ServedBrowserOnly: boolean;
  readonly fixtureId?: string;
  readonly aliasOf?: RequiredIdentity;
  readonly redirectDestination?: string;
};

export type MatrixValidationResult = { readonly valid: boolean; readonly diagnostics: readonly string[] };

const ALL_SURFACES = { themes: THEMES, viewports: VIEWPORTS, todo15ServedBrowserOnly: true } as const;

const REQUIRED_IDENTITIES = [
  ...REQUIRED_PUBLIC_IDENTITIES,
  ...REQUIRED_SHARE_IDENTITIES,
  ...REQUIRED_ACTIVITY_IDENTITIES,
  ...REQUIRED_CALENDAR_IDENTITIES,
  ...REQUIRED_ANALYSIS_IDENTITIES,
  ...REQUIRED_SETTINGS_IDENTITIES,
  "today-home",
  "goals",
] as const satisfies readonly RequiredIdentity[];

const PUBLIC_ROUTES = [
  route("public-landing", "public", "public-landing", "/landing", ["marketing-ready"]),
  route("public-login", "public", "public-login", "/login", ["form-ready", "validation-error", "auth-error"]),
  route("public-register", "public", "public-register", "/register", ["form-ready", "validation-error", "submit-error"]),
  route("public-not-found", "public", "public-not-found", "/_not-found", ["not-found-recovery"]),
] as const;

const SHARE_ROUTES = [
  fixtureRoute("share-ready", "share", "/share/share-ready", ["ready"]),
  fixtureRoute("share-expired", "share", "/share/share-expired", ["expired"]),
  fixtureRoute("share-not-found", "share", "/share/share-not-found", ["not-found"]),
  fixtureRoute("share-network-error", "share", "/share/share-network-error", ["network-error"]),
] as const;

const DASHBOARD_ROUTES = [
  route("dashboard-today", "dashboard", "today-home", "/", ["ready", "empty", "error"]),
  route("calendar-week", "dashboard", "calendar-week", "/calendar?view=week", ["week", "empty", "error"]),
  route("calendar-month", "dashboard", "calendar-month", "/calendar?view=month", ["month", "empty", "error"]),
  route("calendar-list", "dashboard", "calendar-list", "/calendar?view=list", ["list", "empty", "error"]),
  route("calendar-strength", "dashboard", "calendar-strength", "/calendar?view=strength", ["strength", "empty", "error"]),
  route("analysis-overview", "dashboard", "analysis-overview", "/analysis", ["overview", "sparse", "error"]),
  route("analysis-load", "dashboard", "analysis-load", "/analysis?tab=load", ["load", "sparse", "error"]),
  route("analysis-performance", "dashboard", "analysis-performance", "/analysis?tab=performance", ["performance", "sparse", "error"]),
  route("analysis-intensity", "dashboard", "analysis-intensity", "/analysis?tab=intensity", ["intensity", "sparse", "error"]),
  route("dashboard-goals", "dashboard", "goals", "/goals", ["ready", "empty", "error", "edit"]),
] as const;

const ACTIVITY_ROUTES = [
  fixtureRoute("activity-valid", "activity-detail", "/activities/activity-valid", ["valid"]),
  fixtureRoute("activity-not-found", "activity-detail", "/activities/activity-not-found", ["not-found"]),
  fixtureRoute("activity-partial-streams", "activity-detail", "/activities/activity-partial-streams", ["partial-streams"]),
] as const;

const SETTINGS_ROUTES = [
  route("settings-data", "settings", "settings-data", "/settings?section=data", ["data", "ready", "error"]),
  route("settings-training", "settings", "settings-training", "/settings?section=training", ["training", "ready", "error"]),
  route("settings-account", "settings", "settings-account", "/settings?section=account", ["account", "ready", "error"]),
] as const;

const REDIRECT_ALIASES = [
  alias("alias-activities", "/activities", "calendar-list", "/calendar?view=list"),
  alias("alias-plan", "/plan", "calendar-week", "/calendar"),
  alias("alias-calendar-full", "/calendar/full", "calendar-week", "/calendar"),
  alias("alias-health", "/health", "analysis-load", "/analysis?tab=load"),
  alias("alias-trends", "/trends", "analysis-load", "/analysis?tab=load"),
  alias("alias-data", "/data", "settings-data", "/settings?section=data"),
  alias("alias-export", "/export", "settings-data", "/settings?section=data"),
  alias("alias-strength", "/strength", "calendar-strength", "/calendar?view=strength"),
  alias("alias-strength-analytics", "/strength/analytics", "calendar-strength", "/calendar?view=strength"),
  alias("alias-performance", "/performance", "analysis-performance", "/analysis?tab=performance"),
  alias("alias-gear", "/gear", "settings-account", "/settings"),
  alias("alias-library", "/library", "settings-account", "/settings"),
] as const;

export const PRODUCT_ROUTE_MATRIX = [
  ...PUBLIC_ROUTES,
  ...SHARE_ROUTES,
  ...DASHBOARD_ROUTES,
  ...ACTIVITY_ROUTES,
  ...SETTINGS_ROUTES,
  ...REDIRECT_ALIASES,
] as const satisfies readonly ProductRouteEntry[];

export const REDIRECT_ALIAS_SOURCES = REDIRECT_ALIASES.map((routeEntry) => routeEntry.path);

export function validateProductRouteMatrix(routes: readonly ProductRouteEntry[]): MatrixValidationResult {
  const diagnostics = [
    ...findDuplicateValues(routes.map((routeEntry) => routeEntry.evidenceName)).map((value) => `duplicate evidenceName: ${value}`),
    ...findDuplicateCanonicalIdentities(routes),
    ...findMissingRequiredIdentities(routes),
    ...findLiveDataDependentLabels(routes),
  ];
  return { valid: diagnostics.length === 0, diagnostics };
}

function route(
  evidenceName: string,
  routeKind: RouteKind,
  canonicalIdentity: RequiredIdentity,
  path: string,
  requiredStates: readonly string[],
): ProductRouteEntry {
  return { evidenceName, routeKind, canonicalIdentity, path, requiredStates, ...ALL_SURFACES };
}

function fixtureRoute(
  fixtureId: (typeof REQUIRED_SHARE_IDENTITIES)[number] | (typeof REQUIRED_ACTIVITY_IDENTITIES)[number],
  routeKind: "share" | "activity-detail",
  path: string,
  requiredStates: readonly string[],
): ProductRouteEntry {
  return { ...route(fixtureId, routeKind, fixtureId, path, requiredStates), fixtureId };
}

function alias(
  evidenceName: string,
  path: string,
  aliasOf: RequiredIdentity,
  redirectDestination: string,
): ProductRouteEntry {
  return { ...route(evidenceName, "redirect-alias", aliasOf, path, ["redirect-normalization"]), aliasOf, redirectDestination };
}

function findDuplicateValues(values: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

function findDuplicateCanonicalIdentities(routes: readonly ProductRouteEntry[]): readonly string[] {
  return findDuplicateValues(routes.filter((routeEntry) => routeEntry.aliasOf === undefined).map((routeEntry) => routeEntry.canonicalIdentity)).map(
    (value) => `duplicate canonicalIdentity without aliasOf: ${value}`,
  );
}

function findMissingRequiredIdentities(routes: readonly ProductRouteEntry[]): readonly string[] {
  const actual = new Set(routes.map((routeEntry) => routeEntry.canonicalIdentity));
  return REQUIRED_IDENTITIES.filter((identity) => !actual.has(identity)).map((identity) => `missing required identity: ${identity}`);
}

function findLiveDataDependentLabels(routes: readonly ProductRouteEntry[]): readonly string[] {
  return routes
    .flatMap((routeEntry) => [routeEntry.evidenceName, routeEntry.canonicalIdentity, routeEntry.path])
    .filter((label) => /latest|live|discover-if-present/u.test(label))
    .map((label) => `live-data dependent label: ${label}`);
}
