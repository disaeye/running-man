import { Link2Off, WifiOff } from "lucide-react";

import { API_ERROR_KINDS, ApiError, apiErrorMessage } from "@shared/lib/api";

import { ShareShell } from "./ShareShell";

export function ShareErrorState({ error }: { readonly error: unknown }) {
  if (error instanceof ApiError && error.kind === API_ERROR_KINDS.notFound) {
    return (
      <ShareShell>
        <Link2Off className="size-8 text-text-muted" aria-hidden="true" />
        <p className="text-title3 font-semibold text-text-primary">
          分享已失效
        </p>
        <p className="text-caption1 text-text-secondary">
          该活动链接不存在、已过期或已被取消分享。
        </p>
      </ShareShell>
    );
  }

  if (error instanceof ApiError && error.kind === API_ERROR_KINDS.request) {
    return (
      <ShareShell>
        <WifiOff className="size-8 text-text-muted" aria-hidden="true" />
        <p className="text-title3 font-semibold text-text-primary">
          无法连接
        </p>
        <p className="text-caption1 text-text-secondary">
          请检查网络连接后重试。
        </p>
      </ShareShell>
    );
  }

  return (
    <ShareShell>
      <p className="text-title3 font-semibold text-text-primary">
        暂时无法加载
      </p>
      <p className="text-caption1 text-text-secondary">
        {apiErrorMessage(error)}
      </p>
    </ShareShell>
  );
}
