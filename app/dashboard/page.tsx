"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Check,
  FileText,
  GalleryHorizontal,
  HardDrive,
  Menu,
  MessageSquare,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DashboardPage as DashboardPageLayout } from "@/components/photographer/dashboard-page";
import { NotificationsBell } from "@/components/photographer/notifications-bell";
import { RecentGalleryCard } from "@/components/photographer/recent-gallery-card";
import { useShellChrome } from "@/components/photographer/photographer-shell";
import {
  DASHBOARD_HOME_LIST_LIMIT,
  dashboardRecentGalleryToApiFolder,
  DashboardApiError,
  fetchDashboard,
  type DashboardStats,
} from "@/lib/dashboard-api";
import { getAuth, getAuthToken } from "@/lib/auth-demo";
import { CreateFolderModal } from "@/components/photographer/create-folder-modal";
import { listClients } from "@/lib/clients-api";
import {
  apiFolderStatusToUi,
  getFolderClientId,
  getFolderClientName,
  listFolders,
  type ApiFolder,
} from "@/lib/folders-api";
import { cn } from "@/lib/utils";

const CARD = "rounded-xl border border-studio-line bg-white shadow-[0_1px_2px_rgba(26,22,18,0.04)]";

function firstWordFromName(name: string): string {
  const t = name.trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

function firstNameFromAuth(): string {
  if (typeof window === "undefined") return "there";
  const a = getAuth();
  const n = a?.user?.name?.trim();
  if (n) {
    const first = n.split(/\s+/)[0];
    if (first) return first;
  }
  const email = a?.email?.trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return "there";
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

const ACTIVITY_TONES = [
  "bg-[#F3E6C8] text-[#8A6A2F]",
  "bg-[#F3E4E4] text-[#6B1E2F]",
  "bg-[#E5EEE6] text-[#3E5C46]",
  "bg-[#EFE8DC] text-[#5C5146]",
] as const;

type ActivityKind = "gallery" | "client" | "invoice" | "message" | "alert" | "done";

type ActivityRow = {
  action: string;
  target: string;
  when: string;
  galleryId?: string;
  kind: ActivityKind;
};

const ACTIVITY_ICON: Record<Exclude<ActivityKind, "gallery" | "client">, LucideIcon> = {
  invoice: FileText,
  message: MessageSquare,
  alert: AlertCircle,
  done: Check,
};

const ACTIVITY_WELL: Record<Exclude<ActivityKind, "gallery" | "client">, string> = {
  invoice: "bg-[#E5EEE6] text-[#3E5C46]",
  message: "bg-[#F3E6C8] text-[#8A6A2F]",
  alert: "bg-[#F3E4E4] text-[#6B1E2F]",
  done: "bg-[#E5EEE6] text-[#3E5C46]",
};

function activityInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function activityTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % ACTIVITY_TONES.length;
  return ACTIVITY_TONES[hash] ?? ACTIVITY_TONES[0];
}

function phraseCase(value: string): string {
  const cleaned = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return "Updated";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function classifyActivity(action: string, targetType: string): ActivityKind {
  const blob = `${action} ${targetType}`.toLowerCase();
  if (/fail|delete|trash|overdue|error|cancel/.test(blob)) return "alert";
  if (/paid|payment|invoice|bill/.test(blob)) return "invoice";
  if (/complete|deliver|sent|select/.test(blob)) return "done";
  if (/sms|message|email/.test(blob)) return "message";
  if (/client|booking|schedule/.test(blob)) return "client";
  return "gallery";
}

function calendarDayDiff(iso: string): number | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  const start = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  return Math.round((start(now) - start(d)) / 86400000);
}

function activityDayLabel(iso: string): string {
  const diff = calendarDayDiff(iso);
  if (diff === null || diff < 0) return "Earlier";
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Earlier";
}

function formatActivityTime(iso: string): string {
  const diff = calendarDayDiff(iso);
  if (diff === null) return "";
  const d = new Date(iso);
  if (diff <= 0) {
    const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (mins < 1) return "Now";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  }
  if (diff === 1) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupActivity(rows: ActivityRow[]): { label: string; rows: ActivityRow[] }[] {
  const groups: { label: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const label = activityDayLabel(row.when);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

function Pulse({ className }: { className?: string }) {
  return <span className={cn("inline-block animate-pulse rounded-md bg-[#EFE8DC]", className)} />;
}

function SegmentBar({ percent: value, tone }: { percent: number; tone: "gold" | "sage" | "ink" | "burgundy" }) {
  const count = 28;
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * count);
  const color = {
    gold: "bg-studio-gold",
    sage: "bg-studio-sage",
    ink: "bg-studio-ink",
    burgundy: "bg-studio-burgundy",
  }[tone];
  return (
    <div className="flex h-3 items-end gap-[3px]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn("h-2.5 w-[3px] rounded-full", i < filled ? color : "bg-[#E7E0D4]")}
        />
      ))}
    </div>
  );
}

const QUICK_LINKS = [
  { href: "/dashboard/galleries", label: "Galleries", icon: GalleryHorizontal },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/schedules", label: "Schedules", icon: CalendarDays },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/storage", label: "Storage", icon: HardDrive },
  { href: "/dashboard/sms", label: "SMS", icon: MessageSquare },
] as const;

function ActivityMark({ row }: { row: ActivityRow }) {
  if (row.kind === "gallery" || row.kind === "client") {
    return (
      <span
        className={cn(
          "relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold",
          activityTone(row.target),
        )}
      >
        {activityInitials(row.target)}
      </span>
    );
  }
  const Icon = ACTIVITY_ICON[row.kind];
  return (
    <span className={cn("relative z-10 flex h-9 w-9 items-center justify-center rounded-full", ACTIVITY_WELL[row.kind])}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export default function DashboardPage() {
  const { openMobileNav } = useShellChrome();
  const [createOpen, setCreateOpen] = useState(false);
  const [folders, setFolders] = useState<ApiFolder[]>([]);
  const [catalog, setCatalog] = useState<ApiFolder[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("there");
  const [salutation, setSalutation] = useState("Welcome");
  const [clientNameById, setClientNameById] = useState<Map<string, string>>(new Map());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dashboardActivity, setDashboardActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    setGreeting(firstNameFromAuth());
    const hour = new Date().getHours();
    setSalutation(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setStats(null);
        setDashboardActivity([]);
        return;
      }

      const [dashResult, folderRows] = await Promise.all([
        fetchDashboard()
          .then((v) => ({ ok: true as const, v }))
          .catch((e: unknown) => ({ ok: false as const, e })),
        listFolders().catch(() => [] as ApiFolder[]),
      ]);

      if (!dashResult.ok) {
        if (dashResult.e instanceof DashboardApiError && dashResult.e.status === 401) return;
        console.warn("[dashboard] GET /api/dashboard failed, using folder/client lists", dashResult.e);
        setStats(null);
        setDashboardActivity([]);
        setCatalog(folderRows);
        setFolders(folderRows);
        const clientsRes = await listClients().catch(() => ({
          count: 0,
          clients: [] as { _id: string; name: string }[],
        }));
        setClientCount(clientsRes.count ?? clientsRes.clients.length);
        const map = new Map<string, string>();
        for (const c of clientsRes.clients) map.set(c._id, c.name);
        setClientNameById(map);
        return;
      }

      const d = dashResult.v;
      setStats(d.stats);
      const fromUser = firstWordFromName(d.user.name);
      setGreeting(fromUser || firstNameFromAuth());
      const recent = d.recentGalleries.map(dashboardRecentGalleryToApiFolder);
      setFolders(recent);
      setCatalog(folderRows.length ? folderRows : recent);
      setClientCount(d.stats.totalClients);
      setClientNameById(new Map());
      setDashboardActivity(
        d.activity.map((a) => ({
          action: phraseCase(a.action),
          target: a.targetName?.trim() || phraseCase(a.targetType || "Studio"),
          when: a.at,
          galleryId: a.galleryId,
          kind: classifyActivity(a.action, `${a.targetType ?? ""} ${a.targetName ?? ""}`),
        })),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const pipeline = useMemo(() => {
    let draft = 0;
    let selectionPending = 0;
    let completed = 0;
    for (const f of catalog) {
      const s = apiFolderStatusToUi(f.status);
      if (s === "COMPLETED") completed += 1;
      else if (s === "SELECTION_PENDING") selectionPending += 1;
      else draft += 1;
    }
    return { draft, selectionPending, completed };
  }, [catalog]);

  const displayStats = useMemo(() => {
    if (stats) return stats;
    return {
      totalClients: clientCount,
      totalGalleries: catalog.length,
      inProgressGalleries: pipeline.draft + pipeline.selectionPending,
      completedGalleries: pipeline.completed,
    };
  }, [stats, clientCount, catalog.length, pipeline]);

  const recentGalleries = useMemo(() => {
    return [...folders]
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""))
      .slice(0, DASHBOARD_HOME_LIST_LIMIT);
  }, [folders]);

  const derivedActivity = useMemo(() => {
    return [...catalog]
      .map((f) => {
        const displayName = f.eventName?.trim() || getFolderClientName(f, clientNameById);
        const created = f.createdAt ?? "";
        const updated = f.updatedAt ?? "";
        const when = updated || created;
        const isLikelyNew =
          created &&
          (!updated || updated === created || new Date(updated).getTime() - new Date(created).getTime() < 120000);
        return {
          action: isLikelyNew ? "New gallery" : "Gallery updated",
          target: displayName,
          when,
          galleryId: f._id,
          kind: "gallery" as const,
        };
      })
      .filter((a) => a.when)
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, DASHBOARD_HOME_LIST_LIMIT);
  }, [catalog, clientNameById]);

  const recentActivity = useMemo(() => {
    const rows = stats ? dashboardActivity : derivedActivity;
    return rows.slice(0, 5);
  }, [stats, dashboardActivity, derivedActivity]);

  const galleryCards = recentGalleries.slice(0, 6);
  const activityRows = recentActivity;
  const activityGroups = useMemo(() => groupActivity(activityRows), [activityRows]);

  const clientsWithWork = useMemo(() => {
    const ids = new Set<string>();
    for (const f of catalog) {
      const id = getFolderClientId(f);
      if (id) ids.add(id);
    }
    return ids.size;
  }, [catalog]);

  const showPulse = loading && !stats && catalog.length === 0;
  const galleryPct = percent(displayStats.completedGalleries, displayStats.totalGalleries);
  const inProgressPct = percent(displayStats.inProgressGalleries, displayStats.totalGalleries);
  const clientPct = percent(clientsWithWork, displayStats.totalClients);
  const kpiCards = [
    {
      label: "Galleries",
      meta: "All time",
      value: formatCount(displayStats.totalGalleries),
      of: displayStats.totalGalleries === 1 ? "gallery" : "total",
      hint: `${formatCount(displayStats.inProgressGalleries)} still open`,
      pct: `${galleryPct}%`,
      percent: galleryPct,
      tone: "gold" as const,
    },
    {
      label: "Clients",
      meta: "Directory",
      value: formatCount(displayStats.totalClients),
      of: "in the studio",
      hint:
        displayStats.totalClients > 0
          ? `${formatCount(clientsWithWork)} with a gallery`
          : "No clients yet",
      pct: `${clientPct}%`,
      percent: clientPct,
      tone: "ink" as const,
    },
    {
      label: "In progress",
      meta: "Now",
      value: formatCount(displayStats.inProgressGalleries),
      of: "open",
      hint: "Draft or selecting",
      pct: `${inProgressPct}%`,
      percent: inProgressPct,
      tone: "gold" as const,
    },
    {
      label: "Completed",
      meta: "Delivered",
      value: formatCount(displayStats.completedGalleries),
      of: "galleries",
      hint: "Finished work",
      pct: `${galleryPct}%`,
      percent: galleryPct,
      tone: "sage" as const,
    },
  ];

  return (
    <DashboardPageLayout className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-studio-ink transition hover:bg-white lg:hidden"
            aria-label="Open menu"
            onClick={openMobileNav}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight text-studio-ink">Overview</h1>
            <p className="mt-0.5 text-sm text-studio-taupe">
              {salutation}, {greeting}. Here&apos;s how your studio is performing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationsBell />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <article key={card.label} className={cn(CARD, "px-4 py-4")}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13px] font-medium text-studio-ink">{card.label}</p>
              <p className="text-[11px] text-studio-taupe">{card.meta}</p>
            </div>
            {showPulse ? (
              <Pulse className="mt-4 h-8 w-24" />
            ) : (
              <p className="mt-3 text-[28px] leading-tight font-semibold tracking-tight text-studio-ink tabular-nums">
                {card.value}{" "}
                <span className="text-[13px] font-medium text-studio-taupe">{card.of}</span>
              </p>
            )}
            <div className="mt-4">
              <SegmentBar percent={showPulse ? 0 : card.percent} tone={card.tone} />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 text-[12px]">
              <span className="text-studio-taupe">{card.hint}</span>
              <span className="font-medium text-studio-ink">{card.pct}</span>
            </div>
          </article>
        ))}
      </section>

      <section aria-label="Quick access" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-2.5 rounded-xl border border-[#e8e8e8] bg-[#f5f5f5] px-3 py-2.5 text-[13px] font-medium text-black shadow-[0_1px_2px_rgba(26,22,18,0.04)] transition hover:bg-[#ececec]"
          >
            <Icon className="h-4 w-4 shrink-0 text-black" aria-hidden />
            {label}
          </Link>
        ))}
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-[13px] font-medium text-studio-ink">Recent galleries</h2>
            <Link href="/dashboard/galleries" className="inline-flex items-center gap-1 text-[12px] font-medium text-studio-taupe transition hover:text-studio-ink">
              View all
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {showPulse ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-[22px] border border-studio-line bg-white p-4">
                  <Pulse className="h-28 w-full rounded-xl" />
                  <Pulse className="mt-4 h-4 w-40" />
                  <Pulse className="mt-2 h-3 w-24" />
                </div>
              ))}
            </div>
          ) : galleryCards.length === 0 ? (
            <div className={cn(CARD, "mt-3 px-2 py-12 text-center")}>
              <p className="text-sm font-medium text-studio-ink">No galleries yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-studio-taupe">
                Create a gallery to start sharing proofs.
              </p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-studio-ink px-3 py-2 text-[13px] font-medium text-white"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New gallery
              </button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {galleryCards.map((folder) => (
                <RecentGalleryCard key={folder._id} folder={folder} clientNameById={clientNameById} />
              ))}
            </div>
          )}
        </div>

        <article className={cn(CARD, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-3 border-b border-[#F0EBE3] px-4 py-3.5 sm:px-5">
            <h2 className="text-[13px] font-medium text-studio-ink">Recent activity</h2>
            <Link href="/dashboard/galleries" className="inline-flex items-center gap-1 text-[12px] font-medium text-studio-taupe transition hover:text-studio-ink">
              See all
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {showPulse ? (
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Pulse className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Pulse className="h-3.5 w-32" />
                    <Pulse className="mt-2 h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : activityRows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#F3E6C8] text-[#8A6A2F]">
                <GalleryHorizontal className="h-4 w-4" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-medium text-studio-ink">No activity yet</p>
              <p className="mx-auto mt-1 max-w-[220px] text-[13px] leading-relaxed text-studio-taupe">
                New galleries and updates will show up here.
              </p>
            </div>
          ) : (
            <div className="px-2 py-3 sm:px-3">
              {activityGroups.map((group) => (
                <section key={group.label} className="mt-3 first:mt-0">
                  <h3 className="px-2 text-[10px] font-semibold tracking-[0.16em] text-studio-taupe uppercase">
                    {group.label}
                  </h3>
                  <ul className="mt-1">
                    {group.rows.map((row, idx) => {
                      const last = idx === group.rows.length - 1;
                      const body = (
                        <>
                          <span className="relative flex w-9 shrink-0 justify-center">
                            {last ? null : (
                              <span className="absolute top-5 bottom-0 left-1/2 w-px -translate-x-1/2 bg-[#E6DDD0]" />
                            )}
                            <ActivityMark row={row} />
                          </span>
                          <span className={cn("min-w-0 flex-1 pt-1.5", last ? "pb-0.5" : "pb-4")}>
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="truncate font-display text-[15px] leading-tight text-studio-ink">
                                {row.target}
                              </span>
                              <time
                                dateTime={row.when}
                                className="shrink-0 text-[11px] text-studio-taupe tabular-nums"
                                suppressHydrationWarning
                              >
                                {formatActivityTime(row.when)}
                              </time>
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-studio-taupe">{row.action}</span>
                          </span>
                        </>
                      );
                      return (
                        <li key={`${row.target}-${row.when}-${idx}`}>
                          {row.galleryId ? (
                            <Link
                              href={`/dashboard/folder/${row.galleryId}`}
                              className="flex gap-3 rounded-xl px-2 transition hover:bg-[#f6f3ee]"
                            >
                              {body}
                            </Link>
                          ) : (
                            <div className="flex gap-3 rounded-xl px-2">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </article>
      </section>

      <CreateFolderModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => void refresh()} />
    </DashboardPageLayout>
  );
}

