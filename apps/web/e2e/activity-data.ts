import { expect, type APIRequestContext } from "@playwright/test";
import { getSportConfig } from "@shared/config/sport-config";
import { athleteRange } from "@shared/lib/training-day";
import type { ActivitySummary, StreamPoint } from "@shared/types/activity";

export async function findRunWithPace(request: APIRequestContext): Promise<string> {
  const { from, to } = athleteRange(365);
  const response = await request.get("/api/v1/activities", { params: { from, to } });
  expect(response.ok(), "读取训练记录").toBe(true);
  const activities: ActivitySummary[] = await response.json();
  const runs = activities.filter((activity) => getSportConfig(activity.sport).isRun && (activity.distance_m ?? 0) >= 2000);
  for (const activity of runs.slice(0, 10)) {
    const id = encodeURIComponent(activity.activity_id);
    const streamsResponse = await request.get(`/api/v1/activities/${id}/streams`);
    expect(streamsResponse.ok(), "读取跑步运动流").toBe(true);
    const streams: StreamPoint[] = await streamsResponse.json();
    await streamsResponse.dispose();
    if (streams.filter((point) => point.metric_type === "speed" && point.value > 0.5 && point.value < 12).length > 100) return id;
  }
  throw new Error("最近一年找不到具有配速运动流的跑步记录");
}
