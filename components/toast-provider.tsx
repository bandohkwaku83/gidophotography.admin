"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_MS = 4800;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  const common = "h-[1.125rem] w-[1.125rem] shrink-0";
  if (kind === "error") {
    return <AlertCircle className={common} aria-hidden />;
  }
  if (kind === "success") {
    return <CheckCircle2 className={common} aria-hidden />;
  }
  return <Info className={common} aria-hidden />;
}

function toastShellClass(kind: ToastKind): string {
  if (kind === "success") {
    return cn(
      "border-emerald-300/90 bg-emerald-50/95 text-emerald-950",
      "shadow-[0_12px_40px_-12px_rgba(16,185,129,0.35)] ring-1 ring-emerald-600/15",
      "dark:border-emerald-500/35 dark:bg-emerald-950/95 dark:text-emerald-50 dark:ring-emerald-400/20",
    );
  }
  if (kind === "error") {
    return cn(
      "border-red-300/90 bg-red-50/95 text-red-950",
      "shadow-[0_12px_40px_-12px_rgba(239,68,68,0.35)] ring-1 ring-red-600/15",
      "dark:border-red-500/40 dark:bg-red-950/95 dark:text-red-50 dark:ring-red-400/20",
    );
  }
  return cn(
    "border-zinc-300/90 bg-zinc-100/95 text-zinc-900",
    "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] ring-1 ring-zinc-400/12",
    "dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-50 dark:ring-zinc-500/20",
  );
}

function toastIconWrapClass(kind: ToastKind): string {
  if (kind === "success") {
    return "bg-emerald-600 text-white shadow-sm dark:bg-emerald-400 dark:text-emerald-950";
  }
  if (kind === "error") {
    return "bg-red-600 text-white shadow-sm dark:bg-red-500 dark:text-white";
  }
  return "bg-brand text-white shadow-sm dark:bg-brand/90";
}

function toastMessageClass(kind: ToastKind): string {
  if (kind === "success") {
    return "text-emerald-950 dark:text-emerald-50";
  }
  if (kind === "error") {
    return "text-red-950 dark:text-red-50";
  }
  return "text-zinc-900 dark:text-zinc-100";
}

function toastDismissClass(kind: ToastKind): string {
  if (kind === "success") {
    return "text-emerald-800/55 hover:bg-emerald-600/15 hover:text-emerald-950 dark:text-emerald-200/70 dark:hover:bg-emerald-400/15 dark:hover:text-emerald-50";
  }
  if (kind === "error") {
    return "text-red-800/55 hover:bg-red-600/15 hover:text-red-950 dark:text-red-200/70 dark:hover:bg-red-400/15 dark:hover:text-red-50";
  }
  return "text-zinc-500 hover:bg-zinc-900/10 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100";
}

function toastProgressTrackClass(kind: ToastKind): string {
  if (kind === "success") {
    return "bg-emerald-200/90 dark:bg-emerald-900/80";
  }
  if (kind === "error") {
    return "bg-red-200/90 dark:bg-red-900/80";
  }
  return "bg-zinc-300/80 dark:bg-zinc-700/80";
}

function toastProgressBarClass(kind: ToastKind): string {
  if (kind === "success") {
    return "h-full origin-left bg-emerald-600 dark:bg-emerald-400";
  }
  if (kind === "error") {
    return "h-full origin-left bg-red-600 dark:bg-red-400";
  }
  return "h-full origin-left bg-brand";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<number, number>>(new Map());

  const removeToast = useCallback((id: number) => {
    const t = timeoutsRef.current.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current.values()) {
        window.clearTimeout(t);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = Date.now() + Math.random();
      setToasts((list) => [{ id, message, kind }, ...list]);
      const tid = window.setTimeout(() => removeToast(id), TOAST_MS);
      timeoutsRef.current.set(id, tid);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-0 top-0 z-[100] flex w-full max-w-sm flex-col items-end gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto relative w-full overflow-hidden rounded-2xl border backdrop-blur-xl",
              toastShellClass(t.kind),
            )}
            style={{ animation: "toast-enter 0.24s ease-out both" }}
          >
            <div className="flex items-start gap-3 px-4 py-3.5 pr-2">
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  toastIconWrapClass(t.kind),
                )}
              >
                <ToastIcon kind={t.kind} />
              </span>
              <p
                className={cn(
                  "min-w-0 flex-1 pt-1 text-[13px] leading-snug font-medium tracking-tight",
                  toastMessageClass(t.kind),
                )}
              >
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
                  toastDismissClass(t.kind),
                )}
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className={cn("h-0.5 w-full", toastProgressTrackClass(t.kind))} aria-hidden>
              <div
                className={toastProgressBarClass(t.kind)}
                style={{
                  animation: `toast-progress ${TOAST_MS}ms linear forwards`,
                  transformOrigin: "left center",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
