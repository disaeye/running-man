import { usePathname, useSearchParams } from "next/navigation";
import { athleteToday, useAthleteTimezoneState } from "@shared/lib/training-day";
import {
  parseCalendarDateParam,
  parseSportFamilyParam,
} from "@features/calendar/lib/calendar-url-state";
import { resolveCalendarView } from "@features/calendar/lib/calendar-view";
import { weekRangeOf } from "@features/calendar/lib/view-range";
import { defaultSportForFamily } from "@features/calendar/lib/workout-prescription";

export interface TrainingAddDefaults {
  /** 抽屉里表单的默认日期；时区尚未解析时为空串。 */
  readonly date: string;
  /** 编排单日课表时的默认运动项目，跟随日历的家族筛选。 */
  readonly sport: string;
}

/**
 * 共享抽屉的默认日期：日历页浏览其他周或月时，默认日期跟随所在周期的起点
 * （周一或月初），当前周期与其余页面默认今天；任何页面带 `?date=` 时以它为准。
 */
export function useTrainingAddDefaults(): TrainingAddDefaults {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { timezone, resolved } = useAthleteTimezoneState();
  const today = resolved ? athleteToday(timezone) : "";
  const params = new URLSearchParams(searchParams.toString());
  const sport = defaultSportForFamily(parseSportFamilyParam(params.get("sport")));
  const explicit = parseCalendarDateParam(params.get("date"));
  if (pathname !== "/calendar") return { date: explicit ?? today, sport };

  const anchor = explicit ?? today;
  if (!anchor) return { date: "", sport };
  const view = resolveCalendarView(params.get("view"));
  if (view === "week") {
    const range = weekRangeOf(anchor);
    const isCurrentWeek = range.from <= today && today <= range.to;
    return { date: isCurrentWeek ? today : range.from, sport };
  }
  const isCurrentMonth = anchor.slice(0, 7) === today.slice(0, 7);
  return { date: isCurrentMonth ? today : `${anchor.slice(0, 7)}-01`, sport };
}
