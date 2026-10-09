"use client";

import type { ActivityWeather } from "@shared/types/activity";

interface ActivityWeatherCardProps {
  weather: ActivityWeather;
}

function fmt(value: number | null | undefined, unit: string, digits = 0): string {
  return value != null ? `${value.toFixed(digits)}${unit}` : "--";
}

/** 风向角度转十六方位缩写。 */
function windDirection(deg: number | null | undefined): string {
  if (deg == null) return "--";
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"] as const;
  const index = Math.round(((deg % 360) / 45)) % 8;
  return dirs[index] ?? "--";
}

/** 活动天气信息条：温度 / 体感 / 风 / 云量 / 降水。数据来自 Intervals.icu 活动天气。 */
export function ActivityWeatherCard({ weather }: ActivityWeatherCardProps) {
  return (
    <div
      className="rounded-2xl border border-border-subtle bg-surface-card p-4"
      data-testid="activity-weather-card"
    >
      <h3 className="text-caption1 font-semibold uppercase tracking-wider text-text-muted">
        活动天气
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <WeatherItem label="温度" value={fmt(weather.avg_temp, "°C", 1)} hint={rangeHint(weather.min_temp, weather.max_temp, "°C")} />
        <WeatherItem label="体感" value={fmt(weather.feels_like, "°C", 1)} />
        <WeatherItem
          label="风速"
          value={fmt(weather.wind_speed, " m/s", 1)}
          hint={`阵风 ${fmt(weather.wind_gust, " m/s", 1)} · ${windDirection(weather.wind_deg)}`}
        />
        <WeatherItem
          label="风阻占比"
          value={
            weather.headwind_pct != null
              ? `逆风 ${weather.headwind_pct.toFixed(0)}% / 顺风 ${(weather.tailwind_pct ?? 0).toFixed(0)}%`
              : "--"
          }
        />
        <WeatherItem label="云量" value={fmt(weather.clouds_pct, "%")} />
        <WeatherItem label="最大降雨" value={fmt(weather.max_rain, " mm", 1)} />
        <WeatherItem label="最大降雪" value={fmt(weather.max_snow, " cm", 1)} />
      </dl>
    </div>
  );
}

function rangeHint(min: number | null | undefined, max: number | null | undefined, unit: string): string {
  if (min == null || max == null) return "";
  return `${min.toFixed(0)}–${max.toFixed(0)}${unit}`;
}

function WeatherItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption2 text-text-secondary">{label}</dt>
      <dd className="font-mono text-callout font-semibold text-text-primary">{value}</dd>
      {hint && hint !== "" && <dd className="text-caption2 text-text-muted">{hint}</dd>}
    </div>
  );
}
