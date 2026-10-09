"use client";

import { ShareActivityView } from "@features/share/components/ShareActivityView";
import { ShareErrorState } from "@features/share/components/ShareErrorState";
import { ShareLoadingState } from "@features/share/components/ShareLoadingState";
import { useShareActivity } from "@features/share/hooks/useShareActivity";

export function ShareContent({ token }: { readonly token: string }) {
  const { activity, error } = useShareActivity(token);

  if (error) {
    return <ShareErrorState error={error} />;
  }

  if (!activity) {
    return <ShareLoadingState />;
  }

  return <ShareActivityView activity={activity} />;
}
