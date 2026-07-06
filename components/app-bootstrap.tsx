"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { getAuthToken } from "@/lib/auth-demo";
import { cn } from "@/lib/utils";

/** App Router paths; must match real `app/` routes (use pathname shape Next resolves). */
const PRIORITY_ROUTES = [
  "/dashboard",
  "/dashboard/galleries",
  "/dashboard/galleries/trash",
  "/dashboard/clients",
  "/dashboard/settings",
  "/dashboard/schedules",
  "/dashboard/invoices",
  "/dashboard/communication",
  "/dashboard/uploads",
  "/dashboard/storage",
  "/dashboard/downloads",
  "/dashboard/sms",
  "/dashboard/notifications",
  "/login",
];

function isPublicBootstrapPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/g/")
  );
}

async function runClientBootstrap(): Promise<void> {
  // Storage is sync; this mainly yields the main thread after hydration / first paint.
  // Extend here with validateSession() / GET /api/auth/me when you add it.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function AppBootstrap({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const publicPath = isPublicBootstrapPath(pathname);

  /** After first successful boot, never block the shell again (e.g. login → dashboard). */
  const everBootedRef = useRef(publicPath);
  const [bootDone, setBootDone] = useState(publicPath);

  useEffect(() => {
    if (publicPath || everBootedRef.current) {
      everBootedRef.current = true;
      setBootDone(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      await runClientBootstrap();
      if (!cancelled) {
        everBootedRef.current = true;
        setBootDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicPath]);

  useEffect(() => {
    if (!bootDone) return;

    const loggedIn = Boolean(getAuthToken());
    if (!loggedIn) return;

    const prefetch = () => {
      for (const base of PRIORITY_ROUTES) {
        if (pathname === base || pathname.startsWith(`${base}/`)) continue;
        router.prefetch(base);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => {
        window.cancelIdleCallback(id);
      };
    }
    const t = setTimeout(prefetch, 250);
    return () => clearTimeout(t);
  }, [bootDone, pathname, router]);

  const showSplash = !bootDone && !publicPath;

  if (showSplash) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4",
          "bg-zinc-950 text-white",
        )}
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="h-10 w-10 animate-spin text-brand-on-dark opacity-90" aria-hidden />
        <p className="text-sm font-medium text-zinc-300">Loading studio…</p>
      </div>
    );
  }

  return <>{children}</>;
}
