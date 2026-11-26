import type { Zone } from "@features/settings/hooks/useZoneOverrides";

/**
 * 心率区间的中文名称与配色。
 *
 * 后端返回的区间名固定为 "Z1" 这类占位名，页面上需要能读懂用途，所以名称在
 * 前端按区间序号映射；配色沿用设计系统的五个区间色。
 */
export const HEART_RATE_ZONE_DETAILS = [
  { name: "Z1 恢复区", color: "bg-zone-1" },
  { name: "Z2 有氧区", color: "bg-zone-2" },
  { name: "Z3 节奏区", color: "bg-zone-3" },
  { name: "Z4 阈值区", color: "bg-zone-4" },
  { name: "Z5 极限区", color: "bg-zone-5" },
] as const;

export interface HeartRateZoneRow {
  readonly zone: number;
  readonly name: string;
  readonly color: string;
  readonly range: string;
}

function zoneRange(zone: Zone): string {
  const upper = zone.max_value == null ? "∞" : `${zone.max_value}`;
  return `${zone.min_value}–${upper} bpm`;
}

/** 区间列表，附中文名称与配色。 */
export function buildHeartRateZones(zones: readonly Zone[] | null | undefined): readonly HeartRateZoneRow[] {
  if (!zones) return [];
  return zones.map((zone) => {
    const detail = HEART_RATE_ZONE_DETAILS[zone.zone - 1];
    return {
      zone: zone.zone,
      name: detail?.name ?? `Z${zone.zone}`,
      color: detail?.color ?? "bg-zone-1",
      range: zoneRange(zone),
    };
  });
}
