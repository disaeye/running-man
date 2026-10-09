"use client";
import { useState } from "react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import { Input } from "@shared/ui/input";
import { apiFetch } from "@shared/lib/api";

interface RaceCrossCheck {
  method: "critical_speed";
  time_s: number;
  pace_s_per_km: number;
  delta_pct: number;
}

interface RacePredictionPoint {
  label: "5K" | "10K" | "half_marathon" | "marathon";
  distance_m: number;
  time_s: number;
  pace_s_per_km: number;
  method?: "riegel" | null;
  cross_check?: RaceCrossCheck | null;
}

interface RaceBasis {
  method: "riegel";
  recent_time_s: number;
  recent_distance_m: number;
  exponent: number;
  source: "personal_record" | "manual";
}

interface Prediction {
  predictions: RacePredictionPoint[];
  basis?: RaceBasis | string | null;
  confidence: "high" | "medium" | "low" | "" | null;
  data_sufficient: boolean;
}

const STATIC_BASIS_NOTE = "预测基于近期训练表现推算 VDOT，再换算各距离比赛配速；实际成绩会受路线、天气和补给影响。";
const FALLBACK_CONFIDENCE = "低";

const DISTANCE_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half_marathon: "半马",
  marathon: "全马",
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatPace(paceSecPerKm: number): string {
  const mins = Math.floor(paceSecPerKm / 60);
  const secs = Math.round(paceSecPerKm % 60);
  return `${mins}'${String(secs).padStart(2, "0")}"`;
}

export function RacePredictor() {
  const [data, setData] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeMin, setTimeMin] = useState("");
  const [distKm, setDistKm] = useState("");

  const handleAuto = async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Prediction>("/race/predict"));
    } finally {
      setLoading(false);
    }
  };

  const handleManual = async () => {
    if (!timeMin || !distKm) return;
    setLoading(true);
    try {
      setData(
        await apiFetch<Prediction>("/race/predict", {
          method: "POST",
          body: JSON.stringify({
            recent_time_s: Number(timeMin) * 60,
            recent_distance_m: Number(distKm) * 1000,
          }),
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const basisText = typeof data?.basis === "string" ? data.basis : null;

  return (
    <Card padding="md" className="border-border-default">
      <h2 className="mb-4 text-headline font-semibold text-text-primary">比赛预测</h2>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={handleAuto} disabled={loading}>
          {loading ? "计算中…" : "自动预测"}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 border-t border-border-subtle pt-4">
        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">成绩(分钟)</span>
          <Input
            id="race-time"
            type="number"
            value={timeMin}
            onChange={(e) => setTimeMin(e.target.value)}
            placeholder="25"
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">距离(km)</span>
          <Input
            id="race-dist"
            type="number"
            value={distKm}
            onChange={(e) => setDistKm(e.target.value)}
            placeholder="5"
            className="w-24"
          />
        </label>
        <Button
          variant="secondary"
          onClick={handleManual}
          disabled={loading || !timeMin || !distKm}
        >
          手动预测
        </Button>
      </div>

      {data && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            {data.data_sufficient ? (
              <Badge variant="success">数据充足</Badge>
            ) : (
              <Badge variant="warning">数据不足</Badge>
            )}
            <span className="text-caption1 text-text-muted">
              置信度: {data.confidence || FALLBACK_CONFIDENCE}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.predictions.map((p) => (
              <div
                key={p.label}
                data-testid={`race-pred-${p.label}`}
                className="rounded-xl border border-border-subtle bg-surface-card p-3"
              >
                <p className="text-caption1 font-medium text-text-secondary">
                  {DISTANCE_LABELS[p.label]}
                </p>
                <p className="mt-1 font-mono text-title2 font-semibold tabular-nums text-text-primary">
                  {formatTime(p.time_s)}
                </p>
                <p className="text-caption1 text-text-muted">{formatPace(p.pace_s_per_km)}/km</p>
                {p.cross_check && (
                  <div className="mt-2 flex items-center gap-1 border-t border-border-subtle pt-2">
                    <Badge variant="info" className="text-caption2">
                      CS
                    </Badge>
                    <span className="text-caption2 text-text-muted">
                      Δ{p.cross_check.delta_pct > 0 ? "+" : ""}
                      {p.cross_check.delta_pct.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-caption1 leading-relaxed text-text-secondary">
            {basisText?.trim() || STATIC_BASIS_NOTE}
          </p>
        </div>
      )}
    </Card>
  );
}
