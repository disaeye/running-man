/** Typed sport configuration registry — replaces scattered isRun/isRide + label maps. */
import { SPORT_ALIASES, SPORT_REGISTRY } from "@shared/config/generated/sport-registry";

export type StatField =
  | "distance"
  | "duration"
  | "avgHr"
  | "maxHr"
  | "pace"
  | "cadence"
  | "elevation";

/**
 * Sport family, straight from `contracts/v1/sports.yaml`.
 *
 * Grouping features (the calendar's project chips, the analysis sport family)
 * ask this instead of comparing sport keys, so adding a sport to the contract
 * puts it in the right bucket without touching component code.
 */
export type SportFamily =
  | "running"
  | "cycling"
  | "swimming"
  | "walking"
  | "hiking"
  | "skiing"
  | "strength"
  | "unknown";

export interface SportConfig {
  label: string;
  family: SportFamily;
  cadenceLabel: string;
  isRun: boolean;
  isRide: boolean;
  isWater: boolean;
  isIndoor: boolean;
  isStrength: boolean;
  primaryMetric: "pace" | "speed";
  statsConfig: StatField[];
  zoneType: "hr" | "pace";
  color: string;
}

const STATS_RUN: StatField[] = [
  "distance", "duration", "avgHr", "maxHr", "pace", "cadence", "elevation",
];

const STATS_RIDE: StatField[] = [];

export const SPORT_CONFIG: Record<string, SportConfig> = {
  Run: {
    label: SPORT_REGISTRY.run.display_name,
    family: SPORT_REGISTRY.run.family,
    cadenceLabel: "平均步频",
    isRun: true,
    isRide: false,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RUN,
    color: "var(--color-sport-run)",
  },
  VirtualRun: {
    label: SPORT_REGISTRY.virtual_run.display_name,
    family: SPORT_REGISTRY.virtual_run.family,
    cadenceLabel: "平均步频",
    isRun: true,
    isRide: false,
    isWater: false,
    isIndoor: true,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RUN,
    color: "var(--color-sport-virtualrun)",
  },
  TrailRun: {
    label: SPORT_REGISTRY.trail_run.display_name,
    family: SPORT_REGISTRY.trail_run.family,
    cadenceLabel: "平均步频",
    isRun: true,
    isRide: false,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RUN,
    color: "var(--color-sport-trailrun)",
  },
  Ride: {
    label: SPORT_REGISTRY.ride.display_name,
    family: SPORT_REGISTRY.ride.family,
    cadenceLabel: "平均踏频",
    isRun: false,
    isRide: true,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RIDE,
    color: "var(--color-sport-ride)",
  },
  VirtualRide: {
    label: SPORT_REGISTRY.virtual_ride.display_name,
    family: SPORT_REGISTRY.virtual_ride.family,
    cadenceLabel: "平均踏频",
    isRun: false,
    isRide: true,
    isWater: false,
    isIndoor: true,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RIDE,
    color: "var(--color-sport-virtualride)",
  },
  /** Alias used by backend generator_service.py for workout templates. */
  Bike: {
    label: SPORT_REGISTRY.ride.display_name,
    family: SPORT_REGISTRY.ride.family,
    cadenceLabel: "平均踏频",
    isRun: false,
    isRide: true,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: STATS_RIDE,
    color: "var(--color-sport-bike)",
  },
  Swim: {
    label: SPORT_REGISTRY.swim.display_name,
    family: SPORT_REGISTRY.swim.family,
    cadenceLabel: "平均划频",
    isRun: false,
    isRide: false,
    isWater: true,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "elevation",
    ],
    color: "var(--color-sport-swim)",
  },
  Walk: {
    label: SPORT_REGISTRY.walk.display_name,
    family: SPORT_REGISTRY.walk.family,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "elevation",
    ],
    color: "var(--color-sport-walk)",
  },
  Hike: {
    label: SPORT_REGISTRY.hike.display_name,
    family: SPORT_REGISTRY.hike.family,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "elevation",
    ],
    color: "var(--color-sport-hike)",
  },
  AlpineSki: {
    label: SPORT_REGISTRY.alpine_ski.display_name,
    family: SPORT_REGISTRY.alpine_ski.family,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: false,
    isStrength: false,
    primaryMetric: "speed",
    zoneType: "hr",
    statsConfig: [
      "distance", "duration", "avgHr", "maxHr", "pace", "elevation",
    ],
    color: "var(--color-sport-alpineski)",
  },
  Workout: {
    label: SPORT_REGISTRY.workout.display_name,
    family: SPORT_REGISTRY.workout.family,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: true,
    isStrength: true,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: ["duration", "avgHr", "maxHr", "elevation"],
    color: "var(--color-sport-workout)",
  },
  WeightTraining: {
    label: SPORT_REGISTRY.weight_training.display_name,
    family: SPORT_REGISTRY.weight_training.family,
    cadenceLabel: "平均步频",
    isRun: false,
    isRide: false,
    isWater: false,
    isIndoor: true,
    isStrength: true,
    primaryMetric: "pace",
    zoneType: "hr",
    statsConfig: ["duration", "avgHr", "maxHr", "elevation"],
    color: "var(--color-sport-weighttraining)",
  },
};

const DEFAULT_CONFIG: SportConfig = {
  label: SPORT_REGISTRY.unknown.display_name,
  family: SPORT_REGISTRY.unknown.family,
  cadenceLabel: "平均步频",
  isRun: false,
  isRide: false,
  isWater: false,
  isIndoor: false,
  isStrength: false,
  primaryMetric: "pace",
  zoneType: "hr",
  statsConfig: [
    "distance", "duration", "avgHr", "maxHr", "pace", "cadence", "elevation",
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

/**
 * 产品范围单一真源：跑步训练平台只呈现跑步与力量家族；同步仍全量拉取
 * （负荷计算与健康度核对需要完整数据），范围限定只发生在呈现层。
 */
export function isProductSport(sport: string): boolean {
  const { family } = getSportConfig(sport);
  return family === "running" || family === "strength";
}

/**
 * 产品范围完整分类列表，注册表顺序。类型筛选列出全部分类，
 * 与当前查询窗口有无该类记录无关——选到无记录的类型时由空态如实说明。
 */
export const PRODUCT_SPORTS: readonly { key: string; label: string }[] = Object.keys(SPORT_REGISTRY)
  .filter(isProductSport)
  .map((key) => ({ key, label: getSportConfig(key).label }));

/**
 * A label for a sport family, taken from the first sport in that family.
 *
 * Used by filters that group several sports (跑步 covers Run / VirtualRun /
 * TrailRun), so the chip reads the registry's wording rather than a hand-written
 * abbreviation.
 */
export function sportFamilyLabel(family: SportFamily): string {
  if (family === "unknown") return DEFAULT_CONFIG.label;
  const match = Object.values(SPORT_CONFIG).find((config) => config.family === family);
  return match?.label ?? DEFAULT_CONFIG.label;
}
