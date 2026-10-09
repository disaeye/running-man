/** Typed sport configuration registry — replaces scattered isRun/isRide + label maps. */
import { SPORT_ALIASES, SPORT_REGISTRY } from "@shared/config/generated/sport-registry";

export type StatField =
  | "distance"
  | "duration"
  | "avgHr"
  | "maxHr"
  | "pace"
  | "avgPower"
  | "np"
  | "tss"
  | "cadence"
  | "elevation";

export interface SportConfig {
  label: string;
  cadenceLabel: string;
  isRun: boolean;
  isRide: boolean;
  isWater: boolean;
  isIndoor: boolean;
  primaryMetric: "pace" | "power" | "speed";
  statsConfig: StatField[];
  zoneType: "hr" | "power" | "pace";
  color: string;
}

const STATS_RUN: StatField[] = [
  "distance", "duration", "avgHr", "maxHr", "pace", "tss", "cadence", "elevation",
];

const STATS_RIDE: StatField[] = [
  "distance", "duration", "avgHr", "maxHr", "pace", "avgPower", "np", "tss", "cadence", "elevation",
];

export const SPORT_CONFIG: Record<string, SportConfig> = {
  Run: {
    label: SPORT_REGISTRY.run.display_name,
    cadenceLabel: "平均步频",
    isRun: true,
    isRide: false,
    isWater: false,
    isIndoor: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RUN,
    color: "var(--color-sport-run)",
  },
  VirtualRun: {
    label: SPORT_REGISTRY.virtual_run.display_name,
    cadenceLabel: "平均步频",
    isRun: true,
    isRide: false,
    isWater: false,
    isIndoor: true,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RUN,
    color: "var(--color-sport-virtualrun)",
  },
  TrailRun: {
    label: SPORT_REGISTRY.trail_run.display_name,
    cadenceLabel: "平均步频",
    isRun: true,
    isRide: false,
    isWater: false,
    isIndoor: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RUN,
    color: "var(--color-sport-trailrun)",
  },
  Ride: {
    label: SPORT_REGISTRY.ride.display_name,
    cadenceLabel: "平均踏频",
    isRun: false,
    isRide: true,
    isWater: false,
    isIndoor: false,
    primaryMetric: "power",
    zoneType: "power",
    statsConfig: STATS_RIDE,
    color: "var(--color-sport-ride)",
  },
  VirtualRide: {
    label: SPORT_REGISTRY.virtual_ride.display_name,
    cadenceLabel: "平均踏频",
    isRun: false,
    isRide: true,
    isWater: false,
    isIndoor: true,
    primaryMetric: "power",
    zoneType: "power",
    statsConfig: STATS_RIDE,
    color: "var(--color-sport-virtualride)",
  },
  /** Alias used by backend generator_service.py for workout templates. */
  Bike: {
    label: SPORT_REGISTRY.ride.display_name,
    cadenceLabel: "平均踏频",
    isRun: false,
    isRide: true,
    isWater: false,
    isIndoor: false,
    primaryMetric: "power",
    zoneType: "power",
    statsConfig: STATS_RIDE,
    color: "var(--color-sport-bike)",
  },
  Swim: {
    label: SPORT_REGISTRY.swim.display_name,
    cadenceLabel: "平均划频",
    isRun: false,
    isRide: false,
    isWater: true,
    isIndoor: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "tss", "elevation",
    ],
    color: "var(--color-sport-swim)",
  },
  Walk: {
    label: SPORT_REGISTRY.walk.display_name,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "tss", "elevation",
    ],
    color: "var(--color-sport-walk)",
  },
  Hike: {
    label: SPORT_REGISTRY.hike.display_name,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "elevation", "tss",
    ],
    color: "var(--color-sport-hike)",
  },
  AlpineSki: {
    label: SPORT_REGISTRY.alpine_ski.display_name,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: false,
    primaryMetric: "speed",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "elevation", "tss",
    ],
    color: "var(--color-sport-alpineski)",
  },
  Workout: {
    label: SPORT_REGISTRY.workout.display_name,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: true,
    primaryMetric: "power",
    zoneType: "hr",
    statsConfig: [
      "duration", "avgHr", "maxHr", "tss", "elevation", "avgPower", "np",
    ],
    color: "var(--color-sport-workout)",
  },
  WeightTraining: {
    label: SPORT_REGISTRY.weight_training.display_name,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: true,
    primaryMetric: "power",
    zoneType: "hr",
    statsConfig: ["duration", "avgHr", "maxHr", "tss", "elevation"],
    color: "var(--color-sport-weighttraining)",
  },
};

const DEFAULT_CONFIG: SportConfig = {
  label: SPORT_REGISTRY.unknown.display_name,
  cadenceLabel: "平均步频",
  isRun: false,
  isRide: false,
  isWater: false,
  isIndoor: false,
  primaryMetric: "pace",
  zoneType: "hr",
  statsConfig: [
    "distance", "duration", "avgHr", "maxHr", "pace", "tss", "cadence", "elevation",
  ],
  color: "var(--color-text-muted)",
};

/** Look up config for a sport; falls back to generic defaults labelled 其他运动. */
const SPORT_CONFIG_BY_KEY: Record<string, SportConfig> = Object.fromEntries(
  Object.entries(SPORT_ALIASES).flatMap(([alias, key]) =>
    SPORT_CONFIG[alias] ? [[key, SPORT_CONFIG[alias]]] : [],
  ),
);

export function getSportConfig(sport: string): SportConfig {
  return SPORT_CONFIG[sport] ?? SPORT_CONFIG_BY_KEY[sport] ?? { ...DEFAULT_CONFIG };
}
