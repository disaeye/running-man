"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { LogOut } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage } from "@shared/lib/api";
import { logout } from "@shared/lib/auth";

/**
 * Sign-out control.
 *
 * ``logout()`` had been in the auth library with no caller: the account section
 * used to render a component that was later orphaned and deleted, and nothing
 * replaced it. The only way to end a session was to clear the cookie by hand.
 * An end-to-end test still expected the button, which is how it surfaced.
 */
export function SettingsSignOut() {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      await mutate(() => true, undefined, { revalidate: false });
      window.location.assign("/login");
    } catch (err: unknown) {
      toast(apiErrorMessage(err, "退出登录失败，请稍后重试"), "error");
      setSigningOut(false);
    }
  };

  return (
    <Card padding="md">
      <h3 className="text-caption1 font-semibold text-text-secondary">会话</h3>
      <p className="mt-1 text-caption1 text-text-muted">
        退出后需要重新登录才能访问训练数据。
      </p>
      <Button
        variant="secondary"
        className="mt-3 gap-2"
        disabled={signingOut}
        onClick={() => void handleSignOut()}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {signingOut ? "正在退出…" : "退出登录"}
      </Button>
    </Card>
  );
}
