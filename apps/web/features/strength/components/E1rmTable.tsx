"use client";

import type { E1rmItem } from "@shared/types/strength";
import { Badge } from "@shared/ui/Badge";

interface E1rmTableProps {
  data: E1rmItem[];
}

export function E1rmTable({ data }: E1rmTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-subheadline text-text-muted">
        暂无 e1RM 数据
      </div>
    );
  }

  // Group by exercise_id, then pick the max per exercise
  const byExercise = groupByExercise(data);
  const sorted = [...byExercise].sort(
    (a, b) => b.maxEst - a.maxEst,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-subheadline">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <th className="py-2 pr-4 font-semibold text-text-muted">动作</th>
            <th className="py-2 pr-4 text-right font-semibold text-text-muted">
              最大 e1RM
            </th>
            <th className="py-2 font-semibold text-text-muted">达成日期</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.exerciseId}
              className="border-b border-border-subtle/60 last:border-0"
            >
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="py-2.5 pr-4 text-right">
                <Badge variant="info">
                  {row.maxEst.toFixed(1)} kg
                </Badge>
              </td>
              <td className="py-2.5 text-text-secondary">{row.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface GroupedRow {
  exerciseId: number;
  name: string;
  maxEst: number;
  date: string;
}

function groupByExercise(data: E1rmItem[]): GroupedRow[] {
  const map = new Map<number, GroupedRow>();
  for (const item of data) {
    const prev = map.get(item.exercise_id);
    if (!prev || item.estimated_1rm_kg > prev.maxEst) {
      map.set(item.exercise_id, {
        exerciseId: item.exercise_id,
        name: item.exercise_name,
        maxEst: item.estimated_1rm_kg,
        date: item.date,
      });
    }
  }
  return Array.from(map.values());
}
