"use client";

import {
  type HTMLAttributes,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
  /** 可选操作按钮（如「撤销」）；点击后自动关闭提示。 */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  /** 带操作按钮的提示：撤销等场景用；自动关闭时长可覆盖。 */
  toastWithAction: (
    message: string,
    variant: ToastVariant,
    action: { label: string; onClick: () => void },
    durationMs?: number,
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success/30 bg-surface-raised text-success",
  error: "border-error/30 bg-surface-raised text-error",
  info: "border-info/30 bg-surface-raised text-info",
  warning: "border-warning/30 bg-surface-raised text-warning",
};

/** 退场动画时长，与 animate-out 的 duration 一致；动画结束后才真正移除。 */
const EXIT_DURATION_MS = 150;

function ToastItemComp({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onRemove(item.id), EXIT_DURATION_MS);
  }, [item.id, onRemove]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (paused || exiting) return;
    timerRef.current = setTimeout(dismiss, item.durationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.id, item.durationMs, dismiss, paused, exiting]);

  return (
    <div
      role={item.variant === "error" || item.variant === "warning" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`${
        exiting
          ? "animate-out duration-150 ease-exit slide-out-to-right-2 fade-out-0"
          : "animate-in duration-200 ease-enter slide-in-from-right-2 fade-in-0"
      } rounded-lg border px-4 py-3 text-subheadline shadow-elevated ${variantStyles[item.variant]}`.trim()}
    >
      <div className="flex items-center justify-between gap-3">
        <span>{item.message}</span>
        <div className="flex items-center gap-1">
          {item.action ? (
            <button
              onClick={() => {
                item.action?.onClick();
                dismiss();
              }}
              className="focus-ring tactile min-h-11 shrink-0 rounded-full px-2 text-subheadline font-semibold underline-offset-4 hover:underline"
              aria-label={item.action.label}
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            onClick={dismiss}
            disabled={exiting}
            className="focus-ring tactile -me-2 flex size-[44px] shrink-0 items-center justify-center text-current/60 hover:text-current"
            aria-label="关闭提示"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToastProviderProps extends HTMLAttributes<HTMLDivElement> {
  duration?: number;
}

export function ToastProvider({
  duration = 4000,
  className = "",
  children,
  ...props
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, variant, durationMs: duration }]);
    },
    [duration],
  );

  const toastWithAction = useCallback(
    (
      message: string,
      variant: ToastVariant,
      action: { label: string; onClick: () => void },
      durationMs?: number,
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [
        ...prev,
        { id, message, variant, action, durationMs: durationMs ?? duration },
      ]);
    },
    [duration],
  );

  return (
    <ToastContext.Provider value={{ toast, toastWithAction }}>
      {children}
      {toasts.length > 0 && (
        <div
          className={`
            fixed bottom-[calc(var(--mobile-nav-height,3.5rem)+1rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 flex flex-col gap-2 sm:left-auto sm:max-w-sm
            ${className}
          `.trim()}
          {...props}
        >
          {toasts.map((t) => (
            <ToastItemComp key={t.id} item={t} onRemove={removeToast} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
