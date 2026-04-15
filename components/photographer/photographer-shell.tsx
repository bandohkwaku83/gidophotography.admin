"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { clearAuth, getAuth } from "@/lib/auth-demo";
import { STUDIO_NAME } from "@/lib/branding";

type SearchCtx = {
  query: string;
  setQuery: (q: string) => void;
};

const SearchContext = createContext<SearchCtx | null>(null);

export function useFolderListSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    return {
      query: "",
      setQuery: (q: string) => {
        void q;
      },
    };
  }
  return ctx;
}

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md shadow-indigo-500/20"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </Link>
  );
}

export function PhotographerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const searchValue = useMemo(() => ({ query, setQuery }), [query]);

  const email = getAuth()?.email ?? "you@studio.com";

  return (
    <SearchContext.Provider value={searchValue}>
      <div className="relative flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),transparent_38%),radial-gradient(circle_at_85%_15%,_rgba(14,165,233,0.08),transparent_35%)]" />
        <aside className="relative hidden w-72 shrink-0 flex-col border-r border-zinc-200/70 bg-white/95 px-4 py-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:flex">
          <div className="px-2">
            <Image
              src="/images/gido_logo.png"
              alt="Gido logo"
              width={168}
              height={168}
              className="h-auto w-28 object-contain"
              priority
            />
          </div>
          <nav className="mt-8 flex flex-col gap-1.5">
            <NavLink
              href="/dashboard"
              label="Dashboard"
              icon="▦"
              active={pathname === "/dashboard"}
            />
            <NavLink
              href="/dashboard#folders"
              label="Folders"
              icon="◫"
              active={
                pathname === "/dashboard" || pathname.startsWith("/dashboard/folder")
              }
            />
            <NavLink
              href="/dashboard/settings"
              label="Settings"
              icon="⚙"
              active={pathname.startsWith("/dashboard/settings")}
            />
          </nav>
          <div className="mt-auto rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-sky-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Signed in
            </p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{email}</p>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80 lg:px-8">
            <div className="flex flex-1 items-center gap-3">
              <span className="text-sm font-semibold lg:hidden">{STUDIO_NAME}</span>
              <div className="relative max-w-md flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  ⌕
                </span>
                <input
                  type="search"
                  placeholder="Search folders…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-4 text-sm outline-none ring-indigo-300 transition focus:border-indigo-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-indigo-500/40"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  clearAuth();
                  window.location.href = "/login";
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-100 hover:text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  ↪
                </span>
                Sign out
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </SearchContext.Provider>
  );
}
