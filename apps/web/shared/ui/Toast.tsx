"use client";

import {
  type HTMLAttributes,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { X } from "lucide-react";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
};

function ToastItemComp({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      role="alert"
      className={`
        animate-in slide-in-from-right-2
        rounded-lg border border-border-default px-4 py-3 text-subheadline shadow-elevated
        ${variantStyles[item.variant]}
      `.trim()}
    >
      <div className="flex items-center justify-between gap-3">
        <span>{item.message}</span>
        <button
          onClick={() => onRemove(item.id)}
          className="focus-ring -me-2 flex size-[44px] shrink-0 items-center justify-center text-current/60 hover:text-current"
          aria-label="Dismiss"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── Provider ──

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
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => removeToast(id), duration);
    },
    [duration, removeToast],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          className={`
            fixed bottom-4 right-4 z-50 flex flex-col gap-2
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
