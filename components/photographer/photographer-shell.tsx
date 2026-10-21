"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useCallback,
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
  Ellipsis,
  LogOut,
  Menu,
  MessageSquare,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Trash2,
  Users,
  X,
} from "lucide-react";

const SIDEBAR_KEY = "gido-sidebar-collapsed";

type ShellNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

const STUDIO_NAV: ShellNavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutGrid,
    isActive: (p) => p === "/dashboard",
  },
  {
    href: "/dashboard/galleries",
    label: "Galleries",
    icon: GalleryHorizontal,
    isActive: (p) =>
      (p.startsWith("/dashboard/galleries") && !p.startsWith("/dashboard/galleries/trash")) ||
      p.startsWith("/dashboard/folder"),
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
];

const BUSINESS_NAV: ShellNavItem[] = [
  {
    href: "/dashboard/invoices",
    label: "Invoices",
    icon: FileText,
    isActive: (p) => p.startsWith("/dashboard/invoices"),
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
  {
    href: "/dashboard/galleries/trash",
    label: "Trash",
    icon: Trash2,
    isActive: (p) => p.startsWith("/dashboard/galleries/trash"),
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
  openMobileNav: () => void;
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
  return { query: ctx.query, setQuery: ctx.setQuery };
}

export function useShellChrome() {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    return {
      query: "",
      setQuery: (q: string) => {
        void q;
      },
      openMobileNav: () => {},
    };
  }
  return ctx;
}

function NavLink({
  href,
  label,
  icon,
  active,
  compact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={compact ? label : undefined}
      onClick={() => onNavigate?.()}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg text-[13px] transition-colors duration-200",
        compact ? "mx-auto h-10 w-10 justify-center p-0" : "px-3 py-2",
        active
          ? "bg-white text-black shadow-[0_1px_2px_rgba(26,22,18,0.06)]"
          : "text-black hover:bg-white/60",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 text-black [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:stroke-[1.6]",
        )}
      >
        {icon}
      </span>
      <span className={cn("min-w-0 truncate leading-snug font-medium", compact && "sr-only")}>
        {label}
      </span>
    </Link>
  );
}

function NavSection({
  title,
  compact,
  children,
}: {
  title: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p
        className={cn(
          "px-3 pb-2 text-[10px] font-medium tracking-[0.16em] text-[#a89888] uppercase",
          compact && "sr-only",
        )}
      >
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function ShellPage({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), 400);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className={entered ? undefined : "animate-shell-enter"}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        setEntered(true);
      }}
    >
      {children}
    </div>
  );
}

function SidebarNav({
  pathname,
  compact,
  onNavigate,
}: {
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <NavSection title="Studio" compact={compact}>
        {STUDIO_NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={<item.icon aria-hidden="true" />}
            active={item.isActive(pathname)}
            compact={compact}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>
      <NavSection title="Business" compact={compact}>
        {BUSINESS_NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={<item.icon aria-hidden="true" />}
            active={item.isActive(pathname)}
            compact={compact}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>
      <NavSection title="Account" compact={compact}>
        {ACCOUNT_NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={<item.icon aria-hidden="true" />}
            active={item.isActive(pathname)}
            compact={compact}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>
    </>
  );
}

export function PhotographerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const searchValue = useMemo(
    () => ({ query, setQuery, openMobileNav }),
    [query, openMobileNav],
  );

  const [identity, setIdentity] = useState({ email: "", name: "Studio", initial: "G" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const email = auth?.email ?? "";
    const name = auth?.user?.name?.trim() || email.split("@")[0] || "Studio";
    const initial = (name.trim().charAt(0) || "G").toUpperCase();
    setIdentity({ email, name, initial });
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* ignore */
    }
    setCollapseReady(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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

  const isOverview = pathname === "/dashboard";

  async function signOut() {
    setProfileOpen(false);
    await logout();
    window.location.href = "/login";
  }

  return (
    <SearchContext.Provider value={searchValue}>
      <div className="relative flex h-dvh overflow-hidden bg-studio-canvas text-studio-ink print:h-auto print:overflow-visible print:bg-white">
        <aside
          className={cn(
            "relative hidden h-full min-h-0 shrink-0 flex-col border-r border-black/5 bg-studio-sidebar lg:flex",
            collapseReady && "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            collapsed ? "w-[76px]" : "w-[240px]",
          )}
        >
          <div className={cn("flex h-[72px] items-center", collapsed ? "justify-center px-3" : "px-5")}>
            <Link href="/dashboard" className="flex min-w-0 items-center" title={STUDIO_NAME}>
              {collapsed ? (
                <span className="font-display flex h-9 w-9 items-center justify-center rounded-full bg-studio-ink text-lg text-white">
                  G
                </span>
              ) : (
                <Image
                  src="/images/gido_logo.png"
                  alt="Gido Photography"
                  width={640}
                  height={160}
                  className="object-contain object-left"
                  style={{ width: "auto", height: "34px" }}
                  priority
                />
              )}
            </Link>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-3 pb-4">
            <SidebarNav pathname={pathname} compact={collapsed} />
          </nav>

          <div className={cn("border-t border-black/5 p-3", collapsed && "flex flex-col items-center")}>
            <div ref={profileWrapRef} className={cn("relative", collapsed ? "w-10" : "w-full")}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-white/70",
                  collapsed && "justify-center px-0",
                )}
                aria-label="Account menu"
                aria-expanded={profileOpen}
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-studio-ink text-[13px] font-medium text-white">
                  {identity.initial}
                </span>
                {collapsed ? null : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-studio-ink">{identity.name}</span>
                      <span className="block truncate text-[11px] text-studio-taupe">{identity.email}</span>
                    </span>
                    <Ellipsis className="h-4 w-4 shrink-0 text-studio-taupe" aria-hidden />
                  </>
                )}
              </button>
              {profileOpen ? (
                <div className="animate-pop-in absolute right-0 bottom-full z-50 mb-2 w-56 overflow-hidden rounded-xl border border-studio-line bg-white shadow-[0_16px_40px_rgba(26,22,18,0.12)]">
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-medium tracking-[0.16em] text-studio-taupe uppercase">Signed in</p>
                    <p className="mt-1 truncate text-sm text-studio-ink">{identity.email || identity.name}</p>
                  </div>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 border-t border-studio-line px-4 py-3 text-sm text-studio-burgundy transition hover:bg-[#F3E4E4]"
                    onClick={() => void signOut()}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className={cn(
                "mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-lg text-studio-taupe transition-colors hover:bg-white/70 hover:text-studio-ink",
                collapsed ? "w-9" : "w-full px-3",
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
              ) : (
                <>
                  <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />
                  <span className="text-[13px] font-medium">Collapse</span>
                </>
              )}
            </button>
          </div>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col print:h-auto print:overflow-visible">
          {mobileNavOpen ? (
            <div
              role="presentation"
              className="fixed inset-0 z-40 bg-[#1A1612]/35 backdrop-blur-[2px] lg:hidden"
              aria-hidden
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}
          <aside
            id="dashboard-mobile-nav"
            inert={mobileNavOpen ? undefined : true}
            aria-hidden={!mobileNavOpen}
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-[min(280px,calc(100vw-3rem))] -translate-x-full flex-col border-r border-black/5 bg-studio-sidebar text-studio-ink transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
              mobileNavOpen && "translate-x-0 shadow-2xl shadow-black/20",
            )}
          >
            <div className="flex h-[72px] items-center justify-between px-4">
              <Image
                src="/images/gido_logo.png"
                alt="Gido Photography"
                width={640}
                height={160}
                className="object-contain object-left"
                style={{ width: "auto", height: "32px" }}
              />
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-studio-taupe transition hover:bg-white hover:text-studio-ink"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
              <SidebarNav pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
            </nav>
            <div className="border-t border-black/5 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-studio-ink text-[13px] font-medium text-white">
                  {identity.initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{identity.name}</p>
                  <p className="truncate text-[11px] text-studio-taupe">{identity.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-studio-burgundy transition hover:bg-[#F3E4E4]"
                onClick={() => void signOut()}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </aside>

          {isOverview ? null : (
            <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-black/5 bg-studio-canvas/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-studio-ink transition hover:bg-white lg:hidden"
                aria-label="Open menu"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-mobile-nav"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>

              <div className="relative min-w-0 max-w-sm flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-studio-taupe"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  placeholder="Search clients and galleries"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-studio-line bg-white py-2 pr-3 pl-9 text-sm text-studio-ink shadow-[0_1px_2px_rgba(26,22,18,0.04)] outline-none transition placeholder:text-[#b3a89a] focus:border-studio-gold focus:ring-2 focus:ring-studio-gold/25"
                />
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <NotificationsBell />
              </div>
            </header>
          )}

          <main
            className={cn(
              "min-h-0 flex-1 overflow-y-auto print:h-auto print:overflow-visible print:p-0",
              isOverview ? "px-4 py-5 sm:px-6 lg:px-8 lg:py-6" : "px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-9",
            )}
          >
            <ShellPage key={pathname}>{children}</ShellPage>
          </main>
        </div>
      </div>
    </SearchContext.Provider>
  );
}
