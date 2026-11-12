/**
 * 时区偏移标签，例如 "UTC+8"、"UTC-5"、"UTC+0"。
 *
 * 偏移按目标时区计算，不依赖运行环境的本地时区。
 */
export function timezoneOffsetLabel(timezone: string | null | undefined): string {
  const zone = timezone?.trim() || "UTC";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    });
    const part = formatter.formatToParts(new Date()).find((item) => item.type === "timeZoneName");
    const raw = part?.value ?? "GMT";
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
    if (!match) return "UTC+0";
    const sign = match[1];
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? 0);
    const total = hours * 60 + minutes;
    const magnitude = total === 0 ? "0" : `${Math.floor(total / 60)}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
    return `UTC${sign}${magnitude}`;
  } catch {
    return "UTC+0";
  }
}
