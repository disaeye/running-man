import type { CalendarEventDTO } from "@features/calendar/components/types";
import { PlanForecastSummary } from "./PlanForecastSummary";

interface Props { events: CalendarEventDTO[] }

export function PlanForecast({ events }: Props) {
  return <PlanForecastSummary events={events} />;
}
