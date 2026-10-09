/** Manual split computation: distance, time, or custom interval. */

import type { StreamMap } from "@shared/types/activity";

export type SplitMode = "distance" | "time" | "custom";

export interface SplitRow {
  /** Segment label, e.g. "km 1" or "min 5–10". */
  label: string;
  /** Distance in meters. */
  distanceM: number;
  /** Duration in seconds. */
  durationS: number;
  /** Average speed in m/s (null if no points). */
  avgSpeed: number | null;
  /** Average heart rate in bpm (null if no points). */
  avgHr: number | null;
  /** Average cadence in spm (null if no points). */
  avgCadence: number | null;
}

interface TsHr {
  t: number;
  speed: number | null;
  hr: number | null;
  cadence: number | null;
  distanceM: number;
}

/** Build a per-second timeline from streams (distance integrated from speed). */
export function buildTimeline(streams: StreamMap): TsHr[] {
  const speed = streams["speed"] ?? [];
  const hr = streams["heart_rate"] ?? [];
  const cad = streams["cadence"] ?? [];

  // Use speed timestamps as the master clock.
  const out: TsHr[] = [];
  let cumDist = 0;

  let hrIdx = 0;
  let cadIdx = 0;

  for (let i = 0; i < speed.length; i++) {
    const pt = speed[i];
    const prev = i === 0 ? pt : speed[i - 1];
    if (!pt || !prev) continue;

    const t = new Date(pt.sample_time).getTime() / 1000;
    const t0 = new Date(prev.sample_time).getTime() / 1000;
    const dt = Math.max(0, t - t0);
    cumDist += pt.value * dt;

    // Find nearest HR reading.
    while (hrIdx < hr.length - 1) {
      const h = hr[hrIdx + 1];
      const cur = hr[hrIdx];
      if (!h || !cur) break;
      const ht = new Date(h.sample_time).getTime() / 1000;
      if (Math.abs(ht - t) < Math.abs(new Date(cur.sample_time).getTime() / 1000 - t)) hrIdx++; else break;
    }
    const hrPt = hr[hrIdx];
    const hrT = hrPt ? new Date(hrPt.sample_time).getTime() / 1000 : null;
    const hrVal = hrPt && hrT != null && Math.abs(hrT - t) < 10 ? hrPt.value : null;

    while (cadIdx < cad.length - 1) {
      const c = cad[cadIdx + 1];
      const cur = cad[cadIdx];
      if (!c || !cur) break;
      const ct = new Date(c.sample_time).getTime() / 1000;
      if (Math.abs(ct - t) < Math.abs(new Date(cur.sample_time).getTime() / 1000 - t)) cadIdx++; else break;
    }
    const cadPt = cad[cadIdx];
    const cadT = cadPt ? new Date(cadPt.sample_time).getTime() / 1000 : null;
    const cadVal = cadPt && cadT != null && Math.abs(cadT - t) < 10 ? cadPt.value : null;

    out.push({ t, speed: pt.value, hr: hrVal, cadence: cadVal, distanceM: cumDist });
  }
  return out;
}

function rowFromRange(
  pts: TsHr[],
  label: string,
): SplitRow | null {
  if (pts.length < 1) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return null;

  const dM = last.distanceM - first.distanceM;
  const dur = last.t - first.t;

  const speeds = pts.map((p) => p.speed).filter((v): v is number => v != null);
  const hrs = pts.map((p) => p.hr).filter((v): v is number => v != null);
  const cds = pts.map((p) => p.cadence).filter((v): v is number => v != null);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    label,
    distanceM: Math.max(0, dM),
    durationS: Math.max(0, dur),
    avgSpeed: speeds.length ? mean(speeds) : null,
    avgHr: hrs.length ? mean(hrs) : null,
    avgCadence: cds.length ? mean(cds) : null,
  };
}

/** Split by distance: each row covers `strideM` meters (e.g. 1000 for km). */
export function splitByDistance(
  timeline: TsHr[],
  strideM: number,
): SplitRow[] {
  if (timeline.length === 0) return [];
  const first = timeline[0];
  if (!first) return [];
  const startDist = first.distanceM;
  const rows: SplitRow[] = [];
  let bucketStart = 0;
  let nth = 1;

  for (let i = 1; i < timeline.length; i++) {
    const cur = timeline[i];
    if (!cur) continue;
    const d = cur.distanceM - startDist;
    if (d >= nth * strideM) {
      const label = strideM >= 1000 ? `km ${nth}` : `${nth * (strideM)}m`;
      const row = rowFromRange(timeline.slice(bucketStart, i), label);
      if (row) rows.push(row);
      bucketStart = i;
      nth++;
    }
  }
  // trailing bucket
  const label = strideM >= 1000 ? `km ${nth}` : `${nth * strideM}m`;
  const row = rowFromRange(timeline.slice(bucketStart), label);
  if (row) rows.push(row);

  return rows;
}

/** Split by time: each row covers `strideS` seconds (e.g. 300 for 5 min). */
export function splitByTime(
  timeline: TsHr[],
  strideS: number,
): SplitRow[] {
  if (timeline.length === 0) return [];
  const first = timeline[0];
  if (!first) return [];
  const t0 = first.t;
  const rows: SplitRow[] = [];
  let bucketStart = 0;
  let nth = 1;

  for (let i = 1; i < timeline.length; i++) {
    const cur = timeline[i];
    if (!cur) continue;
    const t = cur.t - t0;
    if (t >= nth * strideS) {
      const minA = Math.floor((strideS * (nth - 1)) / 60);
      const minB = Math.floor((strideS * nth) / 60);
      const label = `min ${minA}–${minB}`;
      const row = rowFromRange(timeline.slice(bucketStart, i), label);
      if (row) rows.push(row);
      bucketStart = i;
      nth++;
    }
  }
  const minA = Math.floor((strideS * (nth - 1)) / 60);
  const label = `min ${minA}+`;
  const row = rowFromRange(timeline.slice(bucketStart), label);
  if (row) rows.push(row);

  return rows;
}

/** Split by custom interval in seconds. */
export function splitCustom(
  timeline: TsHr[],
  strideS: number,
): SplitRow[] {
  if (timeline.length === 0 || strideS <= 0) return [];
  return splitByTime(timeline, strideS).map((r, i) => ({
    ...r,
    label: `段 ${i + 1}`,
  }));
}
