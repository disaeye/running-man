"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Switch } from "@shared/ui/Switch";
import { apiErrorMessage } from "@shared/lib/api";
import { athleteToday, useAthleteTimezone } from "@shared/lib/training-day";
import { eventLabel } from "@features/today/lib/grade-label";
import {
  RACE_DISTANCE_CATEGORIES,
  type RaceDistanceCategory,
  type RaceResultDraft,
} from "@features/settings/hooks/useRaceResults";
import { parseRaceTime } from "@features/settings/lib/race-time";

interface RaceResultFormProps {
  onSubmit: (draft: RaceResultDraft) => Promise<void>;
  onCancel: () => void;
}

/**
 * 新增一条比赛成绩。
 *
 * 表单展开在卡片里，不用对话框：一次录入只有一个目的，弹窗只多一层遮罩和
 * 一次焦点转移。日期默认是运动员本地的今天——在点击「添加成绩」时求值，
 * 服务端渲染期不读时钟——运动员把它改成本场比赛的日期即可。
 *
 * 校验只拦两件必须拦的事：赛事名不能为空，成绩要能解析成秒。任一项不满足
 * 就禁用「保存成绩」并在字段下面说明原因；服务端拒绝时把它的句子原样放在
 * 按钮上方，而不是弹 toast。
 */
export function RaceResultForm({ onSubmit, onCancel }: RaceResultFormProps) {
  const timezone = useAthleteTimezone();
  const [eventName, setEventName] = useState("");
  const [category, setCategory] = useState<RaceDistanceCategory>("half");
  const [timeInput, setTimeInput] = useState("");
  const [raceDate, setRaceDate] = useState(() => athleteToday(timezone));
  const [a1Certified, setA1Certified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const eventMissing = eventName.trim() === "";
  const timeSeconds = parseRaceTime(timeInput);
  const canSubmit = !eventMissing && timeSeconds !== null && raceDate !== "";

  const submit = async (form: React.FormEvent<HTMLFormElement>) => {
    form.preventDefault();
    if (!canSubmit || timeSeconds === null) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        event_name: eventName.trim(),
        distance_category: category,
        time_s: timeSeconds,
        race_date: raceDate,
        a1_certified: a1Certified,
      });
    } catch (caught) {
      setSubmitError(apiErrorMessage(caught, "保存比赛成绩失败，请稍后重试。"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      aria-label="添加比赛成绩"
      className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4"
    >
      <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
        赛事名
        <Input
          value={eventName}
          onChange={(event) => setEventName(event.target.value)}
          placeholder="例如：春季半程马拉松"
          maxLength={120}
          autoFocus
        />
        {eventMissing && (
          <span className="text-caption1 text-error">请填写赛事名</span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          项目
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as RaceDistanceCategory)
            }
            className="min-h-11 w-full rounded-lg border border-border-default bg-surface-card px-3 text-callout text-text-primary"
          >
            {RACE_DISTANCE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {eventLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          成绩
          <Input
            value={timeInput}
            onChange={(event) => setTimeInput(event.target.value)}
            placeholder="1:31:20 或 91:20"
            inputMode="numeric"
          />
          {timeSeconds === null && (
            <span className="text-caption1 text-error">
              {timeInput.trim() === ""
                ? "请填写完赛时间"
                : "格式需为 1:31:20 或 91:20"}
            </span>
          )}
        </label>
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-caption1 text-text-secondary">
          比赛日期
          <Input
            type="date"
            value={raceDate}
            onChange={(event) => setRaceDate(event.target.value)}
          />
          {raceDate === "" && (
            <span className="text-caption1 text-error">请选择比赛日期</span>
          )}
        </label>

        <div className="flex flex-col gap-1 text-caption1 text-text-secondary">
          <span>A1 类认证赛事</span>
          <div className="flex min-h-11 items-center">
            <Switch
              checked={a1Certified}
              onChange={setA1Certified}
              label={a1Certified ? "是" : "否"}
            />
          </div>
        </div>
      </div>

      {submitError !== null && (
        <p role="alert" className="text-caption1 text-error">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit || saving}>
          {saving ? "正在保存…" : "保存成绩"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}
