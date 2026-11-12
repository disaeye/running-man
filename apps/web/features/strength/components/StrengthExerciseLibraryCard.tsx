"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import type { Exercise } from "@features/strength/hooks/useExercises";

const COMMON_EXERCISE_NAMES = [
  "深蹲",
  "硬拉",
  "卧推",
  "引体向上",
  "推举",
  "杠铃划船",
  "保加利亚分腿蹲",
  "臀桥",
];

interface StrengthExerciseLibraryCardProps {
  exercises: readonly Exercise[];
  loading?: boolean;
  onSelectExercise: (exercise: Exercise) => void;
}

export function StrengthExerciseLibraryCard({
  exercises,
  loading = false,
  onSelectExercise,
}: StrengthExerciseLibraryCardProps) {
  const [query, setQuery] = useState("");

  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      const matched = exercises.filter((item) =>
        COMMON_EXERCISE_NAMES.some((name) => item.name_cn.includes(name)),
      );
      return matched.slice(0, 8);
    }
    return exercises
      .filter((item) =>
        `${item.name_cn} ${item.name_en} ${item.category} ${item.primary_muscles.join(" ")}`
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, 10);
  }, [exercises, query]);

  return (
    <PageCard title="动作库">
      <div className="space-y-3">
        <label className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索动作，如 蹲、硬拉"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div>
          <div className="mb-2 text-caption1 text-muted-foreground">
            {query.trim() ? "搜索建议（点击添加）" : "常用动作（点击添加）"}
          </div>
          {loading ? (
            <p className="py-2 text-xs text-muted-foreground">加载中…</p>
          ) : suggestions.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">未找到匹配的动作</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => onSelectExercise(exercise)}
                  className="flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
                >
                  <Plus className="size-3 text-muted-foreground" />
                  <span>{exercise.name_cn}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageCard>
  );
}
