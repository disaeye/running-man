import type { ReactNode } from "react";
import { Bike, Dumbbell, Flame, Footprints } from "lucide-react";

import { getSportConfig } from "@shared/config/sport-config";

export function sportIconFor(sport: string): ReactNode {
  const config = getSportConfig(sport);
  if (config.isRun) return <Footprints className="size-3.5" aria-hidden="true" />;
  if (config.isRide) return <Bike className="size-3.5" aria-hidden="true" />;
  if (config.isStrength) return <Dumbbell className="size-3.5" aria-hidden="true" />;
  return <Flame className="size-3.5" aria-hidden="true" />;
}
