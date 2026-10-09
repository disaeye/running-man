/** Types mirroring the Python API shoe/gear schemas. */

export interface Shoe {
  shoe_id: string;
  athlete_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  current_mileage_m: number;
  retired_at: string | null;
  retirement_alert: boolean;
  created_at: string;
  updated_at: string;
}

/** Tracks which shoe was used for which activity. */
export interface ShoeAssignment {
  assignment_id: string;
  activity_id: string;
  shoe_id: string;
  distance_m: number;
  created_at: string;
}

/** Shoe with aggregated stats from its assignments. */
export interface ShoeWithStats extends Shoe {
  total_activities: number;
  total_distance_m: number;
  last_used_at: string | null;
}
