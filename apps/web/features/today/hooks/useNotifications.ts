"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listAthleteNotificationsApiV1NotificationsGet,
  markNotificationReadApiV1NotificationsNotificationIdReadPost,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

/** 首页通知条读取的键：只拉未读。 */
export const NOTIFICATIONS_KEY = ["/notifications", "unread"] as const;

export type NoticeItem = Generated.NotificationResponseOutput;

/**
 * 未读通知。规则由定时同步任务评估，这里只负责呈现与标记已读；
 * 同步完成的自动重拉（HomePortrait 的 settle 重拉）会一并刷新本键。
 */
export function useNotifications() {
  const { data, error, isLoading } = useSWR<NoticeItem[]>(
    NOTIFICATIONS_KEY,
    {
      fetcher: () =>
        callOrvalValidated(
          (fetcher) =>
            listAthleteNotificationsApiV1NotificationsGet({ unread_only: true }, {}, fetcher),
          Generated.NotificationResponse.array(),
        ),
    },
  );

  const markRead = (id: string) =>
    callOrval((fetcher) =>
      markNotificationReadApiV1NotificationsNotificationIdReadPost(id, {}, fetcher),
    ).then(() => globalMutate(NOTIFICATIONS_KEY));

  return {
    notices: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    markRead,
  };
}
