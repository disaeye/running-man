/**
 * Curated IANA timezone options for the profile form. Not exhaustive — the
 * backend stores a free-form IANA name, so values outside this list are
 * preserved by appending them at runtime (see SettingsProfile).
 */
export const TIMEZONE_OPTIONS: readonly string[] = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
] as const;

/** Options for the profile timezone select, always including the saved value. */
export function timezoneOptions(current: string | null): readonly string[] {
  const saved = current?.trim();
  if (!saved || TIMEZONE_OPTIONS.includes(saved)) return TIMEZONE_OPTIONS;
  return [...TIMEZONE_OPTIONS, saved];
}
