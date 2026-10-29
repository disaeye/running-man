import type { DistributionItem, MuscleVolumeItem } from "@shared/types/strength";

type MuscleVolumeRow = { readonly muscle_group: string; readonly volume_kg: number };
type DistributionRow = { readonly category: string; readonly set_count: number; readonly volume_kg: number };

export function toMuscleVolumeAndDistribution(
  volumeRows: readonly MuscleVolumeRow[],
  distributionRows: readonly DistributionRow[],
): { readonly muscleVolume: MuscleVolumeItem[]; readonly distribution: DistributionItem[] } {
  const totalVolume = distributionRows.reduce((total, row) => total + row.volume_kg, 0);
  return {
    muscleVolume: volumeRows.map((row) => ({ muscle: row.muscle_group, volume_kg: row.volume_kg })),
    distribution: distributionRows.map((row) => ({
      category: row.category,
      set_count: row.set_count,
      percentage: totalVolume > 0 ? (row.volume_kg / totalVolume) * 100 : 0,
      volume_kg: row.volume_kg,
    })),
  };
}
