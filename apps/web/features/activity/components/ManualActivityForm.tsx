"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { useAthleteTimezone } from "@shared/lib/training-day";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { getSportConfig } from "@shared/config/sport-config";
import { useProfile } from "@features/settings/hooks/useProfile";
import { SPORT_ALIASES } from "@shared/config/generated/sport-registry";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { useSWRConfig } from "swr";
import { useToast } from "@shared/ui/Toast";
import type { ActivitySummary } from "@shared/types/activity";

type ManualActivityFormProps = {
  onSaved: (activity: ActivitySummary) => void;
  initialDate?: string;
  eventId?: string;
};

type ManualActivityResponse = {
  activity_id: string;
  start_time: string;
  sport: string;
  distance_m: number | null;
  duration_s: number;
  avg_hr: number | null;
  max_hr: number | null;
  source: string;
  tss: number | null;
  event_id: string | null;
  recompute_status: "queued";
  recompute_generation: number;
};

const SPORTS = ["Run", "VirtualRun", "TrailRun", "Ride", "VirtualRide", "Workout", "Swim"];
const LOCAL_TIME_GAP_ERROR = "所选时间不存在于运动员时区，请选择其他时间。";

function localDateTimeValue(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function localTimeToIso(value: string, timezone: string): string {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) throw new Error("训练开始时间无效");
  const dateParts = datePart.split("-").map(Number);
  const timeParts = timePart.split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length !== 2 || [...dateParts, ...timeParts].some(Number.isNaN)) {
    throw new Error("训练开始时间无效");
  }
  const [year, month, day] = dateParts as [number, number, number];
  const [hour, minute] = timeParts as [number, number];
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = localAsUtc;
  let converged = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const actual = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const actualYear = actual.year;
    const actualMonth = actual.month;
    const actualDay = actual.day;
    const actualHour = actual.hour;
    const actualMinute = actual.minute;
    if (
      actualYear === undefined || actualMonth === undefined || actualDay === undefined
      || actualHour === undefined || actualMinute === undefined
    ) {
      throw new Error("训练开始时间无效");
    }
    const actualAsUtc = Date.UTC(
      actualYear,
      actualMonth - 1,
      actualDay,
      actualHour,
      actualMinute,
    );
    const adjustment = localAsUtc - actualAsUtc;
    instant += adjustment;
    if (adjustment === 0) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new Error(LOCAL_TIME_GAP_ERROR);
  return new Date(instant).toISOString();
}

export function ManualActivityForm({ onSaved, initialDate, eventId }: ManualActivityFormProps) {
  const timezone = useAthleteTimezone();
  const { mutate } = useSWRConfig();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [sport, setSport] = useState("Run");
  const [startTime, setStartTime] = useState(() =>
    initialDate ? `${initialDate}T06:00` : localDateTimeValue(timezone),
  );
  const [distanceKm, setDistanceKm] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [rpe, setRpe] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (form: React.FormEvent<HTMLFormElement>) => {
    form.preventDefault();
    const durationS = Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
    if (!startTime || durationS < 1) {
      setError("请选择训练时间并填写有效时长。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (maxHr && avgHr && Number(maxHr) < Number(avgHr)) {
        throw new Error("最高心率应大于或等于平均心率。");
      }
      if (profile?.max_session_duration_min && durationS > profile.max_session_duration_min * 60) {
        throw new Error("填写的训练时长超过单次训练设置上限。");
      }
      const saved = await apiFetch<ManualActivityResponse>("/activities/manual", {
        method: "POST",
        body: JSON.stringify({
          start_time: localTimeToIso(startTime, timezone),
          sport: SPORT_ALIASES[sport],
          distance_m: distanceKm ? Number(distanceKm) * 1000 : null,
          duration_s: durationS,
          avg_hr: avgHr ? Number(avgHr) : null,
          max_hr: maxHr ? Number(maxHr) : null,
          rpe: rpe ? Number(rpe) : null,
          name: name.trim() || null,
          event_id: eventId ?? null,
        }),
      });
      onSaved({
        activity_id: saved.activity_id,
        start_time: saved.start_time,
        sport: saved.sport,
        distance_m: saved.distance_m,
        duration_s: saved.duration_s,
        avg_hr: saved.avg_hr,
        max_hr: saved.max_hr,
        avg_power: null,
        np: null,
        intensity_factor: null,
        tss: saved.tss,
        icu_ctl: null,
        avg_cadence: null,
        avg_speed: null,
        elevation_gain_m: null,
        calories: null,
        external_id: null,
        source: saved.source,
        file_type: "manual",
        device_name: "手动记录",
        summary_polyline: null,
        has_gps: false,
      });
      await invalidateDataCards(mutate);
      toast("实际训练已保存", "success");
      await mutate((key) => Array.isArray(key) && key[0] === "/activities", undefined, { revalidate: true });
      setDistanceKm("");
      setHours("");
      setMinutes("");
      setSeconds("");
      setAvgHr("");
      setMaxHr("");
      setRpe("");
      setName("");
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="手动记录训练">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          运动项目
          <select value={sport} onChange={(event) => setSport(event.target.value)} className="min-h-11 rounded-lg border border-border-default bg-surface-card px-3 text-subheadline text-text-primary">
            {SPORTS.map((value) => <option key={value} value={value}>{getSportConfig(value).label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          开始时间（{timezone}）
          <Input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
        名称
        <Input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} placeholder="例如：晨跑" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          距离（公里，可留空）
          <Input type="number" min="0.001" max="1000" step="0.001" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-caption1 text-text-secondary">实际时长</legend>
          <div className="grid grid-cols-3 gap-2">
            <Input aria-label="小时" type="number" min="0" max="48" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="时" />
            <Input aria-label="分钟" type="number" min="0" max="59" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="分" />
            <Input aria-label="秒" type="number" min="0" max="59" value={seconds} onChange={(event) => setSeconds(event.target.value)} placeholder="秒" />
          </div>
        </fieldset>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">平均心率<Input type="number" min="25" max="260" value={avgHr} onChange={(event) => setAvgHr(event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">最高心率<Input type="number" min="25" max="260" value={maxHr} onChange={(event) => setMaxHr(event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">主观用力 RPE<Input type="number" min="1" max="10" value={rpe} onChange={(event) => setRpe(event.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-caption1 text-error">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? "正在保存…" : "保存实际训练"}</Button>
    </form>
  );
}
