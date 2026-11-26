"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
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
  selectedIds?: ReadonlySet<string>;
  onSelectExercise: (exercise: Exercise) => void;
}

export function StrengthExerciseLibraryCard({
  exercises,
  loading = false,
  selectedIds,
  onSelectExercise,
}: StrengthExerciseLibraryCardProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [collapsed, setCollapsed] = useState(false);
  const selectedCount = selectedIds?.size ?? 0;

  const categories = useMemo(() => {
    const set = new Set(exercises.map((item) => item.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [exercises]);

  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const scoped = category === "all"
      ? exercises
      : exercises.filter((item) => item.category === category);
    if (!keyword && category === "all") {
      const matched = scoped.filter((item) =>
        COMMON_EXERCISE_NAMES.some((name) => item.name_cn.includes(name)),
      );
      return (matched.length > 0 ? matched : scoped).slice(0, 10);
    }
    if (!keyword) {
      return scoped.slice(0, 16);
    }
    return scoped
      .filter((item) =>
        `${item.name_cn} ${item.name_en} ${item.category} ${item.primary_muscles.join(" ")}`
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, 14);
  }, [exercises, query, category]);

  return (
    <PageCard
      title="动作库"
      action={
        selectedCount > 0 ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
            className="focus-ring inline-flex min-h-11 items-center gap-1 text-caption1 text-accent-strong hover:underline"
          >
            <span>{collapsed ? `展开添加（已选 ${selectedCount} 项）` : "收起动作库"}</span>
            <ChevronDown className={`size-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`} aria-hidden />
          </button>
        ) : undefined
      }
    >
      {collapsed && selectedCount > 0 ? (
        <p className="text-caption1 text-muted-foreground">
          已添加 {selectedCount} 个动作，需要补充动作时点击右上角展开。
        </p>
      ) : (
        <div className="space-y-3">
        <label className="flex items-center gap-2 rounded-lg bg-secondary px-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索动作，如 深蹲、硬拉、卧推"
            aria-label="搜索力量动作"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        {categories.length > 1 ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="动作部位筛选">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={category === cat}
                onClick={() => setCategory(cat)}
                className={`min-h-11 rounded-full border px-3 text-caption1 transition-colors ${
                  category === cat
                    ? "border-accent bg-accent/15 font-medium text-accent-strong"
                    : "border-border-default text-text-muted hover:text-text-primary"
                }`}
              >
                {cat === "all" ? "常用/全部" : cat}
              </button>
            ))}
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-caption1 text-muted-foreground">
            {query.trim() ? "搜索结果（点击添加）" : category === "all" ? "常用动作（点击添加）" : `${category}动作（点击添加）`}
          </div>
          {loading ? (
            <p className="py-2 text-xs text-muted-foreground">加载中…</p>
          ) : suggestions.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">未找到匹配的动作</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((exercise) => {
                const added = selectedIds?.has(exercise.id) ?? false;
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    aria-pressed={added}
                    onClick={() => onSelectExercise(exercise)}
                    className={`flex min-h-11 items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                      added
                        ? "border-accent/50 bg-accent/10 text-accent-strong"
                        : "border-border bg-secondary/50 text-foreground hover:bg-secondary"
                    }`}
                  >
                    {added ? (
                      <Check className="size-3 text-accent-strong" aria-hidden />
                    ) : (
                      <Plus className="size-3 text-muted-foreground" aria-hidden />
                    )}
                    <span>{exercise.name_cn}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </PageCard>
  );
}
