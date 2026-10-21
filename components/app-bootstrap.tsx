"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { STUDIO_LOGO_SRC } from "@/lib/branding";
import { getAuthToken } from "@/lib/auth-demo";

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
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white px-6"
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        <div className="flex max-w-sm flex-col items-center gap-7 text-center">
          <Image
            src={STUDIO_LOGO_SRC}
            alt="Gido Photography"
            width={640}
            height={160}
            className="h-9 w-auto object-contain"
            priority
          />
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-studio-gold" aria-hidden />
            <div>
              <p className="font-display text-xl tracking-tight text-studio-ink">Loading studio</p>
              <p className="mt-1.5 text-xs leading-relaxed text-studio-taupe">
                Opening your workspace…
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
