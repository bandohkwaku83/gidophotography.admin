"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { getAuth, logout } from "@/lib/auth-demo";
import { STUDIO_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { NotificationsBell } from "@/components/photographer/notifications-bell";
import {
  CalendarDays,
  GalleryHorizontal,
  HardDrive,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";

type ShellNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

const WORKSPACE_NAV: ShellNavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutGrid,
    isActive: (p) => p === "/dashboard",
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    icon: Users,
    isActive: (p) => p.startsWith("/dashboard/clients"),
  },
  {
    href: "/dashboard/schedules",
    label: "Schedules",
    icon: CalendarDays,
    isActive: (p) => p.startsWith("/dashboard/schedules"),
  },
  {
    href: "/dashboard/galleries",
    label: "Galleries",
    icon: GalleryHorizontal,
    isActive: (p) =>
      p.startsWith("/dashboard/galleries") || p.startsWith("/dashboard/folder"),
  },
  {
    href: "/dashboard/storage",
    label: "Storage",
    icon: HardDrive,
    isActive: (p) => p.startsWith("/dashboard/storage"),
  },
  {
    href: "/dashboard/sms",
    label: "SMS",
    icon: MessageSquare,
    isActive: (p) => p.startsWith("/dashboard/sms"),
  },
];

const ACCOUNT_NAV: ShellNavItem[] = [
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    isActive: (p) => p.startsWith("/dashboard/settings"),
  },
];

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
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-[background-color,color,box-shadow] duration-200",
        active
          ? "bg-white/[0.07] text-white shadow-[inset_2px_0_0_0] shadow-brand-on-dark"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:stroke-[1.65]",
          active ? "text-brand-on-dark" : "text-zinc-500 group-hover:text-zinc-400",
        )}
      >
        {icon}
      </span>
      <span className={cn("min-w-0 leading-snug", active ? "font-semibold" : "font-medium")}>
        {label}
      </span>
    </Link>
  );
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="mb-2.5 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
        {title}
      </p>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

export function PhotographerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const searchValue = useMemo(() => ({ query, setQuery }), [query]);

  const email = getAuth()?.email ?? "doe@gmail.com";
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileOpen) return;

    function onDocMouseDown(e: MouseEvent) {
      const el = profileWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setProfileOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [profileOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  return (
    <SearchContext.Provider value={searchValue}>
      <div className="relative flex min-h-screen bg-[#F9FAFB] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="pointer-events-none absolute inset-0 bg-transparent" />
        <aside className="relative hidden min-h-screen w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(99,102,241,0.14)_0%,transparent_55%)] lg:flex lg:flex-col">
          <div className="flex flex-1 flex-col px-5 pb-8 pt-10">
            <div className="rounded-2xl bg-white p-4 shadow-xl shadow-black/50 ring-1 ring-white/15">
              <Image
                src="/images/gido_logo.png"
                alt="Gido logo"
                width={168}
                height={168}
                className="h-8 w-auto max-w-[140px] object-contain object-left"
                priority
              />
            </div>

            <nav className="mt-10 flex flex-1 flex-col gap-11">
              <NavSection title="Workspace">
                {WORKSPACE_NAV.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={<item.icon aria-hidden="true" />}
                    active={item.isActive(pathname)}
                  />
                ))}
              </NavSection>

              <NavSection title="Account">
                {ACCOUNT_NAV.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={<item.icon aria-hidden="true" />}
                    active={item.isActive(pathname)}
                  />
                ))}
              </NavSection>
            </nav>

            <div className="mt-auto border-t border-white/[0.06] pt-8">
              <p className="px-3 text-[11px] leading-relaxed text-zinc-600">
                Signed in as
                <span className="mt-1 block truncate font-medium text-zinc-400" title={email}>
                  {email}
                </span>
              </p>
            </div>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          {mobileNavOpen ? (
            <div
              role="presentation"
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              aria-hidden
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}
          <aside
            id="dashboard-mobile-nav"
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-[min(280px,calc(100vw-3rem))] -translate-x-full flex-col border-r border-white/[0.06] bg-zinc-950 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(99,102,241,0.14)_0%,transparent_55%)] transition-transform duration-200 ease-out lg:hidden",
              mobileNavOpen && "translate-x-0 shadow-2xl shadow-black/40",
            )}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-4">
              <Image
                src="/images/gido_logo.png"
                alt="Gido logo"
                width={168}
                height={168}
                className="h-7 w-auto max-w-[120px] object-contain object-left"
              />
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-8 overflow-y-auto px-4 py-6">
              <NavSection title="Workspace">
                {WORKSPACE_NAV.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={<item.icon aria-hidden="true" />}
                    active={item.isActive(pathname)}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                ))}
              </NavSection>
              <NavSection title="Account">
                {ACCOUNT_NAV.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={<item.icon aria-hidden="true" />}
                    active={item.isActive(pathname)}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                ))}
              </NavSection>
            </nav>
            <div className="border-t border-white/[0.06] px-4 py-4">
              <p className="px-3 text-[11px] leading-relaxed text-zinc-600">
                Signed in as
                <span className="mt-1 block truncate font-medium text-zinc-400" title={email}>
                  {email}
                </span>
              </p>
            </div>
          </aside>

          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-zinc-200/80 bg-white/95 px-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80 lg:px-8">
            <div className="flex flex-1 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 lg:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label="Open menu"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-mobile-nav"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
              <span className="min-w-0 truncate text-sm font-semibold lg:hidden">{STUDIO_NAME}</span>
              <div className="relative max-w-md flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  placeholder="Search clients, galleries, SMS threads..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-4 text-sm outline-none ring-brand/35 transition focus:border-brand-on-dark focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-brand/40"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationsBell />

              <div ref={profileWrapRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  aria-label="Profile menu"
                  aria-expanded={profileOpen}
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </button>

                {profileOpen ? (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Signed in
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        {email}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:text-zinc-50 dark:hover:bg-zinc-900/60"
                      onClick={async () => {
                        setProfileOpen(false);
                        await logout();
                        window.location.href = "/login";
                      }}
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </SearchContext.Provider>
  );
}
